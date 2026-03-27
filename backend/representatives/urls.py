from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RepresentativeViewSet, DistrictViewSet, ZipLookupView, SyncStatusView

router = DefaultRouter()
# Register the app's read-only APIs with DRF's router.
router.register(r'representatives', RepresentativeViewSet, basename='representative')
router.register(r'districts', DistrictViewSet, basename='district')

urlpatterns = [
    # Exposes SyncStatus for the frontend to show data freshness indicators.
    path('sync-status/', SyncStatusView.as_view()),
    # Lightweight ZIP centroid lookup used by the map search box.
    path('zip-lookup/', ZipLookupView.as_view()),
    # Include router-generated endpoints for representatives and district geometry.
    path('', include(router.urls)),
]
