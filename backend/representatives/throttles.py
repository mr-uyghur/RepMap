from rest_framework.throttling import AnonRateThrottle


class ZipcodeLookupThrottle(AnonRateThrottle):
    # Throttle anonymous ZIP-to-representative lookups.
    scope = 'zipcode_lookup'


class VotesThrottle(AnonRateThrottle):
    # Throttle votes lookups — each request hits the Congress.gov API (cached for 6 h).
    scope = 'votes_lookup'


class LegislationThrottle(AnonRateThrottle):
    # Throttle legislation lookups — each request may hit two Congress.gov endpoints.
    scope = 'legislation_lookup'


class ReportCardThrottle(AnonRateThrottle):
    # Throttle report card lookups — each request may hit multiple Congress.gov endpoints.
    scope = 'report_card_lookup'

