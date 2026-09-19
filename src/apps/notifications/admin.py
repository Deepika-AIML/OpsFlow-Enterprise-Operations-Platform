from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'verb', 'is_read', 'created_at')
    list_filter = ('is_read', 'organization')
    search_fields = ('recipient__email', 'verb')
    readonly_fields = [f.name for f in Notification._meta.fields]

    def has_add_permission(self, request):
        return False
