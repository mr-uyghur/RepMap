import re
import logging
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .throttles import ZipcodeLookupThrottle, AISummaryThrottle

from .models import Representative, AISummary
from .services.auto_sync import trigger_sync_if_stale
from .serializers import RepresentativeListSerializer, RepresentativeDetailSerializer, AISummarySerializer
from .integrations.google_civic import fetch_reps_by_zipcode
from .integrations.census import fetch_congressional_districts, fetch_state_boundary, STATE_FIPS
from .services.ai import generate_bio, generate_voting_record_summary, generate_how_to_vote

logger = logging.getLogger(__name__)

ZIPCODE_RE = re.compile(r'^\d{5}$')


class RepresentativeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Representative.objects.all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return RepresentativeDetailSerializer
        return RepresentativeListSerializer

    def get_throttles(self):
        if self.action == 'list' and self.request.query_params.get('zipcode'):
            return [ZipcodeLookupThrottle()]
        if self.action == 'summary':
            return [AISummaryThrottle()]
        return []

    def list(self, request):
        trigger_sync_if_stale()
        zipcode = request.query_params.get('zipcode', '').strip()

        if zipcode:
            if not ZIPCODE_RE.match(zipcode):
                return Response({'error': 'Invalid zipcode format.'}, status=status.HTTP_400_BAD_REQUEST)
            return self._handle_zipcode_request(zipcode)

        # Default: return all reps
        queryset = Representative.objects.all()
        serializer = RepresentativeListSerializer(queryset, many=True)
        return Response(serializer.data)

    def _handle_zipcode_request(self, zipcode):
        if not settings.GOOGLE_CIVIC_API_KEY:
            return Response(
                {'error': 'Representative lookup by ZIP code is not available.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            reps = fetch_reps_by_zipcode(zipcode)
        except Exception as e:
            logger.warning("Google Civic API error for zip %s: %s", zipcode, e)
            return Response(
                {'error': 'Representative lookup is temporarily unavailable. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not reps:
            return Response(
                {'error': 'No federal representatives found for that ZIP code.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = RepresentativeListSerializer(reps, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        rep = self.get_object()
        content_type = request.query_params.get('type', 'bio')

        if content_type not in ['bio', 'voting_record', 'how_to_vote']:
            return Response(
                {'error': 'Invalid type. Must be bio, voting_record, or how_to_vote'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check for cached summary (within 30 days)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        existing = AISummary.objects.filter(
            representative=rep,
            content_type=content_type,
            generated_at__gte=thirty_days_ago
        ).first()

        if existing:
            serializer = AISummarySerializer(existing)
            return Response(serializer.data)

        # Generate new summary
        try:
            if content_type == 'bio':
                content = generate_bio(rep)
            elif content_type == 'voting_record':
                content = generate_voting_record_summary(rep)
            else:
                content = generate_how_to_vote(rep)

            # Save or update summary
            summary, _ = AISummary.objects.update_or_create(
                representative=rep,
                content_type=content_type,
                defaults={
                    'content': content,
                    'model_version': 'claude-sonnet-4-6',
                }
            )
            serializer = AISummarySerializer(summary)
            return Response(serializer.data)

        except Exception:
            logger.exception("Failed to generate AI summary for rep %s type %s", rep.pk, content_type)
            return Response(
                {'error': 'Failed to generate summary. Please try again later.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


def _validate_state(state_raw: str):
    """Return uppercased state abbreviation or None if invalid."""
    state = state_raw.upper().strip()
    if state in STATE_FIPS:
        return state
    return None


class DistrictViewSet(viewsets.ViewSet):
    @action(detail=False, methods=['get'], url_path='congressional')
    def congressional(self, request):
        state = _validate_state(request.query_params.get('state', ''))
        if not state:
            return Response({'error': 'Valid 2-letter state abbreviation required.'}, status=400)

        cache_key = f'district_geojson_{state}'
        try:
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            logger.warning("Cache unavailable for %s, fetching directly", cache_key)

        try:
            geojson = fetch_congressional_districts(state)
            try:
                cache.set(cache_key, geojson, 60 * 60 * 24 * 7)  # 7 days
            except Exception:
                pass
            return Response(geojson)
        except Exception:
            logger.exception("Failed to fetch congressional districts for %s", state)
            return Response({'error': 'Failed to fetch district data.'}, status=500)

    @action(detail=False, methods=['get'], url_path='state-boundary')
    def state_boundary(self, request):
        state = _validate_state(request.query_params.get('state', ''))
        if not state:
            return Response({'error': 'Valid 2-letter state abbreviation required.'}, status=400)

        cache_key = f'state_boundary_{state}'
        try:
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            logger.warning("Cache unavailable for %s, fetching directly", cache_key)

        try:
            geojson = fetch_state_boundary(state)
            try:
                cache.set(cache_key, geojson, 60 * 60 * 24 * 7)  # 7 days
            except Exception:
                pass
            return Response(geojson)
        except Exception:
            logger.exception("Failed to fetch state boundary for %s", state)
            return Response({'error': 'Failed to fetch boundary data.'}, status=500)
