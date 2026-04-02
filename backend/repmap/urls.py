from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.http import FileResponse, HttpResponse
from representatives.views import HealthView, SyncStatusView


def spa_view(request):
    index_path = settings.WHITENOISE_ROOT / 'index.html'
    if index_path.exists():
        return FileResponse(open(index_path, 'rb'), content_type='text/html')
    return HttpResponse('Frontend not built', status=503)


urlpatterns = [
    # Standard Django admin.
    path('admin/', admin.site.urls),
    # Infrastructure endpoints — intentionally unversioned so load balancers
    # and container orchestrators don't need updating when the API version bumps.
    path('api/health/', HealthView.as_view()),
    path('api/sync-status/', SyncStatusView.as_view()),
    # All application endpoints live under the versioned prefix.
    path('api/v1/', include('representatives.urls')),
    # Catch-all: serve the React SPA for any non-API route.
    re_path(r'^(?!api/)(?!admin/)(?!static/).*$', spa_view),
]
