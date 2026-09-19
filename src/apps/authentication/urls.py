from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    CustomTokenObtainPairView,
    LogoutView,
    OrgMembersListView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    UserManagementDetailView,
    UserManagementListCreateView,
    UserMeView,
    UserRegisterView,
)

urlpatterns = [
    # Auth
    path('auth/register/', UserRegisterView.as_view(), name='auth-register'),
    path('auth/token/', CustomTokenObtainPairView.as_view(), name='auth-login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('auth/password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='auth-change-password'),
    path('auth/me/', UserMeView.as_view(), name='auth-me'),

    # Lightweight colleague lookup (assignee/member pickers)
    path('org-members/', OrgMembersListView.as_view(), name='org-members'),

    # Admin User Management
    path('admin/users/', UserManagementListCreateView.as_view(), name='admin-user-list-create'),
    path('admin/users/<uuid:pk>/', UserManagementDetailView.as_view(), name='admin-user-detail'),
]
