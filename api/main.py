"""
api/main.py

Platform API for the Shipping Document Verification system.

X / Platform responsibilities:
- expose the pipeline through HTTP
- store processed results
- provide data to the frontend
- expose the human review queue
- persist human review actions
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import os
import json

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sdoc.core.classify import classify as rule_classify
from sdoc.core.contract import CONFIDENCE_THRESHOLD
from sdoc.core.pipeline import FolderSource, process_email, run
from sdoc.core.ingest import ingest, poppler_path
from sdoc.core.aliases import learn

from api.scoring import score_all
from api.storage import (  # noqa: I001
    get_all_results,
    get_email_summaries,
    get_result,
    get_review_queue,
    get_reviews,
    init_db,
    save_result,
    save_results,
    save_review,
    update_result_after_review,
    clear_results,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BUNDLE_PATH = Path(
    os.getenv(
        "SDOC_BUNDLE_PATH",
        "sdoc-hackathon-bundle",
    )
)

GENERATOR_PATH = Path(
    os.getenv(
        "SDOC_GENERATOR_PATH",
        "sdoc-hackathon-docker/data_v2",
    )
)

def get_source() -> FolderSource:
    """Return the original supplied hackathon dataset."""
    if not (BUNDLE_PATH / "inbox").is_dir():
        raise RuntimeError(f"Dataset folder not found: {BUNDLE_PATH}")
    return FolderSource(BUNDLE_PATH)

def generate_source(seed: int, n: int = 500) -> tuple[FolderSource, Path]:
    """
    Generate a temporary dataset using the organisers' generator.

    Returns:
        FolderSource pointing at the generated dataset
        Path to the temporary directory
    """

    # Use an absolute path so subprocess does not accidentally
    # duplicate the generator directory.
    generator = (GENERATOR_PATH / "generate.py").resolve()

    if not generator.exists():
        raise RuntimeError(
            f"Dataset generator not found: {generator}"
        )

    temp_dir = Path(
        tempfile.mkdtemp(prefix=f"sdoc_seed_{seed}_")
    ).resolve()

    try:
        subprocess.run(
            [
                sys.executable,
                str(generator),
                "--seed",
                str(seed),
                "--n",
                str(n),
                "--out",
                str(temp_dir),
            ],
            cwd=str(generator.parent),
            check=True,
            capture_output=True,
            text=True,
        )

    except subprocess.CalledProcessError as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)

        raise RuntimeError(
            f"Dataset generation failed: {exc.stderr}"
        ) from exc

    return FolderSource(temp_dir), temp_dir


# ---------------------------------------------------------------------------
# Gemini fallback
# ---------------------------------------------------------------------------
#
# The rules settle ~95% of emails on their own. Only the ones they cannot
# classify confidently reach the model, and those go in a couple of BATCHED
# requests rather than one call each - free-tier quotas count requests, so
# per-email calls exhaust a day's allowance in a single run.
#
# The classifications the model has already returned are committed under
# .cache/llm/ and copied into the image, so this works with no API key at
# runtime. If the model is unavailable for any reason the pipeline falls back
# to rules alone and still scores ~0.99; it is an enhancement, not a
# dependency.

def _get_llm():
    """Return the classifier, or None if the fallback is unavailable."""
    if os.environ.get("SDOC_LLM_MODE", "").lower() == "off":
        return None
    try:
        from sdoc.llm.gemini import classify_email
        return classify_email
    except Exception as exc:                       # missing package, bad config
        print(f"[api] Gemini fallback unavailable, using rules only: {exc}")
        return None


def _warm_llm_cache(source: FolderSource) -> None:
    """Batch the low-confidence emails into a few requests, before the run."""
    try:
        from sdoc.llm.gemini import prefetch_classifications
        unsure = [
            email
            for email in source.emails()
            if rule_classify(email).confidence < CONFIDENCE_THRESHOLD
        ]
        if unsure:
            prefetch_classifications(unsure)
    except Exception as exc:
        print(f"[api] prefetch skipped: {exc}")


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Shipping Document Verification API",
    description=(
        "API for email classification, SI/BL comparison "
        "and human review."
    ),
    version="1.1.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class ReviewRequest(BaseModel):
    action: Literal["confirm", "correct"]
    field: Optional[str] = None
    corrected_value: Optional[str] = None
    label_seen: Optional[str] = None

class ProcessRequest(BaseModel):
    seed: Optional[int] = None
    n: int = 500


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    cache_dir = Path(os.getenv("SDOC_LLM_CACHE", ".cache/llm"))

    return {
        "status": "ok",
        "service": "shipping-document-verification",
        "version": "1.1.0",
        "revision": os.getenv("K_REVISION", "local"),
        "capabilities": {
            "llm_enabled": _get_llm() is not None,
            "llm_cache_present": (
                cache_dir.is_dir()
                and any(cache_dir.glob("*.json"))
            ),
            "poppler_enabled": poppler_path() is not None,
        },
    }

# ---------------------------------------------------------------------------
# Process entire inbox
# ---------------------------------------------------------------------------

@app.post("/process")
def process_inbox(request: ProcessRequest = ProcessRequest()):
    """
    Run the pipeline over either:

    - the supplied dataset when no seed is provided
    - a newly generated dataset when a seed is provided

    Results are persisted for the frontend.
    """

    temp_dir = None

    try:
        # ---------------------------------------------------------
        # Select dataset
        # ---------------------------------------------------------

        if request.seed is None:
            source = get_source()
            dataset_name = "supplied"
        else:
            if request.n < 1 or request.n > 2000:
                raise HTTPException(
                    status_code=400,
                    detail="n must be between 1 and 2000",
                )

            source, temp_dir = generate_source(
                seed=request.seed,
                n=request.n,
            )

            dataset_name = f"seed-{request.seed}"

        # ---------------------------------------------------------
        # Run pipeline
        # ---------------------------------------------------------

        llm = _get_llm()

        if llm is not None:
            _warm_llm_cache(source)

        results = run(
            source,
            llm_classify=llm,
        )
        # ---------------------------------------------------------
        # Score current run
        # ---------------------------------------------------------

        evaluation = None

        if request.seed is not None and temp_dir is not None:
            ground_truth_path = temp_dir / "ground_truth.json"

            if ground_truth_path.exists():
                ground_truth = json.loads(
                    ground_truth_path.read_text(encoding="utf-8")
                )

                submission = {
                    email_id: result.to_submission()
                    for email_id, result in results.items()
                }

                scores = score_all(
                    ground_truth,
                    submission,
                )

                evaluation = {
                    "final_score": scores["final_score"],
                    "macro_f1": scores["stage1"]["macro_f1"],
                    "defect_f1": scores["stage3"]["defect_f1"],
                    "defect_precision": scores["stage3"]["defect_precision"],
                    "defect_recall": scores["stage3"]["defect_recall"],
                    "end_to_end": scores["end_to_end"]["rate"],
                    "end_to_end_success": scores["end_to_end"]["success"],
                    "end_to_end_total": scores["end_to_end"]["total"],
                }
            
            clear_results()
            save_results(results)
            _set_loaded_dataset(dataset_name)

            review_count = sum(
                1
                for result in results.values()
                if result.needs_review
            )

            mismatch_count = sum(
                1
                for result in results.values()
                if result.has_defect
            )

            ok_count = sum(
                1
                for result in results.values()
                if result.status == "OK"
            )

            return {
            "message": "Inbox processed successfully",
            "dataset": dataset_name,
            "seed": request.seed,
            "requested_n": request.n,
            "processed": len(results),
            "ok": ok_count,
            "needs_review": review_count,
            "mismatches": mismatch_count,
            "llm_enabled": llm is not None,
            "evaluation": evaluation,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline failed: {exc}",
        ) from exc

    finally:
        # The processed results are already in SQLite, so the generated
        # files no longer need to stay on disk.
        if temp_dir is not None:
            shutil.rmtree(
                temp_dir,
                ignore_errors=True,
            )

# ---------------------------------------------------------------------------
# Process one existing dataset email
# ---------------------------------------------------------------------------

@app.post("/process/{email_id}")
def process_one_email(email_id: str):
    """
    Reprocess one email from the supplied dataset.
    Useful for retry handling.
    """

    try:
        source = get_source()

        email = next(
            (
                item
                for item in source.emails()
                if item.get("email_id") == email_id
            ),
            None,
        )

        if email is None:
            raise HTTPException(
                status_code=404,
                detail=f"Email {email_id} not found",
            )

        result = process_email(email, source, llm_classify=_get_llm())

        payload = result.to_dict()

        save_result(email_id, payload)

        return payload

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Inbox
# ---------------------------------------------------------------------------

@app.get("/emails")
def list_emails():
    """
    Return lightweight email summaries for the frontend inbox.
    """

    emails = get_email_summaries()

    return {
        "count": len(emails),
        "emails": emails,
    }


# ---------------------------------------------------------------------------
# All reports in one response
# ---------------------------------------------------------------------------
#
# MUST be declared before /emails/{email_id}: FastAPI matches routes in order,
# so otherwise "full" is captured as an email id.

@app.get("/emails/full")
def all_full_reports():
    """
    Every stored EmailResult in one response.

    The frontend inbox should use /emails (summaries) and fetch a single full
    report when a row is opened. This endpoint exists for tooling that needs
    the lot - scoring scripts, exports - where 520 separate requests is slow.
    """

    results = get_all_results()

    return {
        "count": len(results),
        "results": results,
    }


# ---------------------------------------------------------------------------
# Individual report
# ---------------------------------------------------------------------------

@app.get("/emails/{email_id}")
def get_email(email_id: str):
    """
    Return the complete EmailResult.to_dict() representation.
    """

    result = get_result(email_id)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"{email_id} has not been processed. "
                "Run POST /process first."
            ),
        )

    return result


# ---------------------------------------------------------------------------
# Amendment request
# ---------------------------------------------------------------------------

@app.get("/emails/{email_id}/amendment")
def amendment_draft(email_id: str, refresh: bool = False):
    """
    Draft the email an operator would send to have the draft BL corrected.

    Only meaningful for a MISMATCH. The discrepancy is already settled
    deterministically by compare.py; the model writes prose about it and a
    human reads the result before sending. If the model is unavailable a
    plain template is used, so the endpoint always answers.
    """

    stored = get_result(email_id)

    if stored is None:
        raise HTTPException(
            status_code=404,
            detail=f"{email_id} has not been processed yet. Run POST /process.",
        )

    if stored.get("status") != "MISMATCH":
        raise HTTPException(
            status_code=409,
            detail="An amendment request only applies to a confirmed mismatch.",
        )

    try:
        from sdoc.core.contract import (Classification, ExtractedField,
                                        FieldComparison, Source)
        from sdoc.llm.amend import draft_amendment
    except Exception as exc:
        raise HTTPException(status_code=503,
                            detail=f"Drafting unavailable: {exc}") from exc

    def _field(d: dict) -> ExtractedField:
        src = (d or {}).get("source") or {}
        return ExtractedField(
            value=(d or {}).get("value"), raw=(d or {}).get("raw"),
            confidence=(d or {}).get("confidence", 0.0),
            source=Source(file=src.get("file", ""), line=src.get("line", -1),
                          label_seen=src.get("label_seen", ""),
                          snippet=src.get("snippet", "")),
        )

    class _R:
        email_id = stored["email_id"]
        status = stored["status"]
        comparisons = [
            FieldComparison(field=c["field"], status=c["status"],
                            si=_field(c.get("si")), bl=_field(c.get("bl")))
            for c in stored.get("comparisons", [])
        ]
        si = bl = None

    source_email = next(
        (e for e in get_source().emails() if e["email_id"] == email_id), None
    )

    # Pass the refresh flag down to draft_amendment
    draft = draft_amendment(_R, source_email, refresh=refresh)

    if draft is None:
        raise HTTPException(status_code=409,
                            detail="No confirmed discrepancy to write about.")

    return {
        "email_id": email_id,
        "defect_fields": stored.get("defect_fields", []),
        **draft,
    }


# ---------------------------------------------------------------------------
# Source documents - the email and its attachments, with highlights
# ---------------------------------------------------------------------------
#
# Generated datasets are deleted once processed, but reuse filenames such as
# email_004_SI.txt. Serving documents after a seeded run would therefore show
# the SUPPLIED dataset's file under a generated email's id - silently wrong.
# So we record which dataset is loaded and refuse when it is not ours.

def _dataset_marker() -> Path:
    from api.storage import DB_PATH
    return Path(DB_PATH).parent / "dataset.txt"


def _set_loaded_dataset(name: str) -> None:
    m = _dataset_marker()
    m.parent.mkdir(parents=True, exist_ok=True)
    m.write_text(name, encoding="utf-8")


def _loaded_dataset() -> str:
    m = _dataset_marker()
    return m.read_text(encoding="utf-8").strip() if m.exists() else "supplied"


def _source_email(email_id: str) -> dict:
    if _loaded_dataset() != "supplied":
        raise HTTPException(
            status_code=409,
            detail=(f"The loaded results come from a generated dataset "
                    f"({_loaded_dataset()}), whose files are not kept. "
                    f"Run POST /process without a seed to view documents."),
        )
    email = next((e for e in get_source().emails()
                  if e["email_id"] == email_id), None)
    if email is None:
        raise HTTPException(status_code=404, detail=f"{email_id} not found")
    return email


def _attachment_path(email: dict, which: str) -> str:
    atts = email.get("attachments") or []
    idx = {"si": 0, "bl": 1}[which]
    if idx >= len(atts):
        raise HTTPException(status_code=404,
                            detail=f"This email has no {which.upper()} attachment.")
    return atts[idx]


@app.get("/emails/{email_id}/source")
def email_source(email_id: str):
    """The original email: sender, subject, body and attachment names."""
    email = _source_email(email_id)
    return {
        "email_id": email_id,
        "from": email.get("from"),
        "to": email.get("to"),
        "date": email.get("date") or email.get("received"),
        "subject": email.get("subject"),
        "body": email.get("body"),
        "attachments": email.get("attachments") or [],
    }


@app.get("/emails/{email_id}/document/{which}")
def email_document(email_id: str, which: Literal["si", "bl"]):
    """
    The attachment as the pipeline read it, line by line, with the lines each
    field was extracted from marked. Line numbers are the same ones stored in
    every field's provenance, so the highlights point at exactly the text the
    comparison used.
    """
    email = _source_email(email_id)
    path = _attachment_path(email, which)
    read = ingest(path, get_source().attachment(path))

    # identical split to extract.py, so line N here is line N in provenance
    lines = [l.rstrip() for l in (read.text or "").split("\n")]

    highlights = []
    stored = get_result(email_id)
    for c in (stored or {}).get("comparisons", []):
        src = ((c.get(which) or {}).get("source") or {})
        line = src.get("line", -1)
        if isinstance(line, int) and 1 <= line <= len(lines):
            highlights.append({
                "line": line,
                "field": c["field"],
                "status": c["status"],            # match | mismatch | uncertain
                "label": src.get("label_seen", ""),
            })

    return {
        "email_id": email_id,
        "which": which,
        "path": path,
        "ingest_method": read.method,
        "readable": read.readable,
        "warnings": read.warnings,
        "lines": lines,
        "highlights": highlights,
    }


@app.get("/emails/{email_id}/file/{which}")
def email_file(email_id: str, which: Literal["si", "bl"]):
    """The original attachment file, for "Open original"."""
    email = _source_email(email_id)
    rel = _attachment_path(email, which)
    full = (BUNDLE_PATH / rel).resolve()
    if BUNDLE_PATH.resolve() not in full.parents or not full.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found.")
    return FileResponse(full, filename=full.name)


# ---------------------------------------------------------------------------
# Review queue
# ---------------------------------------------------------------------------

@app.get("/review-queue")
def review_queue():
    """
    Return all cases requiring human review.
    """

    queue = get_review_queue()

    return {
        "count": len(queue),
        "items": queue,
    }


# ---------------------------------------------------------------------------
# Human review
# ---------------------------------------------------------------------------

@app.post("/review/{email_id}")
def review_email(
    email_id: str,
    review: ReviewRequest,
):
    """
    Persist a human decision and update the stored report.

    Example confirmation:

        {
            "action": "confirm"
        }

    Example correction:

        {
            "action": "correct",
            "field": "port_of_loading",
            "corrected_value": "PORT KLANG"
        }
    """

    existing = get_result(email_id)

    if existing is None:
        raise HTTPException(
            status_code=404,
            detail=f"Email {email_id} not found",
        )

    if review.action == "correct":
        if not review.field:
            raise HTTPException(
                status_code=400,
                detail="field is required for a correction",
            )

        if review.corrected_value is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "corrected_value is required "
                    "for a correction"
                ),
            )

        if review.label_seen:
            learn(review.field, review.label_seen)

    review_id = save_review(
        email_id=email_id,
        action=review.action,
        field=review.field,
        corrected_value=review.corrected_value,
    )

    try:
        updated = update_result_after_review(
            email_id=email_id,
            action=review.action,
            field=review.field,
            corrected_value=review.corrected_value,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    return {
        "message": "Review saved",
        "review_id": review_id,
        "result": updated,
    }


# ---------------------------------------------------------------------------
# Review history - useful for demo/debugging
# ---------------------------------------------------------------------------

@app.get("/reviews/{email_id}")
def review_history(email_id: str):
    if get_result(email_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"Email {email_id} not found",
        )

    reviews = get_reviews(email_id)

    return {
        "email_id": email_id,
        "count": len(reviews),
        "reviews": reviews,
    }


# ---------------------------------------------------------------------------
# Debug/status endpoint
# ---------------------------------------------------------------------------

@app.get("/stats")
def stats():
    results = get_all_results()

    return {
        "processed": len(results),
        "ok": sum(
            r.get("status") == "OK"
            for r in results
        ),
        "mismatch": sum(
            r.get("status") == "MISMATCH"
            for r in results
        ),
        "needs_review": sum(
            r.get("status") == "NEEDS_REVIEW"
            for r in results
        ),
    }