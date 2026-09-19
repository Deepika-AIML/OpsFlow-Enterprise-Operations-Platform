from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization

User = get_user_model()


class PublicSignupTests(APITestCase):
    """These are the two most important tests in the whole project: the
    original bug allowed a public signup to choose its own role, including
    Admin."""

    def test_signup_ignores_any_role_sent_by_the_client(self):
        res = self.client.post('/api/v1/auth/register/', {
            'full_name': 'Eve Employee',
            'email': 'eve@example.com',
            'password': 'StrongPassw0rd!',
            'password_confirm': 'StrongPassw0rd!',
            'role': 'ADMIN',  # attempted injection - must be ignored entirely
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='eve@example.com')
        self.assertEqual(user.role, 'EMPLOYEE')
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_signup_requires_matching_password_confirmation(self):
        res = self.client.post('/api/v1/auth/register/', {
            'full_name': 'Eve Employee',
            'email': 'eve2@example.com',
            'password': 'StrongPassw0rd!',
            'password_confirm': 'SomethingElse!',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_signup_assigns_the_default_organization(self):
        self.client.post('/api/v1/auth/register/', {
            'full_name': 'Eve Employee',
            'email': 'eve3@example.com',
            'password': 'StrongPassw0rd!',
            'password_confirm': 'StrongPassw0rd!',
        })
        user = User.objects.get(email='eve3@example.com')
        self.assertIsNotNone(user.organization)


class LoginTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Login Org")
        self.user = User.objects.create_user(
            email="login@test.com", password="password123", organization=self.org, role="MANAGER",
        )

    def test_login_embeds_role_and_never_uses_a_role_supplied_by_the_client(self):
        res = self.client.post('/api/v1/auth/token/', {
            'email': 'login@test.com', 'password': 'password123', 'role': 'ADMIN',
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertEqual(res.data['user']['role'], 'MANAGER')

    def test_login_rejects_wrong_password(self):
        res = self.client.post('/api/v1/auth/token/', {'email': 'login@test.com', 'password': 'wrong'})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class UserManagementTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Mgmt Org")
        self.admin = User.objects.create_user(
            email="admin@test.com", password="password123",
            organization=self.org, role="ADMIN", is_staff=True, is_superuser=True,
        )
        self.employee = User.objects.create_user(
            email="employee@test.com", password="password123", organization=self.org, role="EMPLOYEE",
        )

    def test_non_admin_cannot_access_user_management(self):
        self.client.force_authenticate(user=self.employee)
        res = self.client.get('/api/v1/admin/users/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_promote_employee_to_manager(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'/api/v1/admin/users/{self.employee.id}/', {'role': 'MANAGER'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.role, 'MANAGER')

    def test_admin_role_cannot_be_assigned_through_the_api(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'/api/v1/admin/users/{self.employee.id}/', {'role': 'ADMIN'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sole_admin_cannot_be_demoted(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'/api/v1/admin/users/{self.admin.id}/', {'role': 'EMPLOYEE'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sole_admin_cannot_be_deactivated(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'/api/v1/admin/users/{self.admin.id}/', {'is_active': False})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class ProfileSelfServiceTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Profile Org")
        self.employee = User.objects.create_user(
            email="employee@test.com", password="password123", organization=self.org, role="EMPLOYEE",
        )

    def test_user_cannot_escalate_their_own_role_via_me_endpoint(self):
        self.client.force_authenticate(user=self.employee)
        res = self.client.patch('/api/v1/auth/me/', {'first_name': 'New Name', 'role': 'ADMIN'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.first_name, 'New Name')
        self.assertEqual(self.employee.role, 'EMPLOYEE')


class PasswordResetTests(APITestCase):
    def test_password_reset_request_always_returns_200(self):
        """Doesn't reveal whether the email is registered."""
        res = self.client.post('/api/v1/auth/password-reset/', {'email': 'nobody@nowhere.com'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
