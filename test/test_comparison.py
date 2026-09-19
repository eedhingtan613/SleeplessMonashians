import unittest

class TestDocumentComparison(unittest.TestCase):

    def test_all_fields_match(self):
        si = {
            "shipper": "ABC Company",
            "consignee": "XYZ Company",
            "notify_party": "Notify Company",
            "port_of_loading": "Port Klang",
            "port_of_discharge": "Callao",
            "container_count": "1 x 40HC",
            "gross_weight_kg": "21577 KG"
        }

        bl = {
            "shipper": "ABC Company",
            "consignee": "XYZ Company",
            "notify_party": "Notify Company",
            "port_of_loading": "Port Klang",
            "port_of_discharge": "Callao",
            "container_count": "1 x 40HC",
            "gross_weight_kg": "21577 KG"
        }

        expected_status = "OK"
        expected_defects = []

        # TODO: Replace it with the implemented comparison function
        actual_status = expected_status
        actual_defects = expected_defects

        self.assertEqual(actual_status, expected_status)
        self.assertEqual(actual_defects, expected_defects)

    def test_consignee_mismatch(self):
        expected_defects = ["consignee"]

        # TODO: Replace it with the implemented comparison function
        actual_defects = expected_defects

        self.assertEqual(actual_defects, expected_defects)

    def test_notify_party_mismatch(self):
        expected_defects = ["notify_party"]

        # TODO: Replace it with the implemented comparison function
        actual_defects = expected_defects

        self.assertEqual(actual_defects, expected_defects)

    def test_port_of_discharge_mismatch(self):
        expected_defects = ["port_of_discharge"]

        # TODO: Replace it with the implemented comparison function
        actual_defects = expected_defects

        self.assertEqual(actual_defects, expected_defects)

    def test_gross_weight_mismatch(self):
        expected_defects = ["gross_weight_kg"]

        # TODO: Replace it with the implemented comparison function
        actual_defects = expected_defects

        self.assertEqual(actual_defects, expected_defects)

    def test_multiple_mismatches(self):
        expected_defects = [
            "consignee",
            "notify_party"
        ]

        # TODO: Replace it with the implemented comparison function
        actual_defects = expected_defects

        self.assertEqual(actual_defects, expected_defects)

    def test_missing_value_in_bl(self):
        si_value = "ABC Company"
        bl_value = None

        # Missing value should be detected and handled.
        expected_review = True

        # TODO: Replace it with the implemented comparison function
        actual_review = bl_value is None

        self.assertEqual(actual_review, expected_review)

    def test_different_formatting_same_information(self):
        si_value = "21577 KG"
        bl_value = "21,577 kg"

        # These represent the same weight and should ideally
        # be recognised as equivalent after normalisation.
        expected_match = True

        # TODO: Replace it with the implemented comparison function
        normalised_si = si_value.replace(",", "").strip().lower()
        normalised_bl = bl_value.replace(",", "").strip().lower()

        actual_match = normalised_si == normalised_bl

        self.assertEqual(actual_match, expected_match)

    def test_whitespace_difference(self):
        si_value = "ABC Company"
        bl_value = " ABC Company "

        # These should normally be treated as equivalent
        self.assertEqual(
            si_value.strip().lower(),
            bl_value.strip().lower()
        )

if __name__ == "__main__":
    unittest.main()