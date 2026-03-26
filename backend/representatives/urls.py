from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RepresentativeViewSet, DistrictViewSet, ZipLookupView

router = DefaultRouter()
router.register(r'representatives', RepresentativeViewSet, basename='representative')
router.register(r'districts', DistrictViewSet, basename='district')

urlpatterns = [
    path('zip-lookup/', ZipLookupView.as_view()),
    path('', include(router.urls)),
]
