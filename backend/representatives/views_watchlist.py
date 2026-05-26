from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import error_response
from .models import UserWatchlist, Representative
from .serializers_watchlist import WatchlistEntrySerializer, WatchlistCreateSerializer


class WatchlistListCreateView(APIView):
    """
    GET  /api/v1/watchlist/       — list watched representatives
    POST /api/v1/watchlist/       — add a representative to watchlist
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        entries = UserWatchlist.objects.filter(
            user=request.user
        ).select_related('representative')
        serializer = WatchlistEntrySerializer(entries, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = WatchlistCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        rep_id = serializer.validated_data['representative_id']
        representative = Representative.objects.get(id=rep_id)

        entry, created = UserWatchlist.objects.get_or_create(
            user=request.user,
            representative=representative,
        )

        if not created:
            return error_response(
                'Representative is already on your watchlist.',
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            WatchlistEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )


class WatchlistDeleteView(APIView):
    """DELETE /api/v1/watchlist/<representative_id>/ — remove from watchlist."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, representative_id: int):
        deleted_count, _ = UserWatchlist.objects.filter(
            user=request.user,
            representative_id=representative_id,
        ).delete()

        if deleted_count == 0:
            return error_response(
                'Representative not found on your watchlist.',
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class WatchlistStatusView(APIView):
    """GET /api/v1/watchlist/status/?ids=1,2,3 — bulk check which reps are watched."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ids_param = request.query_params.get('ids', '')
        try:
            rep_ids = [int(x.strip()) for x in ids_param.split(',') if x.strip()]
        except ValueError:
            return error_response('ids must be comma-separated integers.')

        watched = UserWatchlist.objects.filter(
            user=request.user,
            representative_id__in=rep_ids,
        ).values_list('representative_id', flat=True)

        return Response({'watched_ids': list(watched)})
