from rest_framework.throttling import AnonRateThrottle


class ZipcodeLookupThrottle(AnonRateThrottle):
    # Throttle anonymous ZIP-to-representative lookups.
    scope = 'zipcode_lookup'


class AISummaryThrottle(AnonRateThrottle):
    # Throttle anonymous AI summary generation.
    scope = 'ai_summary'
