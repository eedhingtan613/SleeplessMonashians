"""
api/storage.py

Persistence layer for processed email results and human review actions.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


DB_PATH = Path(os.getenv("SDOC_DB_PATH", "data/sdoc.db"))


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    return conn


def init_db() -> None:
    """Create the database tables if they do not already exist."""

    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS results (
                email_id TEXT PRIMARY KEY,
                result_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_id TEXT NOT NULL,
                field TEXT,
                corrected_value TEXT,
                action TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        # Source snapshots let the UI reopen generated emails/documents after
        # the generator's temporary folder has been deleted.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS source_emails (
                email_id TEXT PRIMARY KEY,
                source_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS source_documents (
                email_id TEXT NOT NULL,
                which_doc TEXT NOT NULL,
                path TEXT NOT NULL,
                content BLOB,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (email_id, which_doc)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS validation_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset TEXT NOT NULL,
                seed INTEGER,
                requested_n INTEGER,
                processed INTEGER NOT NULL,
                ok INTEGER NOT NULL,
                mismatches INTEGER NOT NULL,
                needs_review INTEGER NOT NULL,
                llm_enabled INTEGER NOT NULL,
                rules_score REAL,
                evaluation_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        # Migration for databases created before rules_score was recorded.
        validation_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(validation_runs)").fetchall()
        }
        if "rules_score" not in validation_columns:
            conn.execute(
                "ALTER TABLE validation_runs ADD COLUMN rules_score REAL"
            )

        conn.commit()


def save_result(email_id: str, result: dict[str, Any]) -> None:
    """Insert or update a processed EmailResult."""

    now = datetime.now(timezone.utc).isoformat()

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO results (email_id, result_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(email_id)
            DO UPDATE SET
                result_json = excluded.result_json,
                updated_at = excluded.updated_at
            """,
            (
                email_id,
                json.dumps(result),
                now,
            ),
        )

        conn.commit()


def save_results(results: dict[str, Any]) -> None:
    """Save multiple EmailResult objects/dictionaries."""

    for email_id, result in results.items():
        if hasattr(result, "to_dict"):
            result = result.to_dict()

        save_result(email_id, result)


def get_result(email_id: str) -> Optional[dict[str, Any]]:
    """Return one stored result."""

    with _connect() as conn:
        row = conn.execute(
            """
            SELECT result_json
            FROM results
            WHERE email_id = ?
            """,
            (email_id,),
        ).fetchone()

    if row is None:
        return None

    return json.loads(row["result_json"])


def get_all_results() -> list[dict[str, Any]]:
    """Return all stored results."""

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT result_json
            FROM results
            ORDER BY email_id
            """
        ).fetchall()

    return [json.loads(row["result_json"]) for row in rows]


def get_email_summaries() -> list[dict[str, Any]]:
    """
    Return the small representation required by the inbox screen.
    """

    results = get_all_results()

    summaries = []

    for result in results:
        classification = result.get("classification") or {}

        summaries.append(
            {
                "email_id": result.get("email_id"),
                "category": classification.get("category"),
                "status": result.get("status"),
                "needs_review": result.get("status") == "NEEDS_REVIEW",
                "has_defect": result.get("has_defect", False),
                "review_reason": result.get("review_reason"),
            }
        )

    return summaries


def get_review_queue() -> list[dict[str, Any]]:
    """Return only emails that currently require human review."""

    return [
        result
        for result in get_all_results()
        if result.get("status") == "NEEDS_REVIEW"
    ]


def save_review(
    email_id: str,
    action: str,
    field: Optional[str] = None,
    corrected_value: Optional[str] = None,
) -> int:
    """Persist a human review action."""

    now = datetime.now(timezone.utc).isoformat()

    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO reviews (
                email_id,
                field,
                corrected_value,
                action,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                email_id,
                field,
                corrected_value,
                action,
                now,
            ),
        )

        conn.commit()

        return int(cursor.lastrowid)


def get_reviews(email_id: str) -> list[dict[str, Any]]:
    """Return the review history for one email."""

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                email_id,
                field,
                corrected_value,
                action,
                created_at
            FROM reviews
            WHERE email_id = ?
            ORDER BY id
            """,
            (email_id,),
        ).fetchall()

    return [dict(row) for row in rows]


