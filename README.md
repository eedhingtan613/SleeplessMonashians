# "I" part — classify / extract / ingest / normalize / llm.gemini

Drop `sdoc/core/{classify,extract,ingest,normalize}.py`, `sdoc/llm/gemini.py`, and the
`tests/` files into place. All four core modules degrade to rule-based-only behavior
when `GEMINI_API_KEY` isn't set — nothing here requires the key to run.

## Interface for pipeline.py (P)

```python
from sdoc.core.classify import classify_email      # -> ClassificationResult(category, confidence, method, rationale)
from sdoc.core.ingest import read_attachment         # -> IngestResult(text, method, warning)
from sdoc.core.extract import extract_fields         # -> ExtractionResult(fields: dict, missing_fields: list, method)
from sdoc.core.normalize import CANONICAL_FIELDS, values_match  # for compare.py
```

Typical flow per email:
```python
result = classify_email(email)
if result.category != "document_comparison":
    ...
si = read_attachment(si_path)
bl = read_attachment(bl_path)
if si.method == "unreadable" or bl.method == "unreadable":
    ...escalate (si.warning / bl.warning has the reason)...
si_fields = extract_fields(si.text)
bl_fields = extract_fields(bl.text)
if si_fields.missing_fields or bl_fields.missing_fields:
    ...escalate...
# compare.py: for f in CANONICAL_FIELDS: values_match(f, si_fields.fields[f], bl_fields.fields[f])
```

These result types are plain frozen dataclasses defined locally in each module
(not in `contract.py`, which didn't exist yet) — happy to move them there once
the shared schema is settled.

## New dependencies (add to requirements.txt)
```
pymupdf
python-docx
google-genai
```

## Env vars (add to .env.example)
```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3-flash-preview
```

## What's rule-based vs LLM
- `classify_email`: keyword scoring always runs; Gemini is only called when
  confidence < 0.5 (ambiguous subject/body).
- `extract_fields`: `Label: value` line parsing always runs; Gemini fills in
  only the fields the parser missed (messy layouts, tables, non-English labels).
- `read_attachment`: native text extraction (pdf/docx/txt) always runs first;
  Gemini vision is only used when a PDF has no text layer (scanned) or the
  attachment is an image.

Every LLM call returns `None` on any failure (no key, bad JSON, network error,
package missing) — callers already handle that as "fall back / escalate", so a
missing or expired key never breaks the pipeline, it just turns off the fallback.
