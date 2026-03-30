"""
Custom middleware for RepMap.

ContentSecurityPolicyMiddleware — adds a Content-Security-Policy header to
every response without requiring a third-party package.

Directive rationale:
  default-src 'self'        — safe default; everything else must be explicitly
                              listed below.
  script-src                — 'self' for the app bundle; Mapbox CDN for GL JS
                              worker bootstrap; Google APIs included per policy
                              for any future third-party integrations.
  worker-src blob:          — Mapbox GL JS spawns its tile-decoding worker as
                              a blob: URL; must be explicitly allowed.
  connect-src               — 'self' covers the Django API; all *.mapbox.com
                              and events.mapbox.com for tile fetches, telemetry,
                              and style lookups.
  img-src                   — data: and blob: for Mapbox GL canvas snapshots
                              and inline icons; *.mapbox.com for raster tiles.
  style-src 'unsafe-inline' — Mapbox GL injects inline <style> nodes; removing
                              'unsafe-inline' breaks the map until nonces are
                              plumbed through the React render.  Google Fonts
                              loads its stylesheet from fonts.googleapis.com.
  font-src                  — Google Fonts serves font files from fonts.gstatic.com.
"""

from django.conf import settings


# ---------------------------------------------------------------------------
# CSP directive strings
# ---------------------------------------------------------------------------
_SCRIPT_SRC = (
    "'self' "
    "https://api.mapbox.com "
    "https://events.mapbox.com "
    "https://apis.google.com"
)

# worker-src: allow blob: for Mapbox GL web workers.
_WORKER_SRC = "blob:"

# connect-src: API origin (self) + full Mapbox network surface.
_CONNECT_SRC = (
    "'self' "
    "https://*.mapbox.com "
    "https://events.mapbox.com"
)

# img-src: canvas exports, inline SVG, Mapbox raster tiles.
_IMG_SRC = "'self' data: blob: https://*.mapbox.com"

# style-src: Mapbox GL injects inline styles; Google Fonts stylesheet.
_STYLE_SRC = (
    "'self' "
    "'unsafe-inline' "
    "https://fonts.googleapis.com "
    "https://api.mapbox.com"
)

# font-src: Google Fonts delivery CDN.
_FONT_SRC = "'self' https://fonts.gstatic.com"

_CSP = (
    f"default-src 'self'; "
    f"script-src {_SCRIPT_SRC}; "
    f"worker-src {_WORKER_SRC}; "
    f"connect-src {_CONNECT_SRC}; "
    f"img-src {_IMG_SRC}; "
    f"style-src {_STYLE_SRC}; "
    f"font-src {_FONT_SRC};"
)


class ContentSecurityPolicyMiddleware:
    """Attach a Content-Security-Policy header to every HTTP response."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Don't overwrite a CSP already set by a view or a more specific middleware.
        if 'Content-Security-Policy' not in response:
            response['Content-Security-Policy'] = _CSP
        return response
