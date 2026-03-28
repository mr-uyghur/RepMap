import re
import logging
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .throttles import ZipcodeLookupThrottle, AISummaryThrottle, VotesThrottle, LegislationThrottle

from .models import Representative, AISummary, SyncStatus
from .services.auto_sync import trigger_sync_if_stale
from .serializers import RepresentativeListSerializer, RepresentativeDetailSerializer, AISummarySerializer, SyncStatusSerializer
from .integrations.zip_lookup import fetch_reps_by_zipcode, geocode_zip
from .integrations.census import (
    fetch_congressional_districts, fetch_state_boundary, STATE_FIPS,
    load_local_congressional_districts,
)
from .services.ai import generate_bio, generate_voting_record_summary, generate_how_to_vote
from .services.congress_api import fetch_recent_votes, fetch_sponsored_legislation, fetch_cosponsored_legislation

logger = logging.getLogger(__name__)

ZIPCODE_RE = re.compile(r'^\d{5}$')


class RepresentativeViewSet(viewsets.ReadOnlyModelViewSet):
    # Read-only endpoints for the map, detail panel, and generated summaries.
    queryset = Representative.objects.prefetch_related('summaries')

    def get_serializer_class(self):
        # Use the smaller serializer for list views and the richer serializer for detail views.
        if self.action == 'retrieve':
            return RepresentativeDetailSerializer
        return RepresentativeListSerializer

    def get_throttles(self):
        # Throttle only the actions that are relatively expensive or easy to abuse.
        if self.action == 'list' and self.request.query_params.get('zipcode'):
            return [ZipcodeLookupThrottle()]
        if self.action == 'summary':
            return [AISummaryThrottle()]
        return []

    def list(self, request):
        # Opportunistically refresh stale data without blocking the response.
        trigger_sync_if_stale()
        zipcode = request.query_params.get('zipcode', '').strip()

        if zipcode:
            if not ZIPCODE_RE.match(zipcode):
                return Response({'error': 'Invalid zipcode format.'}, status=status.HTTP_400_BAD_REQUEST)
            return self._handle_zipcode_request(zipcode)

        # Default: return all reps
        queryset = Representative.objects.prefetch_related('summaries')
        serializer = RepresentativeListSerializer(queryset, many=True)
        return Response(serializer.data)

    def _handle_zipcode_request(self, zipcode):
        try:
            # Resolve one ZIP code into its House seat plus the state's senators.
            reps = fetch_reps_by_zipcode(zipcode)
        except Exception as e:
            logger.warning("ZIP lookup error for %s: %s", zipcode, e)
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
            # Serve a recent cached summary instead of regenerating it.
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
    # Geometry endpoints used by the frontend map layers.
    @action(detail=False, methods=['get'], url_path='congressional')
    def congressional(self, request):
        state = _validate_state(request.query_params.get('state', ''))
        if not state:
            return Response({'error': 'Valid 2-letter state abbreviation required.'}, status=400)

        cache_key = f'district_geojson_v2_{state}'  # v2: simplified geometry (0.01° offset)
        try:
            cached = cache.get(cache_key)
            if cached:
                # District GeoJSON is large enough that a cache hit is worth checking first.
                return Response(cached)
        except Exception:
            logger.warning("Cache unavailable for %s, fetching directly", cache_key)

        # Serve from pre-built local file (generated by `build_district_data` command).
        local_data = load_local_congressional_districts(state)
        if local_data is not None:
            try:
                cache.set(cache_key, local_data, 60 * 60 * 24 * 7)  # 7 days
            except Exception:
                pass
            return Response(local_data)

        # No local file — fall back to live Census only if explicitly enabled.
        if not settings.DISTRICT_LIVE_FALLBACK:
            logger.warning("District data missing for %s and live fallback is disabled", state)
            return Response(
                {'error': f'District data for {state} is not available. '
                          f'Run: python manage.py build_district_data'},
                status=503,
            )

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


class SyncStatusView(APIView):
    """GET /api/sync-status/ — returns the current sync state of representative data."""

    def get(self, request):
        sync_status = SyncStatus.objects.first()
        if sync_status is None:
            return Response({
                'last_synced_at': None,
                'is_syncing': False,
                'data_age_seconds': None,
            })
        serializer = SyncStatusSerializer(sync_status)
        return Response(serializer.data)


class VotesView(APIView):
    """GET /api/representatives/{bioguide_id}/votes/ — recent votes from Congress.gov."""
    throttle_classes = [VotesThrottle]

    def get(self, request, bioguide_id: str):
        votes = fetch_recent_votes(bioguide_id)
        return Response(votes)


class LegislationView(APIView):
    """GET /api/representatives/{bioguide_id}/legislation/ — sponsored and cosponsored bills."""
    throttle_classes = [LegislationThrottle]

    def get(self, request, bioguide_id: str):
        return Response({
            'sponsored': fetch_sponsored_legislation(bioguide_id),
            'cosponsored': fetch_cosponsored_legislation(bioguide_id),
        })


class ZipLookupView(APIView):
    """GET /api/zip-lookup/?zipcode=12345 — returns {lat, lng} for a ZIP code centroid."""

    def get(self, request):
        zipcode = request.query_params.get('zipcode', '').strip()
        if not ZIPCODE_RE.match(zipcode):
            return Response(
                {'error': 'Enter a valid 5-digit ZIP code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            # This endpoint only returns map coordinates; it does not fetch representatives.
            lat, lng = geocode_zip(zipcode)
        except Exception as e:
            logger.warning("ZIP geocode error for %s: %s", zipcode, e)
            return Response(
                {'error': 'Could not look up that ZIP code. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if lat is None:
            return Response(
                {'error': 'ZIP code not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({'lat': lat, 'lng': lng})
