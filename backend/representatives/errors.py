from rest_framework import status as http_status
from rest_framework.response import Response


def error_response(message: str, detail: str | None = None, status: int = http_status.HTTP_400_BAD_REQUEST) -> Response:
    """Return a DRF Response with the standard application error shape.

    Shape: {"error": "<message>"} or {"error": "...", "detail": "..."} when detail is provided.
    Never used for infrastructure endpoints (HealthView uses its own shape).
    """
    body: dict = {'error': message}
    if detail is not None:
        body['detail'] = detail
    return Response(body, status=status)
