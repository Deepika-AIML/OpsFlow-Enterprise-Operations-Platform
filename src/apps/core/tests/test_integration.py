from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization

User = get_user_model()


class OpsFlowFullIntegrationTests(APITestCase):
    """
    End-to-end smoke test covering the workflow described in the project
    brief: authenticated CRUD, organization-scoped data isolation,
    backend-enforced RBAC (not just hidden UI buttons), and audit logging.
    """

    def setUp(self):
        self.org_a = Organization.objects.create(name="Org A Inc")
        self.org_b = Organization.objects.create(name="Org B LLC")

        self.admin_a = User.objects.create_user(
            email="admin_a@orga.com", password="password123",
            organization=self.org_a, role="ADMIN",
        )
        self.employee_a = User.objects.create_user(
            email="employee_a@orga.com", password="password123",
            organization=self.org_a, role="EMPLOYEE",
        )
        self.admin_b = User.objects.create_user(
            email="admin_b@orgb.com", password="password123",
            organization=self.org_b, role="ADMIN",
        )

    def test_end_to_end_workflow_and_rbac(self):
        # 1. Admin A creates a Project
        self.client.force_authenticate(user=self.admin_a)
        project_res = self.client.post("/api/v1/projects/", {"name": "Alpha Project"})
        self.assertEqual(project_res.status_code, status.HTTP_201_CREATED)

        # 2. Dashboard reflects real DB counts, not hardcoded numbers
        dash_res = self.client.get("/api/v1/analytics/dashboard/")
        self.assertEqual(dash_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(dash_res.data["operational"]["projects"], 1)
        self.assertIn("users", dash_res.data)  # Admin gets the User Overview block

        # 3. Data isolation: Admin B (different Organization) must not see Org A's project
        self.client.force_authenticate(user=self.admin_b)
        list_res = self.client.get("/api/v1/projects/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        projects = list_res.data.get("results", list_res.data) if isinstance(list_res.data, dict) else list_res.data
        self.assertEqual(len(projects), 0)

        # 4. Backend RBAC: an Employee cannot create a project, regardless of
        #    anything the frontend does or doesn't show them.
        self.client.force_authenticate(user=self.employee_a)
        forbidden_res = self.client.post("/api/v1/projects/", {"name": "Unauthorized Project"})
        self.assertEqual(forbidden_res.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Backend RBAC: an Employee cannot read Audit Logs at all
        forbidden_audit_res = self.client.get("/api/v1/audit-logs/")
        self.assertEqual(forbidden_audit_res.status_code, status.HTTP_403_FORBIDDEN)

        # 6. Admin can, and the project creation above was actually recorded
        self.client.force_authenticate(user=self.admin_a)
        audit_res = self.client.get("/api/v1/audit-logs/")
        self.assertEqual(audit_res.status_code, status.HTTP_200_OK)
        logs = audit_res.data.get("results", audit_res.data) if isinstance(audit_res.data, dict) else audit_res.data
        self.assertGreaterEqual(len(logs), 1)
