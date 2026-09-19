from rest_framework import permissions


class TaskPermission(permissions.BasePermission):
    """
    - Admin / Manager: full CRUD on tasks within their organization.
    - Employee: can read any task in their organization (for visibility
      into team work), and can update ONLY the `status` field of a task
      assigned to them (the view strips any other field they attempt to
      change) - e.g. moving a task from DRAFT to PENDING_REVIEW. Employees
      cannot create, delete, or edit tasks that aren't assigned to them.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if view.action == 'create':
            return request.user.is_admin_or_manager
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_admin_or_manager:
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.method in ('PUT', 'PATCH') and obj.assignee_id == user.id:
            return True
        return False
