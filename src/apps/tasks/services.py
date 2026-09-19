from django.db import transaction
from django.core.exceptions import ValidationError
from .models import Task, TaskStatus, TaskApprovalHistory
from apps.audit.services import record_audit_log
from apps.audit.models import AuditAction


@transaction.atomic
def transition_task_status(
    task_id: str,
    new_status: str,
    actor,
    notes: str = "",
    request_id: str = None,
    ip_address: str = None,
) -> Task:
    task = Task.objects.select_for_update().get(id=task_id)

    if task.is_locked:
        raise ValidationError("Task is locked and cannot undergo status transitions.")

    if not task.can_transition_to(new_status):
        raise ValidationError(
            f"Invalid transition from '{task.status}' to '{new_status}'."
        )

    old_status = task.status
    task.status = new_status
    task.version += 1

    if new_status in [TaskStatus.APPROVED]:
        task.is_locked = True

    task.save()

    # Record task approval history
    TaskApprovalHistory.objects.create(
        task=task,
        actor=actor,
        from_status=old_status,
        to_status=new_status,
        notes=notes,
    )

    # Record automatic immutable Audit Log entry
    record_audit_log(
        organization=task.organization,
        actor=actor,
        action=AuditAction.WORKFLOW_TRANSITION,
        target_model="Task",
        target_id=task.id,
        changes_json={
            "status": {"old": old_status, "new": new_status},
            "version": {"old": task.version - 1, "new": task.version},
            "notes": notes,
        },
        request_id=request_id,
        ip_address=ip_address,
    )

    return task


def submit_task(
    task_id: str,
    actor,
    notes: str = "",
    request_id: str = None,
    ip_address: str = None,
) -> Task:
    return transition_task_status(
        task_id=task_id,
        new_status=TaskStatus.PENDING_REVIEW,
        actor=actor,
        notes=notes,
        request_id=request_id,
        ip_address=ip_address,
    )


def approve_task(
    task_id: str,
    actor,
    notes: str = "",
    request_id: str = None,
    ip_address: str = None,
) -> Task:
    return transition_task_status(
        task_id=task_id,
        new_status=TaskStatus.APPROVED,
        actor=actor,
        notes=notes,
        request_id=request_id,
        ip_address=ip_address,
    )


def reject_task(
    task_id: str,
    actor,
    notes: str = "",
    request_id: str = None,
    ip_address: str = None,
) -> Task:
    return transition_task_status(
        task_id=task_id,
        new_status=TaskStatus.REJECTED,
        actor=actor,
        notes=notes,
        request_id=request_id,
        ip_address=ip_address,
    )


def request_changes(
    task_id: str,
    actor,
    notes: str = "",
    request_id: str = None,
    ip_address: str = None,
) -> Task:
    return transition_task_status(
        task_id=task_id,
        new_status=TaskStatus.CHANGES_REQUESTED,
        actor=actor,
        notes=notes,
        request_id=request_id,
        ip_address=ip_address,
    )