from rest_framework import permissions


class IsOrganizationMember(permissions.BasePermission):
    """
    Ensures that the requesting user belongs to the same organization
    as the requested object/tenant.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.organization)

    def has_object_permission(self, request, view, obj):
        # Tenant isolation check
        if hasattr(obj, 'organization'):
            return obj.organization == request.user.organization
        return True


class IsAdminUserRole(permissions.BasePermission):
    """
    Allows access only to Admins (application role ADMIN or Django
    is_superuser).
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_admin
        )


class IsManagerOrAdmin(permissions.BasePermission):
    """
    Allows access to Admins and Managers.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_admin_or_manager
        )