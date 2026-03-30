from django.utils import timezone
from rest_framework import serializers
from .models import Representative, SyncStatus


class SyncStatusSerializer(serializers.ModelSerializer):
    data_age_seconds = serializers.SerializerMethodField()

    def get_data_age_seconds(self, obj):
        if obj.last_synced_at is None:
            return None
        return int((timezone.now() - obj.last_synced_at).total_seconds())

    class Meta:
        model = SyncStatus
        fields = ['last_synced_at', 'is_syncing', 'data_age_seconds']


class RepresentativeListSerializer(serializers.ModelSerializer):
    # Compact serializer for the map's initial representative payload.
    class Meta:
        model = Representative
        fields = [
            'id', 'name', 'level', 'party', 'state', 'district_number',
            'photo_url', 'latitude', 'longitude',
        ]


class RepresentativeDetailSerializer(serializers.ModelSerializer):
    # Full serializer for the side panel/detail view.
    # Explicit ListField so DRF serializes JSONListField as a JSON array, not a plain
    # string (DRF maps any TextField subclass to CharField by default).
    committee_assignments = serializers.ListField(child=serializers.CharField(), default=list)
    social_links = serializers.DictField(child=serializers.CharField(), default=dict)
    # JSONTextField is a TextField subclass; DRF defaults to CharField which calls str() on the
    # Python dict and produces an invalid single-quoted repr. Explicit DictField serializes it
    # as a proper JSON object, matching the treatment of committee_assignments and social_links.
    external_ids = serializers.DictField(default=dict)
    district_label = serializers.SerializerMethodField()
    office_address = serializers.CharField(source='office_room', read_only=True)
    congress_gov_url = serializers.SerializerMethodField()
    bioguide_url = serializers.SerializerMethodField()
    bioguide_id = serializers.SerializerMethodField()

    def get_district_label(self, obj):
        # Build a frontend-friendly district label that handles at-large cases.
        if obj.level == 'senate':
            return obj.state
        if obj.district_number is None:
            return f'{obj.state} - At-Large'
        return f'{obj.state} - District {obj.district_number}'

    def get_congress_gov_url(self, obj):
        # Derive profile links from stored IDs instead of storing redundant URLs.
        bioguide_id = (obj.external_ids or {}).get('bioguide_id')
        if not bioguide_id:
            return ''
        return f'https://www.congress.gov/member/{bioguide_id}'

    def get_bioguide_url(self, obj):
        bioguide_id = (obj.external_ids or {}).get('bioguide_id')
        if not bioguide_id:
            return ''
        return f'https://bioguide.congress.gov/search/bio/{bioguide_id}'

    def get_bioguide_id(self, obj):
        return (obj.external_ids or {}).get('bioguide_id', '')

    class Meta:
        model = Representative
        fields = [
            'id', 'name', 'level', 'party', 'state', 'district_number',
            'photo_url', 'website', 'phone', 'social_links',
            'term_start', 'term_end', 'office_room', 'committee_assignments',
            'latitude', 'longitude', 'external_ids', 'updated_at',
            'district_label', 'office_address', 'congress_gov_url', 'bioguide_url', 'bioguide_id',
        ]
