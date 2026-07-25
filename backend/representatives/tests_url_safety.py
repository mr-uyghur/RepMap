from django.test import SimpleTestCase

from representatives.url_safety import normalize_external_url


class ExternalUrlSafetyTests(SimpleTestCase):
    def test_accepts_http_and_https_urls(self):
        self.assertEqual(
            normalize_external_url(' https://www.example.com/path '),
            'https://www.example.com/path',
        )
        self.assertEqual(
            normalize_external_url('http://example.com'),
            'http://example.com',
        )

    def test_rejects_unsafe_or_malformed_urls(self):
        for value in (
            'javascript:alert(1)',
            'JaVaScRiPt:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'java\nscript:alert(1)',
            '//example.com/path',
            'example.com/path',
            'https://example.com/has raw space',
            'https:///missing-host',
            '',
            None,
        ):
            with self.subTest(value=value):
                self.assertEqual(normalize_external_url(value), '')
