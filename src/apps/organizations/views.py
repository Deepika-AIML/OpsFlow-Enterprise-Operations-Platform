from rest_framework import generics, permissions, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.mixins import AuditContextMixin
from apps.audit.models import AuditAction
from apps.audit.services import record_audit_log
from core.permissions import IsAdminUserRole, IsOrganizationMember

from .models import Department, Organization
from .serializers import DepartmentSerializer, OrganizationSerializer


class OrganizationViewSet(AuditContextMixin, viewsets.ModelViewSet):
    """
    Organizations are how OpsFlow partitions data for larger deployments
    (each Organization has its own Clients/Projects/Tasks/Users). Only
    Admin manages this module - Manager/Employee never see it in the
    sidebar, and the API enforces the same boundary independently of the
    frontend.
    """
    serializer_class = OrganizationSerializer
    permission_classes = [IsAdminUserRole]
    queryset = Organization.objects.all().order_by('name')
    search_fields = ['name']
    filterset_fields = ['is_active']
    ordering_fields = ['name', 'created_at']

    def perform_create(self, serializer):
        org = serializer.save()
        context = self.get_audit_context()
        record_audit_log(
            organization=org, actor=self.request.user, action=AuditAction.CREATE,
            target_model="Organization", target_id=str(org.id),
            changes_json={"name": org.name}, **context,
        )

    def perform_update(self, serializer):
        before = {"name": serializer.instance.name, "is_active": serializer.instance.is_active}
        org = serializer.save()
        context = self.get_audit_context()
        after = {"name": org.name, "is_active": org.is_active}
        if before != after:
            record_audit_log(
                organization=org, actor=self.request.user, action=AuditAction.UPDATE,
                target_model="Organization", target_id=str(org.id),
                changes_json={"before": before, "after": after}, **context,
            )

    def perform_destroy(self, instance):
        related_counts = {
            "users": instance.users.count(),
            "clients": instance.clients.count(),
            "projects": instance.projects.count(),
            "tasks": instance.tasks.count(),
        }
        if any(related_counts.values()):
            raise ValidationError(
                "This organization still has users, clients, projects, or tasks attached to it "
                "and cannot be deleted. Reassign or remove that data first."
            )
        context = self.get_audit_context()
        record_audit_log(
            organization=instance, actor=self.request.user, action=AuditAction.DELETE,
            target_model="Organization", target_id=str(instance.id),
            changes_json={"name": instance.name}, **context,
        )
        instance.delete()


class OrganizationMeView(generics.RetrieveAPIView):
    """GET /api/v1/organizations/me/ - any authenticated user can see their
    own organization's basic info (e.g. to display on their profile page)."""
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_object(self):
        return self.request.user.organization


class DepartmentListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/departments/ - scoped to the requester's own
    organization. Read is open to any authenticated org member; creating a
    department is an Admin/Manager action."""
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_permissions(self):
        if self.request.method == 'POST':
            from core.permissions import IsManagerOrAdmin
            return [permissions.IsAuthenticated(), IsManagerOrAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        return Department.objects.filter(organization=self.request.user.organization)


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/departments/<id>/ - Admin/Manager only for writes."""
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            from core.permissions import IsManagerOrAdmin
            return [permissions.IsAuthenticated(), IsManagerOrAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        return Department.objects.filter(organization=self.request.user.organization)
