from .models import Notification


def notify_user(recipient, verb, target_model='', target_id=''):
    """Create a single in-app notification for one user. Failures here
    should never break the calling request (a notification is a nice-to-have,
    not critical path), so callers can call this fire-and-forget."""
    if not recipient:
        return None
    return Notification.objects.create(
        organization=recipient.organization,
        recipient=recipient,
        verb=verb,
        target_model=target_model,
        target_id=str(target_id) if target_id else '',
    )
