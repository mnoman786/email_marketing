import io
from unittest import TestCase

from django.core.files.uploadedfile import SimpleUploadedFile
from ninja.errors import HttpError
from openpyxl import Workbook

from apps.contacts.import_files import MAX_IMPORT_BYTES, parse_lead_file


class LeadFileImportTests(TestCase):
    def test_csv_keeps_quoted_commas_and_extra_details(self):
        upload = SimpleUploadedFile(
            'leads.csv',
            b'Email,First Name,Company,Notes\nada@example.com,Ada,"Example, Inc.","Call next week"\n',
        )
        self.assertEqual(parse_lead_file(upload), [{
            'email': 'ada@example.com', 'first_name': 'Ada',
            'company': 'Example, Inc.', 'notes': 'Call next week',
        }])

    def test_xlsx_is_accepted(self):
        workbook = Workbook()
        workbook.active.append(['email', 'last_name'])
        workbook.active.append(['ada@example.com', 'Lovelace'])
        content = io.BytesIO()
        workbook.save(content)
        upload = SimpleUploadedFile('leads.xlsx', content.getvalue())
        self.assertEqual(parse_lead_file(upload)[0]['last_name'], 'Lovelace')

    def test_other_file_types_and_oversized_files_are_rejected(self):
        with self.assertRaises(HttpError):
            parse_lead_file(SimpleUploadedFile('leads.txt', b'email\na@example.com'))

        class LargeUpload:
            name = 'leads.csv'
            size = MAX_IMPORT_BYTES + 1

        with self.assertRaises(HttpError):
            parse_lead_file(LargeUpload())
