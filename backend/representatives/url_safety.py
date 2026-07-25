from urllib.parse import urlparse


_ALLOWED_EXTERNAL_SCHEMES = {'http', 'https'}


def normalize_external_url(value) -> str:
    """Return a trimmed http(s) URL, or an empty string for unsafe values."""
    if not isinstance(value, str):
        return ''

    url = value.strip()
    if not url:
        return ''
    if any(ch.isspace() for ch in url):
        return ''

    parsed = urlparse(url)
    if parsed.scheme.lower() not in _ALLOWED_EXTERNAL_SCHEMES:
        return ''
    if not parsed.netloc:
        return ''
    return url
