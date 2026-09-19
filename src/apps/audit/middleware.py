import uuid
import threading

_thread_locals = threading.local()

def get_current_request():
    return getattr(_thread_locals, "request", None)

class AuditContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 1. Extract or generate Request ID
        req_id = (
            request.META.get("HTTP_X_REQUEST_ID")
            or getattr(request, "headers", {}).get("X-Request-ID")
            or getattr(request, "headers", {}).get("x-request-id")
            or str(uuid.uuid4())
        )
        request.request_id = req_id

        # 2. Extract Client IP
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR") or getattr(
            request, "headers", {}
        ).get("X-Forwarded-For")
        if x_forwarded:
            request.ip_address = x_forwarded.split(",")[0].strip()
        else:
            request.ip_address = request.META.get("REMOTE_ADDR", "127.0.0.1")

        _thread_locals.request = request

        try:
            response = self.get_response(request)
            # 3. Ensure header is injected globally on every response
            if response is not None:
                response["X-Request-ID"] = req_id
            return response
        finally:
            _thread_locals.request = None