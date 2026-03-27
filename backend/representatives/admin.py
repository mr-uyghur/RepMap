from django.contrib import admin
from .models import Representative, AISummary


@admin.register(Representative)
class RepresentativeAdmin(admin.ModelAdmin):
    # Show the fields most useful for quick browsing and filtering in admin.
    list_display = ['name', 'level', 'party', 'state', 'district_number', 'updated_at']
    list_filter = ['level', 'party', 'state']
    search_fields = ['name', 'state']
    readonly_fields = ['updated_at']


@admin.register(AISummary)
class AISummaryAdmin(admin.ModelAdmin):
    # Expose content type and model metadata for generated summaries.
    list_display = ['representative', 'content_type', 'generated_at', 'model_version']
    list_filter = ['content_type', 'model_version']
    search_fields = ['representative__name']
    readonly_fields = ['generated_at']
