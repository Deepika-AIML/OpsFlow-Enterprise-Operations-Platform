import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from apps.organizations.models import Organization

User = get_user_model()


class AuditAction(models.TextChoices):
    CREATE = "CREATE", "Create"
    UPDATE = "UPDATE", "Update"
    DELETE = "DELETE", "Delete"
    WORKFLOW_TRANSITION = "WORKFLOW_TRANSITION", "Workflow Transition"
    LOGIN = "LOGIN", "Login"
    LOGOUT = "LOGOUT", "Logout"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_actions"
    )
    action = models.CharField(max_length=50, choices=AuditAction.choices)
    target_model = models.CharField(max_length=100)
    target_id = models.CharField(max_length=255, blank=True)
    changes_json = models.JSONField(
        default=dict, help_text="Diff showing changed fields"
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    request_id = models.CharField(max_length=255, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["organization", "-timestamp"]),
            models.Index(fields=["target_model", "target_id"]),
            models.Index(fields=["actor", "-timestamp"]),
        ]

    def __str__(self):
        actor_email = self.actor.email if self.actor else "System"
        return f"[{self.timestamp}] {actor_email} {self.action} {self.target_model}:{self.target_id}"

    def save(self, *args, **kwargs):
        if self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise ValidationError("Audit records are immutable and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit records are immutable and cannot be deleted.")