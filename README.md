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

The API:

```bash
uvicorn api.main:app --port 8080
# then open http://localhost:8080/docs
```

The web app, in a second terminal (needs Node.js 18 or later):

```bash
cd web
npm ci
npm run dev
# then open http://localhost:5173
```

To point it at your local API rather than the deployed one, create
`web/.env.local` containing one line, then restart `npm run dev`:

```
VITE_API_BASE_URL=http://localhost:8080
```

Create it in an editor, or with
`"VITE_API_BASE_URL=http://localhost:8080" | Out-File -Encoding ascii .env.local`
in PowerShell — PowerShell's `>` writes UTF-16, which Vite cannot read.

The local and deployed services run the **same code**, but the deployed one
is a container image built at a point in time: it only picks up changes when
it is rebuilt and redeployed. `docs/DEPLOYMENT.md` covers that, and
`score_api.py` tells you whether the live service is current:

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
email ─► classify ─► ingest ─► extract ─► normalise ─► compare ─► decide
                                                                     │
                                                   confident ────────┴──── uncertain
                                                       │                       │
                                                    report               human review
```

Only document-comparison requests go past classification.

**Deterministic where possible, model where necessary, escalate when neither
is confident.** Rules settle 493 of 520 emails at high confidence; the
remaining 27 go to Gemini in two batched requests. Comparison itself is never
done by the model — asking an LLM whether two documents match produces
answers that shift between runs and invents discrepancies.

Every extracted value carries a confidence and its provenance: the file, the
line number, the literal label matched, and the source text. Below a
confidence threshold of 0.60 a field is escalated rather than compared, which
is why defect precision is 1.000 — **a value that could not be read is never
reported as a discrepancy.**

| Module | Does |
|---|---|
| `sdoc/core/contract.py` | the shapes every stage speaks in |
| `sdoc/core/classify.py` | email → one of five categories, with confidence |
| `sdoc/core/ingest.py` | attachment bytes → text (txt, pdf, docx, xlsx), OCR for scans |
| `sdoc/core/ocr.py` | scanned pages → text via Tesseract, Gemini vision as fallback |
| `sdoc/core/extract.py` | text → 7 fields, with confidence and provenance |
| `sdoc/core/aliases.py` | field labels learned from reviewer corrections |
| `sdoc/core/normalize.py` | makes differently-written values comparable |
| `sdoc/core/compare.py` | field verdicts and the escalation decision |
| `sdoc/core/pipeline.py` | orchestration, data-source abstraction |
| `sdoc/llm/gemini.py` | batched fallback when the rules are unsure |
| `sdoc/llm/amend.py` | drafts the amendment request for a confirmed mismatch |
| `api/` | FastAPI service, SQLite persistence, review endpoints |
| `web/` | React interface: inbox, document viewer, review workspace |

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
| held-out × 5 | 0.9918 | **0.9990** ± 0.0011 | 1.0000 on all |

Defect precision and recall are 1.000 on every dataset tested.

Full reports in `docs/`. Dated score history in `SCORES.md`.

---

## Written responses

### 1. Problem–solution alignment

The brief describes five problems. Each maps to something the system does,
and each can be seen in the live app.

| Problem in the brief | What DocHarbor AI does |
|---|---|
| Check requests are buried among invoices, SI requests, updates and spam | Classifies every email into one of five categories, reading the **body**, not the subject. Subjects are unreliable: classifying on them scored macro-F1 0.56, against 0.97 on the body. |
| Comparing seven fields across two documents is manual and error-prone | Extracts all seven fields from txt, PDF, Word and Excel, normalises them, and compares. The document viewer shows the SI and BL side by side with the exact source line of each field highlighted. |
| The same field is labelled differently in each document | Recognises label variants ("Port of Loading", "Load Port", "POL") and normalises values: company suffixes, units (LB and MT to kg), and ports compared by **name** rather than UN/LOCODE. Labels a reviewer corrects are learned for next time. |
| A missed discrepancy becomes a correction and a delay | Finds all 46 discrepancies with zero false alarms, then drafts the amendment email asking the counterparty to fix the draft BL. |
| Some cases cannot be decided reliably | Escalates to a person with a reason code and the evidence rather than guessing. Scanned pages are OCR'd so the reviewer confirms a pre-filled form instead of typing from scratch. |

The design choice underneath all of it: operations staff need to be able to
**trust** a flagged discrepancy. So every value is traceable to a line, and
an unreadable value is escalated, never reported as a discrepancy.

### 2. AI and cloud infrastructure integration

**Gemini 3.5 Flash-Lite** does three jobs, and deliberately not a fourth.

| Job | When it runs | Safeguard |
|---|---|---|
| Classification fallback | Only when the rules are below confidence 0.60 — 27 of 520 emails | Batched 15 emails per prompt, so 27 emails cost 2 requests |
| Vision OCR | Only when Tesseract's reading of a scanned page is poor | Every OCR value capped at confidence 0.50, so it can never be compared as fact |
| Amendment drafts | When a reviewer asks, on a confirmed mismatch | The discrepancy is settled first by rules; the model only writes prose about it. A plain template is used if the model is unavailable |
| *Comparing documents* | *Never* | *Comparison is deterministic, so results are reproducible and traceable* |

Every model response is cached by a hash of its prompt, and the cache is
committed. The deployed service reproduces its results with **no API key at
runtime**, and a rate limit cannot break the demo. If the model is
unavailable entirely, the pipeline still scores 0.9904 on rules alone.

We chose Flash-Lite over the larger Flash models on evidence: on this task
both gave identical classification (macro-F1 0.9982, fixing the same seven
emails), while Flash-Lite allows roughly 500 free requests a day against 20.

**Cloud architecture.**

| Layer | Technology |
|---|---|
| Web app | React, Vite and Tailwind, hosted on **Vercel** |
| API | FastAPI, 16 endpoints, in a **Docker** container on **Google Cloud Run** |
| Document readers | Poppler, pdfplumber, python-docx, openpyxl and Tesseract, installed in the image |
| Persistence | SQLite: results, and an audit row for every review decision |
| Model | Gemini 3.5 Flash-Lite through Google AI Studio |

The deployed API and the local pipeline produce byte-identical results,
verified by checksum.

### 3. Testing and feedback

**We have not tested with real operations staff or real shipping documents.**
All evaluation used the organisers' synthetic data. What we did instead:

- **Automated checks.** 50 unit tests, and `verify_results.py`, which runs 22
  checks including freshly generated datasets on every run.
- **Held-out validation.** Five datasets generated from seeds the pipeline
  had never been run against, to rule out tuning to the answer key.
- **Independent scoring.** Results cross-checked with the organisers' own
  scorer, and the live API scored against the local pipeline.
- **Evidence alignment.** All 1,623 highlighted source lines in the dataset
  checked against the stored provenance: none misaligned.

**Feedback from teammates running the system on their own machines and
reviewing the interface** found real defects, each since fixed:

| Found by | Problem | Fix |
|---|---|---|
| Running on Windows | attachments read in the wrong encoding, score 0.58 | decode UTF-8 explicitly |
| Running on a machine with MiKTeX | a same-named PDF tool caused false alarms, precision 0.958 | verify the binary is genuine Poppler |
| Reviewing the interface | "No mismatch detected" shown on emails that were never compared | wording reserved for completed comparisons |
| Reviewing the interface | unreadable fields labelled "Mismatch" | now labelled "Uncertain" |
| Reviewing the interface | "Open original" link returned an error | an endpoint now serves attachments |

The next step is the one we could not do in a hackathon: put the system in
front of an operations team and measure review rate and false-alarm rate on
real documents.

### 4. Coding challenges

Every serious bug was found by measuring, not by reading code. Each is in the
dated history in `SCORES.md`.

| Challenge | Effect | Fix |
|---|---|---|
| Windows read attachments in its default encoding, mangling a bilingual label (`Gross Weight毛重`) | score 0.58 | decode as UTF-8 explicitly |
| A discrepancy changes the port **name** but keeps the same UN/LOCODE | matching on codes would miss 19 of the 46 discrepancies | compare port names; a test guards it |
| In wide PDF columns, a long label wrapped its value to the next line, so label text was read as a value | 2 false alarms, precision 0.958 | detect label fragments and read the wrapped line |
| Placeholders such as `TBA` and `____MT` were compared as real values | fabricated discrepancies | treat them as blank and escalate |
| MiKTeX installs its own `pdftotext` ahead of Poppler's on some machines | false alarms on one teammate's machine only | accept only a binary that identifies as Poppler |
| OCR read `128,544` as `128.544` — a thousand-fold error that parses cleanly | would fabricate a discrepancy | cap OCR confidence below the trust threshold |
| The organisers' generator overwrites its own benchmark if run without `--out` | every later score silently wrong | checksum the ground truth before scoring |
| The deployed container was an old image | live site scored 0.9753 while the code scored 0.9995 | `score_api.py` checks the live service against the code |
| Gemini's daily quota on the larger model was about 20 requests | one run exhausted it | batching, prompt-hash caching, and Flash-Lite |

### 5. Success metrics

On the supplied dataset of 520 emails:

| Metric | Result |
|---|---|
| Organiser score | **0.9995** of 1.0000 |
| Classification accuracy | 0.9981 — one error in 520 |
| Classification macro-F1 | 0.9982 |
| Discrepancies found end to end | **46 of 46** |
| Defect precision | **1.000** — no false alarms |
| Defect recall | **1.000** — none missed |
| Handled without a person | 501 of 520 (96%) |
| Escalation precision / recall | 1.000 / 0.95 |
| Emails needing the model | 27 of 520, in 2 requests |

Generalisation, on five unseen generated datasets:

| Metric | Result |
|---|---|
| Held-out mean | **0.9990**, spread 0.0011 |
| Held-out mean, rules only | 0.9918 |
| Defect precision and recall | 1.000 on every dataset |
| Classification consistency | Gemini makes it 6.5× more consistent across datasets |

In production we would track the measures that matter to an operations
team: false-alarm rate, the share of emails sent to review, time from
request to checked result, and time from discrepancy to amended BL.

### 6. Scalability

**What already scales.**

- **The data source is an interface.** The file loader can be replaced by a
  mailbox connector (Microsoft Graph or IMAP) without touching the pipeline.
- **Each email is processed independently**, so work parallelises, and Cloud
  Run adds instances as load grows.
- **Model cost stays small as volume grows.** Only emails the rules cannot
  classify reach the model — about 5% here — and they are batched and cached.
- **New fields and document types** are additions to the label lists and the
  shared data contract, not a rewrite.

**What would need to change for production.**

| Current constraint | Production approach |
|---|---|
| SQLite lives inside each container, so review decisions are lost when Cloud Run scales to zero, and are not shared between instances | a managed database such as Cloud SQL |
| Processing runs inside a single web request | a background job queue, so large inboxes don't hit request timeouts |
| One shared demo state for every visitor | authentication, roles, and separate workspaces per team |
| Learned labels are stored per container | move them to the shared database, so every instance learns together |
| Reprocessing the inbox discards human decisions | preserve reviewed results across reprocessing |
| OCR runs in the API container | a separate worker, so scanned pages don't slow the API |

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