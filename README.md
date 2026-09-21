# DocHarbor AI

AI-assisted shipping document verification, with evidence for every decision.

Averis x Monash Hackathon 2026 — team **SleeplessMonashians**

Lee Jia Wey · Nicholas Wong · Tang Wei Zhi · Ooi Hui Yi · Tan Ee Dhing

**Live app: https://sleepless-monashians-vercel.vercel.app**

An operations inbox receives document-check requests mixed in with new
shipping instructions, invoice queries, routine updates and spam. For a check
request, a Shipping Instruction has to be compared against a draft Bill of
Lading before the draft is finalised. Missed requests become delays; manual
comparison is repetitive and easy to get wrong; and the same field is
labelled differently in each document.

This system reads the inbox, works out what each email needs, compares the
seven shipment fields, and — when it cannot read a document reliably — hands
the case to a person with the evidence rather than guessing.

| | |
|---|---|
| Score on the supplied dataset | **0.9995** |
| Held-out mean, 5 unseen datasets | **0.9990** (spread 0.0011) |
| End-to-end | **1.0000** (46/46) |
| Defect precision / recall | **1.000 / 1.000** |
| Handled autonomously | 501 of 520; the other 19 go to review |

---

## Quick start

```bash
git clone <repo> && cd <repo>
pip install -r requirements.txt
python verify_results.py        # ~3 min, expect ALL CHECKS PASSED
```

The supplied dataset is committed, so this works from a clean clone with
nothing else to download.

`verify_results.py` checks the environment, the dataset's checksum, the
pipeline score, the unit tests, the rules-vs-AI comparison, and then
**generates fresh datasets from random seeds** and scores those too — so
every run tests data the pipeline has never seen.

No API key is needed: the model's previous answers are committed under
`.cache/llm/`.

### The deployed service

| | |
|---|---|
| **Web app** | https://sleepless-monashians-vercel.vercel.app |
| API | https://sdoc-api-856612571283.asia-southeast1.run.app |
| API docs | https://sdoc-api-856612571283.asia-southeast1.run.app/docs |

Both are public, no login. The web app (React, on Vercel) talks to the API
(FastAPI, on Google Cloud Run).

Suggested path through the app: open `email_013` from the inbox to see a
confirmed mismatch with its source lines highlighted in both documents, draft
the amendment request, then open **Review Queue** to resolve an escalated
case.

**The demo is shared by everyone viewing it.** Running a generated dataset or
saving a correction changes what every visitor sees. If the inbox shows a
generated dataset rather than the supplied 520 emails, click
**Reset to Default** to restore it.

### Run it locally

```bash
uvicorn api.main:app --port 8080
# then open http://localhost:8080/docs
```

The two run the **same code**, but the deployed one is a container image
built at a point in time: it only picks up changes when it is rebuilt and
redeployed. `docs/DEPLOYMENT.md` covers that, and `score_api.py` tells you
whether the live service is current:

```bash
python score_api.py --url https://sdoc-api-856612571283.asia-southeast1.run.app --workers 4
```

### Run in Docker

```bash
docker build -t sdoc .
docker run -p 8080:8080 sdoc
```

---

## How it works

```
email ─► classify ─► ingest ─► extract ─► compare ─► decide ─► result
                                                        │
                                          confident ────┴──── uncertain
                                              │                   │
                                           report            human review
```

Only document-comparison requests go past classification.

**Deterministic where possible, model where necessary, escalate when neither
is confident.** Rules settle 493 of 520 emails at high confidence; the
remaining 27 go to Gemini in two batched requests. Comparison itself is never
done by the model — asking an LLM whether two documents match produces
answers that shift between runs and invents discrepancies.

Every extracted value carries a confidence and its provenance: the file, the
line number, the literal label matched, and the source text. Below a
confidence threshold a field is escalated rather than compared, which is why
defect precision is 1.000 — **a value that could not be read is never
reported as a discrepancy.**

| Module | Does |
|---|---|
| `sdoc/core/contract.py` | the shapes every stage speaks in |
| `sdoc/core/classify.py` | email → one of five categories, with confidence |
| `sdoc/core/ingest.py` | attachment bytes → text (txt, pdf, docx, xlsx) |
| `sdoc/core/extract.py` | text → 7 fields, with confidence and provenance |
| `sdoc/core/normalize.py` | makes differently-written values comparable |
| `sdoc/core/compare.py` | field verdicts and the escalation decision |
| `sdoc/core/pipeline.py` | orchestration, data-source abstraction |
| `sdoc/llm/gemini.py` | batched fallback when the rules are unsure |
| `api/` | FastAPI service, SQLite persistence, review endpoints |

