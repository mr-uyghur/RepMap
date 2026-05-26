from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import error_response
from .models import Notification
from .serializers_notifications import NotificationSerializer


class NotificationListView(APIView):
    """GET /api/v1/notifications/ — list user notifications (newest first, max 50)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(
            user=request.user,
        ).select_related('representative')[:50]
        serializer = NotificationSerializer(notifications, many=True)
        return Response(serializer.data)


class UnreadCountView(APIView):
    """GET /api/v1/notifications/unread-count/ — count of unread notifications."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False,
        ).count()
        return Response({'count': count})


class MarkReadView(APIView):
    """POST /api/v1/notifications/<id>/read/ — mark a single notification as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id: int):
        updated = Notification.objects.filter(
            id=notification_id, user=request.user,
        ).update(is_read=True)
        if updated == 0:
            return error_response('Notification not found.', status=status.HTTP_404_NOT_FOUND)
        return Response({'status': 'ok'})


class MarkAllReadView(APIView):
    """POST /api/v1/notifications/read-all/ — mark all notifications as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False,
        ).update(is_read=True)
        return Response({'marked_read': count})
