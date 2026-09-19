"""Canonical field names and label/value normalization.

Shared by extract.py (label matching) and compare.py (value equality).
"""

import re

CANONICAL_FIELDS = [
    "shipper", "consignee", "notify_party",
    "port_of_loading", "port_of_discharge",
    "container_count", "gross_weight_kg",
]

FIELD_ALIASES = {
    "shipper": ["shipper", "exporter"],
    "consignee": ["consignee"],
    "notify_party": ["notify party", "notify"],
    "port_of_loading": ["port of loading", "load port", "loading port", "pol"],
    "port_of_discharge": ["port of discharge", "discharge port", "unloading port", "pod"],
    "container_count": [
        "container count", "no. of containers", "number of containers",
        "no of containers", "total containers", "containers",
    ],
    "gross_weight_kg": ["gross weight", "gross wt", "total gross weight"],
}

NUMERIC_FIELDS = {"container_count", "gross_weight_kg"}


def normalize_label(label: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", label.lower()).strip()


def canonical_field(label: str) -> str | None:
    norm = normalize_label(label)
    for field, aliases in FIELD_ALIASES.items():
        if any(alias in norm for alias in aliases):
            return field
    return None


def normalize_value(field: str, raw: str) -> str:
    raw = raw.strip()
    if field in NUMERIC_FIELDS:
        return re.sub(r"[^\d.]", "", raw)
    return re.sub(r"\s+", " ", raw).strip().lower()


def values_match(field: str, a: str, b: str) -> bool:
    return normalize_value(field, a) == normalize_value(field, b)