The data source sits behind an interface, so the file loader can be replaced
with a real mailbox connector without touching the pipeline.

---

## Human review

19 of 520 emails are escalated rather than decided, each with a reason code
and the source evidence:

| reason | means |
|---|---|
| `missing_attachment` | a comparison was asked for, documents weren't attached |
| `unreadable` | attachment present, no text recoverable |
| `wrong_doc_type` | not an SI/BL pair — an invoice or packing list |
| `missing_value` | a required field is blank or a placeholder |

A reviewer confirms or corrects through `POST /review/{email_id}`. The report
regenerates, the status clears, and the decision is written to SQLite with an
audit row — verified to survive a service restart. `api/API_TESTING.md` has
the step-by-step check.

---

## Validation

The organisers' generator ships with the dataset and takes a seed, so we can
build data we have never seen and check we have not overfitted to the 520
emails we were given.

```bash
python compare.py --seeds 7001 7002 7003 --n 500   # rules vs AI, unseen data
python sweep.py --seeds 9111 9222 --n 500          # rules only, any seeds
```

| dataset | rules | + Gemini | end-to-end |
|---|---|---|---|
| supplied (seed 42) | 0.9904 | 0.9995 | 1.0000 |
| held-out × 5 | — | **0.9990** ± 0.0011 | 1.0000 on all |

Defect precision and recall are 1.000 on every dataset tested.

Full reports in `docs/`. Dated score history in `SCORES.md`.

---

## Documentation

| | |
|---|---|
| `docs/DEVELOPMENT.md` | command reference, pipeline internals, known traps |
| `docs/DEPLOYMENT.md` | rebuilding and redeploying the live service |
| `api/API_TESTING.md` | running and testing the service |
| `docs/RESULTS_deep.md` | validation across six datasets |
| `SCORES.md` | dated score log, bugs found by measurement, limitations |

---

## Optional: poppler

Improves PDF text extraction. Without it the pipeline falls back to
pdfplumber and scores ~0.013 lower, with two PDF pairs routed to human review
instead of compared automatically — it degrades into *more review*, not into
wrong answers.

The Docker image installs `poppler-utils`, so the deployed service always has
it. Locally it is optional: unzip a
[poppler-windows release](https://github.com/oschwartz10612/poppler-windows/releases)
anywhere under your home folder and it is discovered automatically — no PATH
changes needed. On Linux `apt install poppler-utils`; on macOS
`brew install poppler`.

`python verify_setup.py` prints where it was found.

---

## A note on the supplied data

`sdoc-hackathon-bundle/` and `sdoc-hackathon-docker/` are committed so that
every verification command in this README runs from a clean clone.

That includes `data_v2/ground_truth.json`. It arrived inside the docker
bundle issued to participants — `docker-compose.yml` mounts it privately at
`/secrets`, so it appears not to have been intended for us. We have not
fitted to it: the held-out results above come from datasets generated with
seeds chosen at random at run time, using the organisers' own `generate.py`,
and `verify_results.py` re-generates fresh ones on every run. The rules are
driven by the label list in `pools.py`, never by email id.

It is committed only because removing it breaks `verify_results.py`,
`compare.py` and `sweep.py`. Anyone can regenerate it byte-identically:

```bash
python sdoc-hackathon-docker/data_v2/generate.py \
    --seed 42 --n 500 --out sdoc-hackathon-docker/data_v2
```

---

## Known limitations

- **Escalation recall 0.95.** One `wrong_doc_type` case (`email_501`) is
  reported OK, so no reviewer would see it.
- **OCR is advisory.** Scanned pages are read by Tesseract, or Gemini vision
  as a fallback, but OCR values are capped at confidence 0.50 and always need
  a person to confirm. Two of the five unreadable files are corrupt, not
  scanned, and cannot be read at all.
- **Synthetic data.** 0.9990 says the pipeline is correct on this generator,
  not that document verification is solved. Real documents bring formats,
  stamps and vocabulary nobody anticipated — which is what the confidence
  gate and the review queue exist for.