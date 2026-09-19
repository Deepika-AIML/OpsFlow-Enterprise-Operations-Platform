from django.contrib import admin

from .models import Task, TaskApprovalHistory, TaskComment


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'organization', 'project', 'status', 'priority', 'assignee', 'due_date', 'is_locked')
    list_filter = ('status', 'priority', 'organization', 'is_locked')
    search_fields = ('title', 'description')


@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    list_display = ('task', 'author', 'created_at')


@admin.register(TaskApprovalHistory)
class TaskApprovalHistoryAdmin(admin.ModelAdmin):
    list_display = ('task', 'from_status', 'to_status', 'actor', 'created_at')
    readonly_fields = [f.name for f in TaskApprovalHistory._meta.fields]

    def has_add_permission(self, request):
        return False
