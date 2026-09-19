"""Thin Gemini wrapper: structured-JSON classification/extraction fallback + vision OCR.

Uses the google-genai SDK. Every public function degrades to None on any failure
(missing key, package not installed, network error, bad JSON) so callers can fall
back to rule-based logic or escalate, never crash.
"""

import json
import os

try:
    from google import genai
    from google.genai import types
    _IMPORT_OK = True
except ImportError:
    _IMPORT_OK = False

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
_client = None


def is_available() -> bool:
    return _IMPORT_OK and bool(_API_KEY)


def _get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=_API_KEY)
    return _client


def _generate_json(contents, schema: dict) -> dict | None:
    if not is_available():
        return None
    try:
        response = _get_client().models.generate_content(
            model=MODEL,
            contents=contents,
            config={"response_mime_type": "application/json", "response_schema": schema},
        )
        return json.loads(response.text)
    except Exception:
        return None


CLASSIFY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "category": {
            "type": "STRING",
            "enum": ["document_comparison", "new_si_request", "invoice_query", "general", "spam"],
        },
        "confidence": {"type": "NUMBER"},
        "rationale": {"type": "STRING"},
    },
    "required": ["category", "confidence"],
}


def classify_email_llm(subject: str, body: str) -> dict | None:
    prompt = (
        "Classify this shipping-operations email into exactly one category:\n"
        "- document_comparison: asks to check/verify/compare a draft Bill of Lading against a Shipping Instruction\n"
        "- new_si_request: asks to issue or prepare a new shipping instruction\n"
        "- invoice_query: about invoices, payments, or freight charges\n"
        "- general: any other legitimate operational message\n"
        "- spam: unsolicited/phishing content\n\n"
        f"Subject: {subject}\nBody: {body}"
    )
    return _generate_json(prompt, CLASSIFY_SCHEMA)


EXTRACT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "shipper": {"type": "STRING"},
        "consignee": {"type": "STRING"},
        "notify_party": {"type": "STRING"},
        "port_of_loading": {"type": "STRING"},
        "port_of_discharge": {"type": "STRING"},
        "container_count": {"type": "STRING"},
        "gross_weight_kg": {"type": "STRING"},
    },
}


def extract_fields_llm(text: str) -> dict | None:
    prompt = (
        "Extract these seven shipment fields from the document text below, using "
        "exactly these field names. Omit a field entirely if it is not present "
        "— never guess a value.\n\n"
        f"Document text:\n{text}"
    )
    return _generate_json(prompt, EXTRACT_SCHEMA)


def read_image_text(image_bytes: bytes, mime_type: str) -> str | None:
    """Vision OCR fallback for scanned PDFs / image attachments."""
    if not is_available():
        return None
    try:
        response = _get_client().models.generate_content(
            model=MODEL,
            contents=[
                "Transcribe all text visible in this document image exactly, "
                "preserving line breaks and label/value pairs. Return plain text only.",
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
        )
        return response.text
    except Exception:
        return None
