from django.apps import AppConfig


class RepresentativesConfig(AppConfig):
    # Register the app and use BigAutoField for primary keys by default.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'representatives'
