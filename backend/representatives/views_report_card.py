import re

from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import error_response
from .models import Representative
from .services.report_card import compute_report_card

BIOGUIDE_RE = re.compile(r'^[A-Z]\d{6}$')


class ReportCardView(APIView):
    """GET /api/v1/representatives/<bioguide_id>/report-card/ — computed accountability scores."""

    def get_throttles(self):
        from .throttles import ReportCardThrottle
        return [ReportCardThrottle()]

    def get(self, request, bioguide_id: str):
        if not BIOGUIDE_RE.match(bioguide_id):
            return error_response('Invalid bioguide_id format.')

        rep = Representative.objects.filter(
            external_ids__bioguide_id=bioguide_id
        ).only('external_ids').first()
        govtrack_id = (rep.external_ids or {}).get('govtrack_id') if rep else None

        result = compute_report_card(bioguide_id, govtrack_id=govtrack_id)
        return Response(result)
