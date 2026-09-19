from sdoc.core.extract import extract_fields
from sdoc.llm import gemini

SI_TEXT = """Shipper: ABC Trading Co.
Consignee: Global Imports Ltd
Notify Party: Global Imports Ltd
Port of Loading: Singapore
Port of Discharge: Rotterdam
Container Count: 3
Gross Weight: 22000 kg"""


def test_rule_based_extraction_complete():
    result = extract_fields(SI_TEXT, use_llm_fallback=False)
    assert result.method == "rules"
    assert result.missing_fields == []
    assert result.fields["container_count"] == "3"
    assert result.fields["gross_weight_kg"] == "22000"


def test_missing_field_reported_without_llm():
    text = "\n".join(l for l in SI_TEXT.splitlines() if "Notify" not in l)
    result = extract_fields(text, use_llm_fallback=False)
    assert result.missing_fields == ["notify_party"]


def test_llm_fallback_fills_missing_field(monkeypatch):
    text = "\n".join(l for l in SI_TEXT.splitlines() if "Notify" not in l)
    monkeypatch.setattr(gemini, "is_available", lambda: True)
    monkeypatch.setattr(gemini, "extract_fields_llm", lambda t: {"notify_party": "Global Imports Ltd"})
    result = extract_fields(text, use_llm_fallback=True)
    assert result.method == "llm_fallback"
    assert result.missing_fields == []
    assert result.fields["notify_party"] == "global imports ltd"
