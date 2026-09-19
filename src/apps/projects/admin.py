from django.contrib import admin

from .models import Project, ProjectMember


class ProjectMemberInline(admin.TabularInline):
    model = ProjectMember
    extra = 0


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'client', 'status', 'priority', 'start_date', 'end_date')
    list_filter = ('status', 'priority', 'organization')
    search_fields = ('name', 'description')
    inlines = [ProjectMemberInline]
