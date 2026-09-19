from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization

from .models import Notification

User = get_user_model()


class NotificationTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Notif Org")
        self.user_a = User.objects.create_user(
            email="a@test.com", password="password123", organization=self.org, role="EMPLOYEE",
        )
        self.user_b = User.objects.create_user(
            email="b@test.com", password="password123", organization=self.org, role="EMPLOYEE",
        )
        Notification.objects.create(organization=self.org, recipient=self.user_a, verb="Hello A")
        Notification.objects.create(organization=self.org, recipient=self.user_b, verb="Hello B")

    def test_user_only_sees_their_own_notifications(self):
        self.client.force_authenticate(user=self.user_a)
        res = self.client.get('/api/v1/notifications/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data.get('results', res.data) if isinstance(res.data, dict) else res.data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['verb'], "Hello A")

    def test_mark_all_read(self):
        Notification.objects.create(organization=self.org, recipient=self.user_a, verb="Second for A")
        self.client.force_authenticate(user=self.user_a)

        unread_res = self.client.get('/api/v1/notifications/unread-count/')
        self.assertEqual(unread_res.data['unread_count'], 2)

        mark_res = self.client.post('/api/v1/notifications/mark-all-read/')
        self.assertEqual(mark_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mark_res.data['marked_read'], 2)

        unread_res_2 = self.client.get('/api/v1/notifications/unread-count/')
        self.assertEqual(unread_res_2.data['unread_count'], 0)

    def test_cannot_mark_someone_elses_notification_read(self):
        other_notification = Notification.objects.get(recipient=self.user_b)
        self.client.force_authenticate(user=self.user_a)
        res = self.client.post(f'/api/v1/notifications/{other_notification.id}/mark-read/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
