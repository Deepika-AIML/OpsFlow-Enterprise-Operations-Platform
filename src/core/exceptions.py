from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request = context.get('request')
    request_id = getattr(request, 'request_id', None)

    if response is not None:
        code_map = {
            400: "VALIDATION_ERROR",
            401: "AUTHENTICATION_FAILED",
            403: "PERMISSION_DENIED",
            404: "NOT_FOUND",
        }
        error_code = code_map.get(response.status_code, "API_ERROR")
        
        response.data = {
            "error": {
                "code": error_code,
                "message": "Request could not be processed.",
                "details": response.data,
                "request_id": request_id
            }
        }
    else:
        response = Response(
            {
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected server error occurred.",
                    "details": None,
                    "request_id": request_id
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return response