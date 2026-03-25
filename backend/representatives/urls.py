from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RepresentativeViewSet, DistrictViewSet

router = DefaultRouter()
router.register(r'representatives', RepresentativeViewSet, basename='representative')
router.register(r'districts', DistrictViewSet, basename='district')

urlpatterns = [
    path('', include(router.urls)),
]
