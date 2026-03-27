from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # Standard Django admin.
    path('admin/', admin.site.urls),
    # Mount the representatives app under /api/.
    path('api/', include('representatives.urls')),
]
