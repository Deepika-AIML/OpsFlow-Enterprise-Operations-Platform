import uuid

from django.conf import settings
from django.db import models

from apps.organizations.models import Organization


class Notification(models.Model):
    """
    Simple in-app notification, delivered by REST polling (no WebSockets /
    external push service - keeps the stack to what the project actually
    needs). Always scoped to a single recipient; a user only ever sees
    their own notifications regardless of role.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='notifications')
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    verb = models.CharField(max_length=255)
    target_model = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'notifications_notification'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read', '-created_at']),
        ]

    def __str__(self):
        return f"{self.recipient.email}: {self.verb}"
