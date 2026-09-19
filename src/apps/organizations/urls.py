from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DepartmentDetailView,
    DepartmentListCreateView,
    OrganizationMeView,
    OrganizationViewSet,
)

router = DefaultRouter()
router.register(r'organizations', OrganizationViewSet, basename='organization')

urlpatterns = [
    # Must come before the router include: DefaultRouter's detail route
    # matches any non-slash segment as <pk>, which would otherwise swallow
    # "me" as if it were an Organization id.
    path('organizations/me/', OrganizationMeView.as_view(), name='organization-me'),
    path('departments/', DepartmentListCreateView.as_view(), name='department-list-create'),
    path('departments/<uuid:pk>/', DepartmentDetailView.as_view(), name='department-detail'),
    path('', include(router.urls)),
]
