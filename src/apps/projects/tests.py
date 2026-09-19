from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.projects.models import Project

User = get_user_model()


class ProjectTenantAndRBACTests(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Org A", slug="org-a-proj")
        self.admin_a = User.objects.create_user(
            email="admin_a_proj@test.com", password="password123",
            organization=self.org_a, role="ADMIN",
        )
        self.employee_a = User.objects.create_user(
            email="employee_a_proj@test.com", password="password123",
            organization=self.org_a, role="EMPLOYEE",
        )
        self.project_a = Project.objects.create(
            name="Project A", organization=self.org_a, status="IN_PROGRESS"
        )

        self.org_b = Organization.objects.create(name="Org B", slug="org-b-proj")
        self.project_b = Project.objects.create(
            name="Project B", organization=self.org_b, status="PLANNED"
        )

    def test_tenant_isolation_list(self):
        """A user from Org A cannot see projects from Org B."""
        self.client.force_authenticate(user=self.employee_a)
        response = self.client.get('/api/v1/projects/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data.get('results', []) if isinstance(response.data, dict) else response.data
        project_ids = [str(p['id']) for p in data]
        self.assertIn(str(self.project_a.id), project_ids)
        self.assertNotIn(str(self.project_b.id), project_ids)

    def test_rbac_project_creation(self):
        """An Employee cannot create a project; Admin can, and the new
        project defaults to MEDIUM priority."""
        self.client.force_authenticate(user=self.employee_a)
        res_employee = self.client.post('/api/v1/projects/', {'name': 'Unauthorized Project'})
        self.assertEqual(res_employee.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_a)
        res_admin = self.client.post('/api/v1/projects/', {'name': 'Authorized Project'})
        self.assertEqual(res_admin.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_admin.data['priority'], 'MEDIUM')
