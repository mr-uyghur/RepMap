from django.contrib import admin
from .models import Representative


@admin.register(Representative)
class RepresentativeAdmin(admin.ModelAdmin):
    # Show the fields most useful for quick browsing and filtering in admin.
    list_display = ['name', 'level', 'party', 'state', 'district_number', 'updated_at']
    list_filter = ['level', 'party', 'state']
    search_fields = ['name', 'state']
    readonly_fields = ['updated_at']

