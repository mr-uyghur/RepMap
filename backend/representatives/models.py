from django.db import models


# ---------------------------------------------------------------------------
# Legacy field stubs — kept only so historical migrations (0001, 0003) can
# import these names without error. The Representative model no longer uses
# them; all three JSON fields now use Django's built-in JSONField.
# ---------------------------------------------------------------------------

class JSONTextField(models.TextField):
    """Legacy stub — do not use in new code."""


class JSONListField(models.TextField):
    """Legacy stub — do not use in new code."""


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Representative(models.Model):
    # One current federal legislator shown in the app.
    LEVEL_CHOICES = [('house', 'US House'), ('senate', 'US Senate')]
    PARTY_CHOICES = [
        ('democrat', 'Democrat'),
        ('republican', 'Republican'),
        ('independent', 'Independent'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=200)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, db_index=True)
    party = models.CharField(max_length=20, choices=PARTY_CHOICES)
    state = models.CharField(max_length=2, db_index=True)
    district_number = models.IntegerField(null=True, blank=True, db_index=True)
    photo_url = models.URLField(blank=True)
    website = models.URLField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    social_links = models.JSONField(default=dict)
    term_start = models.DateField(null=True, blank=True)
    term_end = models.DateField(null=True, blank=True)
    office_room = models.CharField(max_length=200, blank=True)
    committee_assignments = models.JSONField(default=list)
    latitude = models.FloatField()
    longitude = models.FloatField()
    external_ids = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Stable default ordering for API responses and admin lists.
        ordering = ['state', 'level', 'district_number']

    def __str__(self):
        # Human-readable label for admin/debug output.
        if self.level == 'senate':
            return f"Sen. {self.name} ({self.state})"
        return f"Rep. {self.name} ({self.state}-{self.district_number})"


class SyncStatus(models.Model):
    """Singleton (id=1) tracking the last successful representative data sync."""
    last_synced_at = models.DateTimeField(null=True, blank=True)
    is_syncing = models.BooleanField(default=False)
    last_error = models.TextField(blank=True)

    class Meta:
        verbose_name_plural = 'sync status'

    def __str__(self):
        # Quick summary of the latest known sync state.
        if self.last_synced_at:
            return f'Last synced: {self.last_synced_at.isoformat()}'
        return 'Never synced'


class AISummary(models.Model):
    # Cached AI-generated content for a representative/detail tab.
    CONTENT_TYPES = [
        ('bio', 'Bio'),
        ('voting_record', 'Voting Record'),
        ('how_to_vote', 'How to Vote'),
    ]
    representative = models.ForeignKey(
        Representative, related_name='summaries', on_delete=models.CASCADE
    )
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPES)
    content = models.TextField()
    generated_at = models.DateTimeField(auto_now_add=True)
    model_version = models.CharField(max_length=50, default='claude-opus-4-5')

    class Meta:
        # Prevent duplicate summaries for the same rep/content type.
        unique_together = ['representative', 'content_type']

    def __str__(self):
        return f"{self.representative.name} - {self.content_type}"