def update_result_after_review(
    email_id: str,
    action: str,
    field: Optional[str] = None,
    corrected_value: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """
    Apply the review to the stored API result.

    This is intentionally a platform-level representation of the human
    decision. It does not modify P/I's extraction rules.
    """

    result = get_result(email_id)

    if result is None:
        return None

    notes = result.setdefault("notes", [])

    if action == "confirm":
        result["status"] = "OK"
        result["review_reason"] = None

        notes.append("Human reviewer confirmed the result.")

    elif action == "correct":
        if not field:
            raise ValueError(
                "field is required when action='correct'"
            )

        if corrected_value is None:
            raise ValueError(
                "corrected_value is required when action='correct'"
            )

        correction_applied = False

        for comparison in result.get("comparisons", []):
            if comparison.get("field") != field:
                continue

            comparison["human_correction"] = corrected_value
            comparison["reviewed"] = True
            correction_applied = True
            break

        result["status"] = "OK"
        result["review_reason"] = None

        if correction_applied:
            notes.append(
                f"Human reviewer corrected {field} to "
                f"{corrected_value}."
            )
        else:
            # Some escalations happen before comparisons exist
            # (for example unreadable/missing documents).
            result.setdefault("human_corrections", {})[field] = corrected_value

            notes.append(
                f"Human reviewer supplied {field}: "
                f"{corrected_value}."
            )

    else:
        raise ValueError(
            "action must be either 'confirm' or 'correct'"
        )

    save_result(email_id, result)

    return result


def save_source_email(email: dict[str, Any]) -> None:
    """Persist the original email record for the currently loaded dataset."""
    email_id = email.get("email_id")
    if not email_id:
        return

    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO source_emails (email_id, source_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(email_id)
            DO UPDATE SET
                source_json = excluded.source_json,
                updated_at = excluded.updated_at
            """,
            (email_id, json.dumps(email), now),
        )
        conn.commit()


def save_source_document(
    email_id: str,
    which_doc: str,
    path: str,
    content: Optional[bytes],
) -> None:
    """Persist one source attachment exactly as supplied to the pipeline."""
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO source_documents (
                email_id, which_doc, path, content, updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(email_id, which_doc)
            DO UPDATE SET
                path = excluded.path,
                content = excluded.content,
                updated_at = excluded.updated_at
            """,
            (email_id, which_doc, path, content, now),
        )
        conn.commit()


def get_source_email(email_id: str) -> Optional[dict[str, Any]]:
    """Return the stored source email for the current dataset."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT source_json FROM source_emails WHERE email_id = ?",
            (email_id,),
        ).fetchone()

    return json.loads(row["source_json"]) if row else None


def get_source_document(email_id: str, which_doc: str) -> Optional[dict[str, Any]]:
    """Return stored attachment metadata and bytes for SI or BL."""
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT path, content
            FROM source_documents
            WHERE email_id = ? AND which_doc = ?
            """,
            (email_id, which_doc),
        ).fetchone()

    if row is None:
        return None

    return {"path": row["path"], "content": row["content"]}


def clear_source_snapshots() -> None:
    """Remove source snapshots from the previous dataset run."""
    with _connect() as conn:
        conn.execute("DELETE FROM source_documents")
        conn.execute("DELETE FROM source_emails")
        conn.commit()

def clear_results() -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM results")
        conn.commit()

def save_validation_run(run: dict[str, Any]) -> int:
    """Persist one generated-dataset validation result for all clients."""
    evaluation = run.get("evaluation")
    if not evaluation:
        raise ValueError("validation run requires an evaluation")

    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO validation_runs (
                dataset, seed, requested_n, processed, ok, mismatches,
                needs_review, llm_enabled, rules_score, evaluation_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run.get("dataset") or "unknown",
                run.get("seed"),
                run.get("requested_n"),
                int(run.get("processed") or 0),
                int(run.get("ok") or 0),
                int(run.get("mismatches") or 0),
                int(run.get("needs_review") or 0),
                1 if run.get("llm_enabled") else 0,
                run.get("rules_score"),
                json.dumps(evaluation),
                now,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def get_validation_runs(limit: int = 5) -> list[dict[str, Any]]:
    """Return newest shared validation runs first."""
    limit = max(1, min(int(limit), 50))
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, dataset, seed, requested_n, processed, ok, mismatches,
                   needs_review, llm_enabled, rules_score, evaluation_json, created_at
            FROM validation_runs
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [
        {
            "runId": str(row["id"]),
            "dataset": row["dataset"],
            "seed": row["seed"],
            "requested_n": row["requested_n"],
            "processed": row["processed"],
            "ok": row["ok"],
            "mismatches": row["mismatches"],
            "needs_review": row["needs_review"],
            "llm_enabled": bool(row["llm_enabled"]),
            "rules_score": row["rules_score"],
            "evaluation": json.loads(row["evaluation_json"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def clear_validation_runs() -> None:
    """Clear the shared validation-history table."""
    with _connect() as conn:
        conn.execute("DELETE FROM validation_runs")
        conn.commit()

