from sdoc.core.classify import classify_email
from sdoc.llm import gemini


def test_document_comparison_by_keywords():
    email = {"subject": "Please verify draft BL vs SI", "body": "check the attached documents"}
    result = classify_email(email, use_llm_fallback=False)
    assert result.category == "document_comparison"


def test_document_comparison_by_attachments_alone():
    email = {
        "subject": "Shipment docs",
        "body": "see attached",
        "attachments": [{"doc_type": "SI"}, {"doc_type": "BL"}],
    }
    result = classify_email(email, use_llm_fallback=False)
    assert result.category == "document_comparison"


def test_new_si_request():
    email = {"subject": "Booking", "body": "please prepare a shipping instruction for next week"}
    assert classify_email(email, use_llm_fallback=False).category == "new_si_request"


def test_invoice_query():
    email = {"subject": "Invoice #123", "body": "the amount due looks wrong"}
    assert classify_email(email, use_llm_fallback=False).category == "invoice_query"


def test_spam():
    email = {"subject": "You have won!", "body": "click here to claim your prize, act now"}
    assert classify_email(email, use_llm_fallback=False).category == "spam"


def test_no_keyword_match_falls_back_to_general_without_llm():
    email = {"subject": "Hello", "body": "just checking in"}
    result = classify_email(email, use_llm_fallback=False)
    assert result.category == "general"
    assert result.method == "rules"


def test_llm_fallback_skipped_when_gemini_unavailable(monkeypatch):
    monkeypatch.setattr(gemini, "is_available", lambda: False)
    email = {"subject": "Hello", "body": "just checking in"}
    result = classify_email(email, use_llm_fallback=True)
    assert result.method == "rules"


def test_llm_fallback_used_when_confidence_low(monkeypatch):
    monkeypatch.setattr(gemini, "is_available", lambda: True)
    monkeypatch.setattr(
        gemini, "classify_email_llm",
        lambda subject, body: {"category": "general", "confidence": 0.9, "rationale": "no action needed"},
    )
    email = {"subject": "Hello", "body": "just checking in"}
    result = classify_email(email, use_llm_fallback=True)
    assert result.method == "llm"
    assert result.confidence == 0.9
