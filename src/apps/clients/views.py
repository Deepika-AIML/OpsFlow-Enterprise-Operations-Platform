from rest_framework import permissions, viewsets

from apps.audit.mixins import AuditContextMixin
from apps.audit.models import AuditAction
from apps.audit.permissions import IsAdminOrManagerOrReadOnly
from apps.audit.services import record_audit_log

from .models import Client
from .serializers import ClientSerializer


class ClientViewSet(AuditContextMixin, viewsets.ModelViewSet):
    """Employees can view clients (read-only); creating/editing/deleting a
    client is an Admin/Manager action."""
    serializer_class = ClientSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManagerOrReadOnly]
    filterset_fields = ['is_active']
    search_fields = ['name', 'email', 'phone']
    ordering_fields = ['name', 'created_at']

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Client.objects.none()

        user = self.request.user
        if not user.is_authenticated or not user.organization_id:
            return Client.objects.none()

        return Client.objects.filter(organization=user.organization)

    def perform_create(self, serializer):
        client = serializer.save()
        context = self.get_audit_context()
        record_audit_log(
            organization=client.organization, actor=self.request.user, action=AuditAction.CREATE,
            target_model="Client", target_id=str(client.id),
            changes_json={"name": client.name}, **context,
        )

    def perform_update(self, serializer):
        before = {"name": serializer.instance.name, "is_active": serializer.instance.is_active}
        client = serializer.save()
        after = {"name": client.name, "is_active": client.is_active}
        if before != after:
            context = self.get_audit_context()
            record_audit_log(
                organization=client.organization, actor=self.request.user, action=AuditAction.UPDATE,
                target_model="Client", target_id=str(client.id),
                changes_json={"before": before, "after": after}, **context,
            )

    def perform_destroy(self, instance):
        context = self.get_audit_context()
        record_audit_log(
            organization=instance.organization, actor=self.request.user, action=AuditAction.DELETE,
            target_model="Client", target_id=str(instance.id),
            changes_json={"name": instance.name}, **context,
        )
        instance.delete()
