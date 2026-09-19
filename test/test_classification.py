import unittest

class TestEmailClassification(unittest.TestCase):

    def test_bl_comparison_email(self):
        email = {
            "subject": "Please check SI and Draft BL",
            "body": "Please compare the Shipping Instruction with the Draft Bill of Lading."
        }

        # Expected result from the classifier
        expected_category = "BL_COMPARISON"

        # TODO: Replace it with the implemented classifier
        actual_category = expected_category

        self.assertEqual(actual_category, expected_category)

    def test_si_request_email(self):
        email = {
            "subject": "Shipping Instruction",
            "body": "Please process the attached Shipping Instruction."
        }

        expected_category = "SI_REQUEST"

        # TODO: Replace it with the implemented classifier
        actual_category = expected_category

        self.assertEqual(actual_category, expected_category)

    def test_invoice_query(self):
        email = {
            "subject": "Invoice Query",
            "body": "Please provide the invoice for this shipment."
        }

        expected_category = "INVOICE_QUERY"

        # TODO: Replace it with the implemented classifier
        actual_category = expected_category

        self.assertEqual(actual_category, expected_category)

    def test_general_email(self):
        email = {
            "subject": "General Update",
            "body": "Please find the latest shipment update."
        }

        expected_category = "GENERAL"

        # TODO: Replace it with the implemented classifier
        actual_category = expected_category

        self.assertEqual(actual_category, expected_category)

    def test_spam_email(self):
        email = {
            "subject": "You have won a prize!",
            "body": "Click here to claim your prize."
        }

        expected_category = "SPAM"

        # TODO: Replace it with the implemented classifier
        actual_category = expected_category

        self.assertEqual(actual_category, expected_category)


if __name__ == "__main__":
    unittest.main()