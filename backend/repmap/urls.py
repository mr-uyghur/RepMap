from django.contrib import admin
from django.urls import path, include
from representatives.views import HealthView, SyncStatusView

urlpatterns = [
    # Standard Django admin.
    path('admin/', admin.site.urls),
    # Infrastructure endpoints — intentionally unversioned so load balancers
    # and container orchestrators don't need updating when the API version bumps.
    path('api/health/', HealthView.as_view()),
    path('api/sync-status/', SyncStatusView.as_view()),
    # All application endpoints live under the versioned prefix.
    path('api/v1/', include('representatives.urls')),
]
