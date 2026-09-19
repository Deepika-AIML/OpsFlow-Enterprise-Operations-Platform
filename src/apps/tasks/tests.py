from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.projects.models import Project

from .models import Task, TaskStatus

User = get_user_model()


class TaskWorkflowTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")

        self.admin_user = User.objects.create_user(
            email="admin@test.com", password="password123",
            organization=self.org, role="ADMIN",
        )
        self.employee_user = User.objects.create_user(
            email="employee@test.com", password="password123",
            organization=self.org, role="EMPLOYEE",
        )
        self.other_employee = User.objects.create_user(
            email="other@test.com", password="password123",
            organization=self.org, role="EMPLOYEE",
        )

        self.project = Project.objects.create(
            organization=self.org, name="Test Project", status="IN_PROGRESS",
        )

        self.task = Task.objects.create(
            project=self.project,
            organization=self.org,
            title="Test Task",
            status=TaskStatus.PENDING_REVIEW,
            assignee=self.employee_user,
            created_by=self.admin_user,
        )
        self.task_url = f"/api/v1/tasks/{self.task.id}/"

    def test_task_serializer_exposes_priority_and_assignee(self):
        """Regression test: task creation used to fail because the
        serializer omitted `priority`/`assignee`/`organization` entirely."""
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.post('/api/v1/tasks/', {
            'title': 'New Task', 'priority': 'HIGH', 'assignee': str(self.employee_user.id),
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['priority'], 'HIGH')
        self.assertEqual(res.data['assignee'], str(self.employee_user.id))

    def test_employee_cannot_edit_task_not_assigned_to_them(self):
        self.client.force_authenticate(user=self.other_employee)
        res = self.client.patch(self.task_url, {'status': TaskStatus.APPROVED})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_assigned_employee_can_only_change_status(self):
        """The assignee may move the task through the workflow, but cannot
        change other fields (e.g. re-assign it to themselves) on the same request."""
        self.client.force_authenticate(user=self.employee_user)
        res = self.client.patch(self.task_url, {
            'status': TaskStatus.CHANGES_REQUESTED,
            'title': 'Hijacked title',
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], TaskStatus.CHANGES_REQUESTED)
        self.assertEqual(res.data['title'], 'Test Task')  # title change was silently ignored

    def test_invalid_status_transition_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        # PENDING_REVIEW -> DRAFT is not an allowed transition.
        res = self.client.patch(self.task_url, {'status': TaskStatus.DRAFT})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_approval_locks_the_task(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.patch(self.task_url, {'status': TaskStatus.APPROVED})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_locked'])

        # Once locked, even an Admin can't push another change through.
        res2 = self.client.patch(self.task_url, {'title': 'Should be blocked'})
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
