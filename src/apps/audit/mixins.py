class AuditContextMixin:
    """Mixin to extract audit metadata from request for service layer calls."""
    
    def get_audit_context(self):
        request = self.request
        return {
            "request_id": (
                request.META.get("HTTP_X_REQUEST_ID")
                or getattr(request, "headers", {}).get("X-Request-ID")
                or getattr(request, "headers", {}).get("x-request-id")
                or getattr(request, "request_id", None)
            ),
            "ip_address": (
                request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
                or request.META.get("REMOTE_ADDR", "127.0.0.1")
            ),
        }