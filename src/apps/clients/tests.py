from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clients.models import Client
from apps.organizations.models import Organization

User = get_user_model()


class ClientTenantAndRBACTests(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Org A")
        self.admin_a = User.objects.create_user(
            email="admin_a@test.com", password="password123",
            organization=self.org_a, role="ADMIN",
        )
        self.employee_a = User.objects.create_user(
            email="employee_a@test.com", password="password123",
            organization=self.org_a, role="EMPLOYEE",
        )
        self.client_a = Client.objects.create(name="Client A", organization=self.org_a)

        self.org_b = Organization.objects.create(name="Org B")
        self.admin_b = User.objects.create_user(
            email="admin_b@test.com", password="password123",
            organization=self.org_b, role="ADMIN",
        )
        self.client_b = Client.objects.create(name="Client B", organization=self.org_b)

    def test_tenant_isolation_list(self):
        """A user from Org A cannot see clients from Org B."""
        self.client.force_authenticate(user=self.employee_a)
        response = self.client.get('/api/v1/clients/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        client_ids = [c['id'] for c in data]
        self.assertIn(str(self.client_a.id), client_ids)
        self.assertNotIn(str(self.client_b.id), client_ids)

    def test_tenant_isolation_detail(self):
        """A user from Org A gets 404 (not 403) for a client in Org B - it's
        outside their queryset entirely, not merely forbidden."""
        self.client.force_authenticate(user=self.employee_a)
        response = self.client.get(f'/api/v1/clients/{self.client_b.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_employee_read_only_admin_can_write(self):
        """An Employee can list/view clients but not create one; Admin can."""
        self.client.force_authenticate(user=self.employee_a)
        res_employee = self.client.post('/api/v1/clients/', {'name': 'New Client'})
        self.assertEqual(res_employee.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_a)
        res_admin = self.client.post('/api/v1/clients/', {'name': 'New Client'})
        self.assertEqual(res_admin.status_code, status.HTTP_201_CREATED)
