import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from apps.organizations.models import Organization
from apps.projects.models import Project

User = get_user_model()


class TaskStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_REVIEW = "PENDING_REVIEW", "Pending Review"
    CHANGES_REQUESTED = "CHANGES_REQUESTED", "Changes Requested"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class TaskPriority(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    URGENT = "URGENT", "Urgent"


class Task(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="tasks"
    )
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="tasks", null=True, blank=True
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=TaskStatus.choices, default=TaskStatus.DRAFT
    )
    priority = models.CharField(
        max_length=20, choices=TaskPriority.choices, default=TaskPriority.MEDIUM
    )
    assignee = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_tasks"
    )
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="created_tasks"
    )
    due_date = models.DateTimeField(null=True, blank=True)
    is_locked = models.BooleanField(
        default=False, help_text="Locked once approved/rejected to prevent further updates."
    )
    version = models.PositiveIntegerField(
        default=1, help_text="Version counter for optimistic locking and change tracking."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    ALLOWED_TRANSITIONS = {
        TaskStatus.DRAFT: [TaskStatus.PENDING_REVIEW],
        TaskStatus.PENDING_REVIEW: [
            TaskStatus.APPROVED,
            TaskStatus.REJECTED,
            TaskStatus.CHANGES_REQUESTED,
        ],
        TaskStatus.CHANGES_REQUESTED: [TaskStatus.PENDING_REVIEW],
        TaskStatus.APPROVED: [],
        TaskStatus.REJECTED: [TaskStatus.DRAFT],
    }

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["project", "status"]),
        ]

    def __str__(self):
        return f"{self.title} [{self.status}]"

    def can_transition_to(self, new_status: str) -> bool:
        allowed = self.ALLOWED_TRANSITIONS.get(self.status, [])
        return new_status in allowed


class TaskComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="task_comments")
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.author.email} on Task {self.task_id}"


class TaskApprovalHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="approval_history")
    actor = models.ForeignKey(User, on_delete=models.CASCADE)
    from_status = models.CharField(max_length=20, choices=TaskStatus.choices)
    to_status = models.CharField(max_length=20, choices=TaskStatus.choices)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.task.title}: {self.from_status} -> {self.to_status} by {self.actor.email}"


# Legacy / View import aliases
Approval = TaskApprovalHistory
ApprovalStatus = TaskStatus