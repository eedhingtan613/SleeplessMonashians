from sdoc.core.normalize import canonical_field, normalize_value, values_match


def test_alias_mapping():
    assert canonical_field("Port of Loading") == "port_of_loading"
    assert canonical_field("Load Port") == "port_of_loading"
    assert canonical_field("No. of Containers") == "container_count"
    assert canonical_field("Random Field") is None


def test_numeric_normalization_strips_units_and_commas():
    assert normalize_value("gross_weight_kg", "22,000 kg") == "22000"
    assert normalize_value("container_count", "3") == "3"


def test_text_normalization_is_case_and_space_insensitive():
    assert normalize_value("shipper", "  ABC   Trading Co. ") == "abc trading co."


def test_values_match_across_aliases_and_formatting():
    assert values_match("gross_weight_kg", "22000 kg", "22,000")
    assert values_match("shipper", "ABC Trading Co.", "abc trading co.")
    assert not values_match("container_count", "3", "4")
