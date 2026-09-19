from rest_framework import permissions


class IsAdminOrManagerOrReadOnly(permissions.BasePermission):
    """
    Read access for any authenticated org member; write access
    (create/update/delete) restricted to Admin/Manager.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_admin_or_manager
