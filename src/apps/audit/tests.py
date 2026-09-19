from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization
from apps.projects.models import Project
from apps.tasks.models import Task, TaskStatus

User = get_user_model()


class AuditLogTestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.project = Project.objects.create(
            organization=self.org, name="Test Project", status="IN_PROGRESS",
        )
        self.admin_user = User.objects.create_user(
            email="admin@test.com", password="password123",
            organization=self.org, role="ADMIN",
        )
        self.employee_user = User.objects.create_user(
            email="employee@test.com", password="password123",
            organization=self.org, role="EMPLOYEE",
        )
        self.task = Task.objects.create(
            project=self.project, organization=self.org, title="Test Task",
            status=TaskStatus.PENDING_REVIEW, created_by=self.admin_user,
        )
        self.task_url = f"/api/v1/tasks/{self.task.id}/"

    def test_request_id_preserved(self):
        """The X-Request-ID header on an action is captured and saved on
        the resulting audit log entry."""
        custom_req_id = "test-trace-id-12345"
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.patch(
            self.task_url, {"status": TaskStatus.APPROVED}, HTTP_X_REQUEST_ID=custom_req_id,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        log = AuditLog.objects.filter(target_model="Task", target_id=str(self.task.id)).last()
        self.assertIsNotNone(log, "No audit log entry was created for this request.")
        self.assertEqual(log.request_id, custom_req_id)

    def test_audit_logs_are_admin_only(self):
        """Any authenticated user could previously read the audit trail;
        it must be Admin-only."""
        self.client.force_authenticate(user=self.employee_user)
        res = self.client.get('/api/v1/audit-logs/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get('/api/v1/audit-logs/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_audit_log_is_immutable_via_api(self):
        """There is no write endpoint for audit logs at all - the ViewSet
        is read-only regardless of role."""
        self.client.force_authenticate(user=self.admin_user)
        log = AuditLog.objects.first()
        if log is None:
            self.skipTest("no audit log rows to test against")
        res = self.client.delete(f'/api/v1/audit-logs/{log.id}/')
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
