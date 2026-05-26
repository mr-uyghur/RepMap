import json
from pathlib import Path

from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

_DATA_PATH = Path(__file__).resolve().parent / 'election_data' / 'elections.json'
_CACHE_KEY = 'election_data_v1'
_CACHE_TTL = 60 * 60 * 24  # 24 hours


def _load_election_data():
    cached = cache.get(_CACHE_KEY)
    if cached is not None:
        return cached
    with open(_DATA_PATH) as f:
        data = json.load(f)
    cache.set(_CACHE_KEY, data, _CACHE_TTL)
    return data


class ElectionDatesView(APIView):
    """GET /api/v1/elections/?state=CA — returns election dates for the given state."""

    def get(self, request):
        state = request.query_params.get('state', '').upper().strip()
        if not state or len(state) != 2:
            return Response({
                'next_primary': None,
                'next_general': None,
                'registration_deadline': None,
            })

        data = _load_election_data()
        general = data.get('general', {})
        primary = data.get('primaries', {}).get(state)
        deadline = data.get('registration_deadlines', {}).get(
            state,
            data.get('registration_deadlines', {}).get('_default', ''),
        )

        return Response({
            'next_primary': primary,
            'next_general': {
                'date': general.get('date'),
                'label': general.get('label'),
            } if general.get('date') else None,
            'registration_deadline': deadline,
        })
