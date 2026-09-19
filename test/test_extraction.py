import unittest

class TestDocumentExtraction(unittest.TestCase):

    REQUIRED_FIELDS = [
        "shipper",
        "consignee",
        "notify_party",
        "port_of_loading",
        "port_of_discharge",
        "container_count",
        "gross_weight_kg"
    ]

    def test_all_required_fields_are_extracted(self):
        expected_fields = set(self.REQUIRED_FIELDS)

        # TODO: replace with team's extraction output
        extracted_fields = set(self.REQUIRED_FIELDS)

        self.assertEqual(extracted_fields, expected_fields)

    def test_shipper_extraction(self):
        expected = "APRIL FAR EAST (M) SDN BHD"

        # TODO: Replace it with the implemented extractor
        actual = expected

        self.assertEqual(actual, expected)

    def test_consignee_extraction(self):
        expected = "MOORIM SP CO., LTD"

        # TODO: Replace it with the implemented extractor
        actual = expected

        self.assertEqual(actual, expected)

    def test_notify_party_extraction(self):
        expected = "UAB NOVAKOPA"

        # TODO: Replace it with the implemented extractor
        actual = expected

        self.assertEqual(actual, expected)

    def test_port_of_loading_extraction(self):
        expected = "PORT KLANG (WESTPORT), MALAYSIA (MYPKG)"

        # TODO: Replace it with the implemented extractor
        actual = expected

        self.assertEqual(actual, expected)

    def test_port_of_discharge_extraction(self):
        expected = "CALLAO, PERU (PECLL)"

        # TODO: Replace it with the implemented extractor
        actual = expected

        self.assertEqual(actual, expected)

    def test_container_count_extraction(self):
        expected = "1 x 40'HC"

        # TODO: Replace it with the implemented extractor
        actual = expected

        self.assertEqual(actual, expected)

    def test_gross_weight_extraction(self):
        expected = "21577 KG"

        # TODO: Replace it with the implemented extractor
        actual = expected

        self.assertEqual(actual, expected)

    def test_missing_value(self):
        # Missing required field should be detected
        extracted = {
            "shipper": "ABC Company",
            "consignee": None,
            "notify_party": "Notify Company"
        }

        self.assertIsNone(extracted["consignee"])


if __name__ == "__main__":
    unittest.main()