from rest_framework import permissions, viewsets

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Audit Logs are Admin-only, full stop - this was previously reachable by
    any authenticated user, which defeated the point of an audit trail.
    """
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['action', 'target_model', 'actor']
    search_fields = ['target_model', 'target_id']
    ordering_fields = ['timestamp']

    def get_permissions(self):
        from core.permissions import IsAdminUserRole
        return [permissions.IsAuthenticated(), IsAdminUserRole()]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AuditLog.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return AuditLog.objects.none()

        # Admin's remit spans every Organization in the deployment (same
        # scope as the Organizations module and the analytics dashboard).
        if user.is_admin:
            return AuditLog.objects.all().select_related('actor', 'organization')
        return AuditLog.objects.none()
