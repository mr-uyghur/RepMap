from rest_framework.response import Response
from rest_framework.views import APIView


class SessionInfoView(APIView):
    """GET /api/v1/auth/session/ — returns current user info or anonymous state."""

    def get(self, request):
        if request.user.is_authenticated:
            return Response({
                'is_authenticated': True,
                'user': {
                    'id': request.user.id,
                    'email': request.user.email,
                    'display_name': (
                        request.user.get_full_name() or request.user.email
                    ),
                },
            })
        return Response({'is_authenticated': False, 'user': None})


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — clears the session."""

    def post(self, request):
        from django.contrib.auth import logout
        logout(request)
        return Response({'status': 'ok'})
