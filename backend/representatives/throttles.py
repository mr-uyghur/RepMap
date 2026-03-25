from rest_framework.throttling import AnonRateThrottle


class ZipcodeLookupThrottle(AnonRateThrottle):
    scope = 'zipcode_lookup'


class AISummaryThrottle(AnonRateThrottle):
    scope = 'ai_summary'
