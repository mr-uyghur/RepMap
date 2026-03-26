from rest_framework import serializers
from .models import Representative, AISummary


class AISummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = AISummary
        fields = ['content_type', 'content', 'generated_at', 'model_version']


class RepresentativeListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Representative
        fields = [
            'id', 'name', 'level', 'party', 'state', 'district_number',
            'photo_url', 'latitude', 'longitude',
        ]


class RepresentativeDetailSerializer(serializers.ModelSerializer):
    summaries = AISummarySerializer(many=True, read_only=True)
    # Explicit ListField so DRF serializes JSONListField as a JSON array, not a plain
    # string (DRF maps any TextField subclass to CharField by default).
    committee_assignments = serializers.ListField(child=serializers.CharField(), default=list)

    class Meta:
        model = Representative
        fields = [
            'id', 'name', 'level', 'party', 'state', 'district_number',
            'photo_url', 'website', 'phone', 'social_links',
            'term_start', 'term_end', 'office_room', 'committee_assignments',
            'latitude', 'longitude', 'external_ids', 'updated_at', 'summaries',
        ]
