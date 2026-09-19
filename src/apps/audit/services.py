import uuid
from .models import AuditLog
from .middleware import get_current_request


def record_audit_log(
    organization,
    actor,
    action: str,
    target_model: str,
    target_id: str,
    changes_json: dict = None,
    request_id: str = None,
    ip_address: str = None,
) -> AuditLog:
    req = get_current_request()

    # If req is a DRF Request object, unwrap it to get the underlying HttpRequest
    if req and hasattr(req, "_request"):
        raw_req = req._request
    else:
        raw_req = req

    # Resolution hierarchy for request_id
    if not request_id:
        if raw_req and getattr(raw_req, "request_id", None):
            request_id = raw_req.request_id
        elif raw_req and hasattr(raw_req, "META") and raw_req.META.get("HTTP_X_REQUEST_ID"):
            request_id = raw_req.META.get("HTTP_X_REQUEST_ID")
        elif req and getattr(req, "request_id", None):
            request_id = req.request_id
        else:
            request_id = str(uuid.uuid4())

    # Resolution hierarchy for ip_address
    if not ip_address:
        if raw_req and getattr(raw_req, "ip_address", None):
            ip_address = raw_req.ip_address
        elif req and getattr(req, "ip_address", None):
            ip_address = req.ip_address
        else:
            ip_address = "127.0.0.1"

    log_entry = AuditLog.objects.create(
        organization=organization,
        actor=actor,
        action=action,
        target_model=target_model,
        target_id=str(target_id),
        changes_json=changes_json or {},
        request_id=request_id,
        ip_address=ip_address,
    )

    return log_entry