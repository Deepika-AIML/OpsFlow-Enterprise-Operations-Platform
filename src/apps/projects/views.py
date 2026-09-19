from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.mixins import AuditContextMixin
from apps.audit.models import AuditAction
from apps.audit.permissions import IsAdminOrManagerOrReadOnly
from apps.audit.services import record_audit_log

from .models import Project, ProjectMember
from .serializers import AddProjectMemberSerializer, ProjectSerializer


class ProjectViewSet(AuditContextMixin, viewsets.ModelViewSet):
    """Employees can view projects (read-only); creating/editing/deleting a
    project, and managing its members, is an Admin/Manager action."""
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManagerOrReadOnly]
    filterset_fields = ['status', 'priority', 'client']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'start_date', 'end_date', 'priority', 'status', 'created_at']

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Project.objects.none()

        user = self.request.user
        if not user.is_authenticated or not user.organization_id:
            return Project.objects.none()

        return Project.objects.filter(organization=user.organization).select_related('client', 'created_by')

    def perform_create(self, serializer):
        project = serializer.save()
        context = self.get_audit_context()
        record_audit_log(
            organization=project.organization, actor=self.request.user, action=AuditAction.CREATE,
            target_model="Project", target_id=str(project.id),
            changes_json={"name": project.name, "status": project.status}, **context,
        )

    def perform_update(self, serializer):
        before = {"name": serializer.instance.name, "status": serializer.instance.status, "priority": serializer.instance.priority}
        project = serializer.save()
        after = {"name": project.name, "status": project.status, "priority": project.priority}
        if before != after:
            context = self.get_audit_context()
            record_audit_log(
                organization=project.organization, actor=self.request.user, action=AuditAction.UPDATE,
                target_model="Project", target_id=str(project.id),
                changes_json={"before": before, "after": after}, **context,
            )

    def perform_destroy(self, instance):
        context = self.get_audit_context()
        record_audit_log(
            organization=instance.organization, actor=self.request.user, action=AuditAction.DELETE,
            target_model="Project", target_id=str(instance.id),
            changes_json={"name": instance.name}, **context,
        )
        instance.delete()

    @action(detail=True, methods=['post'], url_path='members', permission_classes=[permissions.IsAuthenticated, IsAdminOrManagerOrReadOnly])
    def add_member(self, request, pk=None):
        project = self.get_object()
        serializer = AddProjectMemberSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        member, created = ProjectMember.objects.update_or_create(
            project=project, user=serializer.validated_data['user'],
            defaults={'role': serializer.validated_data.get('role', ProjectMember._meta.get_field('role').default)},
        )
        return Response(ProjectSerializer(project, context={'request': request}).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path='members/(?P<user_id>[^/.]+)', permission_classes=[permissions.IsAuthenticated, IsAdminOrManagerOrReadOnly])
    def remove_member(self, request, pk=None, user_id=None):
        project = self.get_object()
        ProjectMember.objects.filter(project=project, user_id=user_id).delete()
        return Response(ProjectSerializer(project, context={'request': request}).data, status=status.HTTP_200_OK)
