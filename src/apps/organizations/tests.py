from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clients.models import Client

from .models import Organization

User = get_user_model()


class OrganizationRBACTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.admin = User.objects.create_user(
            email="admin@test.com", password="password123", organization=self.org, role="ADMIN",
        )
        self.manager = User.objects.create_user(
            email="manager@test.com", password="password123", organization=self.org, role="MANAGER",
        )

    def test_manager_cannot_manage_organizations(self):
        """Organizations is an Admin-only module end to end."""
        self.client.force_authenticate(user=self.manager)
        res = self.client.get('/api/v1/organizations/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_and_view_organization(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/organizations/', {'name': 'New Division'})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['slug'])  # auto-generated, never supplied by the client

    def test_cannot_delete_organization_with_related_data(self):
        Client.objects.create(name="Some Client", organization=self.org)
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/v1/organizations/{self.org.id}/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_organization_me_available_to_any_authenticated_user(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.get('/api/v1/organizations/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['id'], str(self.org.id))
