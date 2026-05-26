from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RepresentativeViewSet, DistrictViewSet, ZipLookupView, SyncStatusView, VotesView, LegislationView, HealthView, ConfigView
from .views_auth import SessionInfoView, LogoutView
from .views_watchlist import WatchlistListCreateView, WatchlistDeleteView, WatchlistStatusView
from .views_report_card import ReportCardView
from .views_elections import ElectionDatesView

router = DefaultRouter()
# Register the app's read-only APIs with DRF's router.
router.register(r'representatives', RepresentativeViewSet, basename='representative')
router.register(r'districts', DistrictViewSet, basename='district')

urlpatterns = [
    # Auth — session info and logout.
    path('auth/session/', SessionInfoView.as_view()),
    path('auth/logout/', LogoutView.as_view()),
    # Watchlist — status/ must come before <int:representative_id>/ to avoid
    # the URL resolver treating "status" as an integer parameter.
    path('watchlist/', WatchlistListCreateView.as_view()),
    path('watchlist/status/', WatchlistStatusView.as_view()),
    path('watchlist/<int:representative_id>/', WatchlistDeleteView.as_view()),
    # Recent votes for a specific legislator, keyed by bioguide_id.
    path('representatives/<str:bioguide_id>/votes/', VotesView.as_view()),
    # Sponsored and cosponsored legislation for a specific legislator.
    path('representatives/<str:bioguide_id>/legislation/', LegislationView.as_view()),
    # Computed accountability report card for a specific legislator.
    path('representatives/<str:bioguide_id>/report-card/', ReportCardView.as_view()),
    # Election date data for a given state.
    path('elections/', ElectionDatesView.as_view()),
    # Exposes SyncStatus for the frontend to show data freshness indicators.
    path('sync-status/', SyncStatusView.as_view()),
    # Lightweight ZIP centroid lookup used by the map search box.
    path('zip-lookup/', ZipLookupView.as_view()),
    # Runtime config for the frontend — exposes MAPBOX_TOKEN without baking it
    # into the JS bundle.
    path('config/', ConfigView.as_view()),
    # Health check for load balancers and container orchestrators.
    path('health/', HealthView.as_view()),
    # Include router-generated endpoints for representatives and district geometry.
    path('', include(router.urls)),
]
