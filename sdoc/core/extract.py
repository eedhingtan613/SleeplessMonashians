"""Extract the 7 canonical shipment fields from raw SI/BL text."""

from dataclasses import dataclass, field

from .normalize import CANONICAL_FIELDS, canonical_field, normalize_value
from ..llm import gemini


@dataclass(frozen=True)
class ExtractionResult:
    fields: dict
    missing_fields: list = field(default_factory=list)
    method: str = "rules"  # "rules" | "llm_fallback"


def _rule_based(text: str) -> dict:
    fields = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        label, _, value = line.partition(":")
        cfield = canonical_field(label)
        if cfield and cfield not in fields and value.strip():
            fields[cfield] = normalize_value(cfield, value)
    return fields


def extract_fields(text: str, use_llm_fallback: bool = True) -> ExtractionResult:
    fields = _rule_based(text)
    missing = [f for f in CANONICAL_FIELDS if f not in fields]

    if missing and use_llm_fallback and gemini.is_available():
        llm_fields = gemini.extract_fields_llm(text) or {}
        for f in missing:
            raw = llm_fields.get(f)
            if raw:
                fields[f] = normalize_value(f, str(raw))
        still_missing = [f for f in CANONICAL_FIELDS if f not in fields]
        if len(still_missing) < len(missing):
            return ExtractionResult(fields, still_missing, "llm_fallback")

    return ExtractionResult(fields, missing, "rules")
