from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from apps.audit.mixins import AuditContextMixin
from apps.audit.models import AuditAction
from apps.audit.services import record_audit_log
from apps.notifications.services import notify_user

from .models import Task
from .permissions import TaskPermission
from .serializers import TaskSerializer
from .services import transition_task_status


def _jsonable(value):
    """Best-effort conversion of a model-field value into something
    AuditLog.changes_json (a plain JSONField, no custom encoder) can
    actually store - model instances, UUIDs and dates aren't JSON-
    serializable on their own."""
    from django.db import models as django_models
    if isinstance(value, django_models.Model):
        return str(value.pk)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


class TaskViewSet(AuditContextMixin, viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [TaskPermission]
    filterset_fields = ['status', 'priority', 'project', 'assignee']
    search_fields = ['title', 'description']
    ordering_fields = ['due_date', 'priority', 'status', 'created_at', 'title']

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Task.objects.none()

        user = self.request.user
        if not user.is_authenticated or not user.organization_id:
            return Task.objects.none()

        # Scope by the task's own organization (NOT project__organization -
        # project is optional on a task, and filtering through it silently
        # hid every task that had no project attached).
        queryset = Task.objects.filter(organization=user.organization).select_related(
            'project', 'assignee', 'created_by'
        )

        if self.request.query_params.get('assigned_to_me') in ('true', '1'):
            queryset = queryset.filter(assignee=user)

        return queryset

    def perform_create(self, serializer):
        task = serializer.save(organization=self.request.user.organization, created_by=self.request.user)

        context = self.get_audit_context()
        record_audit_log(
            organization=task.organization,
            actor=self.request.user,
            action=AuditAction.CREATE,
            target_model="Task",
            target_id=str(task.id),
            changes_json={"title": task.title, "status": task.status},
            **context,
        )
        if task.assignee_id and task.assignee_id != self.request.user.id:
            notify_user(
                recipient=task.assignee,
                verb=f'You were assigned a new task: "{task.title}"',
                target_model="Task",
                target_id=str(task.id),
            )

    def perform_update(self, serializer):
        task = serializer.instance
        previous_assignee_id = task.assignee_id
        user = self.request.user
        context = self.get_audit_context()

        # Employees may only ever change the status of a task assigned to
        # them - has_object_permission already confirmed ownership, this
        # strips every other field so a crafted request body can't sneak
        # extra changes through on the same PATCH.
        if not user.is_admin_or_manager:
            allowed = {'status'}
            for field in list(serializer.validated_data.keys()):
                if field not in allowed:
                    serializer.validated_data.pop(field)

        new_status = serializer.validated_data.pop('status', None)
        non_status_changes = dict(serializer.validated_data)

        # Plain field edits (title/description/project/assignee/priority/
        # due_date) go through the serializer as usual.
        if non_status_changes:
            before = {k: getattr(task, k) for k in non_status_changes}
            task = serializer.save()
            after = {k: getattr(task, k) for k in non_status_changes}
            if before != after:
                record_audit_log(
                    organization=task.organization, actor=user, action=AuditAction.UPDATE,
                    target_model="Task", target_id=str(task.id),
                    changes_json={"before": _jsonable(before), "after": _jsonable(after)},
                    **context,
                )

        # Status transitions are delegated to the existing service layer,
        # which applies the ALLOWED_TRANSITIONS state machine atomically
        # (select_for_update), locks the task on APPROVED, records
        # TaskApprovalHistory, and writes its own WORKFLOW_TRANSITION audit
        # entry - duplicating that logic here would just be two competing
        # sources of truth for the same rule.
        if new_status and new_status != task.status:
            try:
                task = transition_task_status(
                    task_id=str(task.id), new_status=new_status, actor=user,
                    request_id=context.get('request_id'), ip_address=context.get('ip_address'),
                )
            except DjangoValidationError as exc:
                raise ValidationError({"status": exc.messages if hasattr(exc, "messages") else str(exc)})
            serializer.instance = task
            for recipient in {task.assignee, task.created_by}:
                if recipient and recipient.id != user.id:
                    notify_user(
                        recipient=recipient,
                        verb=f'Task "{task.title}" status changed to {task.get_status_display()}',
                        target_model="Task",
                        target_id=str(task.id),
                    )

        if task.assignee_id and task.assignee_id != previous_assignee_id and task.assignee_id != user.id:
            notify_user(
                recipient=task.assignee,
                verb=f'You were assigned to task: "{task.title}"',
                target_model="Task",
                target_id=str(task.id),
            )

    def perform_destroy(self, instance):
        context = self.get_audit_context()
        record_audit_log(
            organization=instance.organization,
            actor=self.request.user,
            action=AuditAction.DELETE,
            target_model="Task",
            target_id=str(instance.id),
            changes_json={"title": instance.title},
            **context,
        )
        instance.delete()
