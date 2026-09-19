import uuid
from django.db import models
from django.conf import settings
from apps.organizations.models import Organization
from apps.clients.models import Client


class ProjectStatus(models.TextChoices):
    PLANNED = 'PLANNED', 'Planned'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    ON_HOLD = 'ON_HOLD', 'On Hold'
    COMPLETED = 'COMPLETED', 'Completed'
    CANCELLED = 'CANCELLED', 'Cancelled'


class ProjectMemberRole(models.TextChoices):
    MANAGER = 'MANAGER', 'Project Manager'
    CONTRIBUTOR = 'CONTRIBUTOR', 'Contributor'
    VIEWER = 'VIEWER', 'Viewer'


class ProjectPriority(models.TextChoices):
    LOW = 'LOW', 'Low'
    MEDIUM = 'MEDIUM', 'Medium'
    HIGH = 'HIGH', 'High'
    URGENT = 'URGENT', 'Urgent'


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='projects')
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='projects')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=ProjectStatus.choices, default=ProjectStatus.PLANNED)
    priority = models.CharField(max_length=20, choices=ProjectPriority.choices, default=ProjectPriority.MEDIUM)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_projects')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class ProjectMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='project_memberships')
    role = models.CharField(max_length=20, choices=ProjectMemberRole.choices, default=ProjectMemberRole.CONTRIBUTOR)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('project', 'user')

    def __str__(self):
        return f"{self.user.email} - {self.project.name} ({self.role})"