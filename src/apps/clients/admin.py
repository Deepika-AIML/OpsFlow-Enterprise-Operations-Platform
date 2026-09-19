from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'email', 'phone', 'is_active', 'created_at')
    list_filter = ('is_active', 'organization')
    search_fields = ('name', 'email', 'phone')
