from django.urls import path

from .views import (
    DashboardOverviewView,
    GrowthAnalyticsView,
    RecentActivityView,
    ResourceDistributionView,
)
from .growth import GrowthAnalyticsView
urlpatterns = [
    path("dashboard/", DashboardOverviewView.as_view(), name="analytics-dashboard"),
    path("growth/", GrowthAnalyticsView.as_view(), name="analytics-growth"),
    path("distribution/", ResourceDistributionView.as_view(), name="analytics-distribution"),
    path("recent-activity/", RecentActivityView.as_view(), name="analytics-recent-activity"),
    path(
    "growth/",
    GrowthAnalyticsView.as_view(),
    name="analytics-growth",
),
]
