from rest_framework import serializers
from .models import UserWatchlist, Representative
from .serializers import RepresentativeListSerializer


class WatchlistEntrySerializer(serializers.ModelSerializer):
    representative = RepresentativeListSerializer(read_only=True)
    watched_at = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = UserWatchlist
        fields = ['id', 'representative', 'watched_at']
        read_only_fields = ['id', 'watched_at']


class WatchlistCreateSerializer(serializers.Serializer):
    representative_id = serializers.IntegerField()

    def validate_representative_id(self, value):
        if not Representative.objects.filter(id=value).exists():
            raise serializers.ValidationError('Representative not found.')
        return value
