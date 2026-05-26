from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    representative_name = serializers.CharField(source='representative.name', read_only=True)
    representative_id = serializers.IntegerField(source='representative.id', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'title', 'body', 'is_read',
            'created_at', 'representative_name', 'representative_id', 'metadata',
        ]
        read_only_fields = fields
