"""Email classification into the 5 inbox categories."""

from dataclasses import dataclass

from ..llm import gemini

CATEGORY_KEYWORDS = {
    "document_comparison": [
        "bill of lading", "draft bl", "verify the", "compare the",
        "check the attached", "discrepancy", "cross-check",
        "match the si", "review the draft", "si vs bl", "si and bl",
    ],
    "new_si_request": [
        "new shipping instruction", "issue a new si", "prepare a shipping instruction",
        "need a new si", "create the si", "book a new shipment", "new si for",
    ],
    "invoice_query": [
        "invoice", "payment", "freight charges", "outstanding balance",
        "invoice number", "billing", "amount due",
    ],
    "spam": [
        "congratulations", "you have won", "claim your prize", "click here",
        "free gift", "act now", "no cost to you", "lottery", "crypto investment",
        "wire transfer immediately",
    ],
}

ATTACHMENT_BONUS = 3
LLM_FALLBACK_THRESHOLD = 0.5


@dataclass(frozen=True)
class ClassificationResult:
    category: str
    confidence: float
    method: str  # "rules" | "llm"
    rationale: str | None = None


def _rule_based(email: dict) -> ClassificationResult:
    text = f"{email.get('subject', '')} {email.get('body', '')}".lower()
    scores = {cat: sum(kw in text for kw in kws) for cat, kws in CATEGORY_KEYWORDS.items()}

    doc_types = {a.get("doc_type", "").upper() for a in email.get("attachments", [])}
    if {"SI", "BL"} <= doc_types:
        scores["document_comparison"] += ATTACHMENT_BONUS

    top_cat = max(scores, key=scores.get)
    top_score = scores[top_cat]
    if top_score == 0:
        return ClassificationResult("general", 0.3, "rules")

    confidence = round(top_score / sum(scores.values()), 2)
    return ClassificationResult(top_cat, confidence, "rules")


def classify_email(email: dict, use_llm_fallback: bool = True) -> ClassificationResult:
    result = _rule_based(email)
    if result.confidence >= LLM_FALLBACK_THRESHOLD or not use_llm_fallback:
        return result
    if not gemini.is_available():
        return result

    llm = gemini.classify_email_llm(email.get("subject", ""), email.get("body", ""))
    if not llm:
        return result

    return ClassificationResult(
        category=llm["category"],
        confidence=float(llm.get("confidence", 0.6)),
        method="llm",
        rationale=llm.get("rationale"),
    )
