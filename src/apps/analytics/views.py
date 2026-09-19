from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.clients.models import Client
from apps.organizations.models import Organization
from apps.projects.models import Project, ProjectStatus
from apps.tasks.models import Task, TaskStatus

User = get_user_model()

# Actions safe to surface to every role in the "Recent Activity" dashboard
# widget. Admins get the unfiltered feed on the dedicated Audit Logs page;
# this widget deliberately hides login/logout and role-change entries from
# Manager/Employee so they aren't shown other people's account activity.
SAFE_ACTIVITY_TARGETS = ["Organization", "Client", "Project", "Task"]


def _scope(user):
    """Admin's remit is the whole deployment; everyone else is scoped to
    their own Organization. Returns (organizations_qs, clients_qs,
    projects_qs, tasks_qs, users_qs_or_None)."""
    if user.is_admin:
        return (
            Organization.objects.all(),
            Client.objects.all(),
            Project.objects.all(),
            Task.objects.all(),
            User.objects.all(),
        )
    org = user.organization
    return (
        Organization.objects.filter(pk=org.pk),
        Client.objects.filter(organization=org),
        Project.objects.filter(organization=org),
        Task.objects.filter(organization=org),
        None,
    )


class DashboardOverviewView(APIView):
    """GET /api/v1/analytics/dashboard/ - the 4 operational totals for
    everyone, plus a User Overview block for Admin only. All numbers come
    straight from the database - nothing here is hardcoded."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        orgs, clients, projects, tasks, users = _scope(user)

        data = {
            "scope": "global" if user.is_admin else "organization",
            "operational": {
                "organizations": orgs.count(),
                "clients": clients.count(),
                "projects": projects.count(),
                "tasks": tasks.count(),
            },
        }

        if users is not None:
            # "Total Users" = application accounts only. Clients are a
            # separate business entity and are never counted as users.
            data["users"] = {
                "total_users": users.count(),
                "employees": users.filter(role="EMPLOYEE").count(),
                "managers": users.filter(role="MANAGER").count(),
                "admins": users.filter(role="ADMIN").count(),
                "active_users": users.filter(is_active=True).count(),
                "inactive_users": users.filter(is_active=False).count(),
            }

        return Response(data)


class GrowthAnalyticsView(APIView):
    """GET /api/v1/analytics/growth/?range=7d|30d|6m|1y - counts of new
    Clients/Projects/Tasks created within the selected window, bucketed by
    day (7d/30d), week (6m) or month (1y)."""
    permission_classes = [IsAuthenticated]

    RANGE_CONFIG = {
        "7d": {"days": 7, "trunc": TruncDate, "label_fmt": "%b %d"},
        "30d": {"days": 30, "trunc": TruncDate, "label_fmt": "%b %d"},
        "6m": {"days": 182, "trunc": TruncWeek, "label_fmt": "%b %d"},
        "1y": {"days": 365, "trunc": TruncMonth, "label_fmt": "%b %Y"},
    }

    def get(self, request):
        range_key = request.query_params.get("range", "30d")
        config = self.RANGE_CONFIG.get(range_key, self.RANGE_CONFIG["30d"])

        user = request.user
        orgs, clients, projects, tasks, _ = _scope(user)
        since = timezone.now() - timedelta(days=config["days"])

        def bucketed_counts(queryset):
            rows = (
                queryset.filter(created_at__gte=since)
                .annotate(bucket=config["trunc"]("created_at"))
                .values("bucket")
                .annotate(count=Count("id"))
                .order_by("bucket")
            )
            return {row["bucket"]: row["count"] for row in rows if row["bucket"]}

        series_data = {
            "organizations": bucketed_counts(orgs),
            "clients": bucketed_counts(clients),
            "projects": bucketed_counts(projects),
            "tasks": bucketed_counts(tasks),
        }

        all_buckets = sorted(set().union(*[d.keys() for d in series_data.values()]))
        labels = [b.strftime(config["label_fmt"]) for b in all_buckets]
        series = {
            name: [values.get(b, 0) for b in all_buckets]
            for name, values in series_data.items()
        }

        return Response({"range": range_key, "labels": labels, "series": series})


class ResourceDistributionView(APIView):
    """GET /api/v1/analytics/distribution/?type=organizations|clients|projects|tasks
    Powers the "Resource Distribution" chart's click-through breakdown."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        resource_type = request.query_params.get("type", "projects")
        user = request.user
        orgs, clients, projects, tasks, _ = _scope(user)

        if resource_type == "organizations":
            if not user.is_admin:
                return Response({"detail": "Organizations breakdown is Admin-only."}, status=403)
            breakdown = {
                "active": orgs.filter(is_active=True).count(),
                "inactive": orgs.filter(is_active=False).count(),
            }
            return Response({"type": "organizations", "total": orgs.count(), "breakdown": breakdown})

        if resource_type == "clients":
            breakdown = {
                "active": clients.filter(is_active=True).count(),
                "inactive": clients.filter(is_active=False).count(),
            }
            return Response({"type": "clients", "total": clients.count(), "breakdown": breakdown})

        if resource_type == "tasks":
            breakdown = {choice.value: tasks.filter(status=choice.value).count() for choice in TaskStatus}
            by_priority = {p: tasks.filter(priority=p).count() for p in ["LOW", "MEDIUM", "HIGH", "URGENT"]}
            return Response({"type": "tasks", "total": tasks.count(), "breakdown": breakdown, "by_priority": by_priority})

        # default / "projects"
        breakdown = {choice.value: projects.filter(status=choice.value).count() for choice in ProjectStatus}
        return Response({"type": "projects", "total": projects.count(), "breakdown": breakdown})


class RecentActivityView(APIView):
    """GET /api/v1/analytics/recent-activity/ - powers the dashboard's
    Recent Activity widget for every role (the full, unfiltered feed lives
    on the Admin-only Audit Logs page instead)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        limit = int(request.query_params.get("limit", 15))

        if user.is_admin:
            queryset = AuditLog.objects.all()
        else:
            queryset = AuditLog.objects.filter(
                organization=user.organization, target_model__in=SAFE_ACTIVITY_TARGETS
            )

        entries = queryset.select_related("actor").order_by("-timestamp")[:limit]
        results = [
            {
                "id": str(entry.id),
                "actor_name": entry.actor.get_full_name() if entry.actor else "System",
                "action": entry.action,
                "target_model": entry.target_model,
                "target_id": entry.target_id,
                "description": f"{entry.actor.get_full_name() if entry.actor else 'System'} "
                                f"{entry.action.lower()}d a {entry.target_model.lower()}",
                "timestamp": entry.timestamp,
            }
            for entry in entries
        ]
        return Response(results)
