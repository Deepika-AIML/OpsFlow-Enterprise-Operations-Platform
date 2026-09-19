from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.audit.mixins import AuditContextMixin
from apps.audit.models import AuditAction
from apps.audit.services import record_audit_log
from apps.notifications.services import notify_user
from core.permissions import IsAdminUserRole, IsOrganizationMember

from .models import RoleChoices
from .serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    OrgMemberSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PublicSignupSerializer,
    UserCreateSerializer,
    UserManagementSerializer,
    UserRoleUpdateSerializer,
    UserSerializer,
)
from .services import PasswordResetService

User = get_user_model()


class CustomTokenObtainPairView(AuditContextMixin, TokenObtainPairView):
    """POST /api/v1/auth/token/ - email + password login. No role is ever
    sent by the client; the token embeds whatever role is on the database
    row, and every subsequent API call re-checks it there too."""
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                user = User.objects.get(email__iexact=request.data.get('email', ''))
                context = self.get_audit_context()
                record_audit_log(
                    organization=user.organization, actor=user, action=AuditAction.LOGIN,
                    target_model="User", target_id=str(user.id), changes_json={}, **context,
                )
            except User.DoesNotExist:
                pass
        return response


class LogoutView(AuditContextMixin, APIView):
    """POST /api/v1/auth/logout/ {"refresh": "<refresh token>"} - blacklists
    the refresh token so it can't be used again (access tokens simply expire
    on their own short lifetime)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response({"detail": "refresh token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            RefreshToken(refresh).blacklist()
        except TokenError:
            return Response({"detail": "Invalid or already-expired refresh token."}, status=status.HTTP_400_BAD_REQUEST)

        context = self.get_audit_context()
        record_audit_log(
            organization=request.user.organization, actor=request.user, action=AuditAction.LOGOUT,
            target_model="User", target_id=str(request.user.id), changes_json={}, **context,
        )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class UserRegisterView(AuditContextMixin, generics.CreateAPIView):
    """POST /api/v1/auth/register/ - public sign-up. Always creates an
    EMPLOYEE account; role is never accepted from the request body."""
    queryset = User.objects.all()
    serializer_class = PublicSignupSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        context = self.get_audit_context()
        record_audit_log(
            organization=user.organization, actor=user, action=AuditAction.CREATE,
            target_model="User", target_id=str(user.id),
            changes_json={"email": user.email, "role": user.role, "via": "public_signup"},
            **context,
        )


class PasswordResetRequestView(APIView):
    """POST /api/v1/auth/password-reset/ {"email": "..."} - always returns
    200 whether or not the address is registered, so this endpoint can't be
    used to enumerate accounts."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PasswordResetService.request_reset(serializer.validated_data['email'])
        return Response(
            {"detail": "If an account exists for this email, a password reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """POST /api/v1/auth/password-reset/confirm/ {"uid","token","new_password","new_password_confirm"}"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, error = PasswordResetService.confirm_reset(
            uid=serializer.validated_data['uid'],
            token=serializer.validated_data['token'],
            new_password=serializer.validated_data['new_password'],
        )
        if error:
            raise ValidationError({"detail": error})
        return Response({"detail": "Password has been reset successfully."}, status=status.HTTP_200_OK)


class UserMeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/auth/me/ - the logged-in user's own profile. Only
    first/last name are writable (see UserSerializer); role/org/status
    changes always go through Admin User Management."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """POST /api/v1/auth/change-password/ - self-service password change
    from the Settings page, requires the current password."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)


class OrgMembersListView(generics.ListAPIView):
    """GET /api/v1/org-members/ - lightweight colleague lookup for
    assignee/member pickers. Available to any authenticated org member
    (not Admin-only) since assigning work is a Manager+ action but
    everyone needs to see who's on the team to do it."""
    serializer_class = OrgMemberSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrganizationMember]
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(
            organization=self.request.user.organization, is_active=True
        ).order_by('first_name', 'email')


class UserManagementListCreateView(AuditContextMixin, generics.ListCreateAPIView):
    """
    GET  /api/v1/admin/users/  - Admin-only: list/search/filter every user
    POST /api/v1/admin/users/  - Admin-only: provision a new Employee/Manager
    """
    permission_classes = [IsAdminUserRole, IsOrganizationMember]
    filterset_fields = ['role', 'is_active', 'department']
    search_fields = ['email', 'first_name', 'last_name']
    ordering_fields = ['date_joined', 'email', 'role']

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == 'POST' else UserManagementSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = User.objects.all() if user.is_admin else User.objects.filter(organization=user.organization)
        return queryset.select_related('organization', 'department').order_by('-date_joined')

    def perform_create(self, serializer):
        user = serializer.save()
        context = self.get_audit_context()
        record_audit_log(
            organization=user.organization, actor=self.request.user, action=AuditAction.CREATE,
            target_model="User", target_id=str(user.id),
            changes_json={"email": user.email, "role": user.role, "via": "admin_provisioning"},
            **context,
        )


class UserManagementDetailView(AuditContextMixin, generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/admin/users/<id>/  - Admin-only: view one user's details
    PATCH /api/v1/admin/users/<id>/  - Admin-only: change role / active
                                        status / department

    Deliberately has no DELETE: accounts are deactivated, never hard-deleted,
    so historical records (created_by, audit actor, etc.) stay intact.
    """
    permission_classes = [IsAdminUserRole, IsOrganizationMember]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return User.objects.all()
        return User.objects.filter(organization=user.organization)

    def get_serializer_class(self):
        return UserRoleUpdateSerializer if self.request.method in ('PATCH', 'PUT') else UserManagementSerializer

    def patch(self, request, *args, **kwargs):
        target = self.get_object()
        previous_role, previous_active = target.role, target.is_active

        # Protect against locking the platform out of Admin access entirely:
        # if this is the only active Admin, block anything that would
        # demote or deactivate them.
        was_last_active_admin = (
            previous_role == RoleChoices.ADMIN and previous_active and
            not User.objects.filter(role=RoleChoices.ADMIN, is_active=True).exclude(pk=target.pk).exists()
        )
        would_lose_admin = (
            ('role' in request.data and request.data.get('role') != RoleChoices.ADMIN) or
            ('is_active' in request.data and not request.data.get('is_active'))
        )
        if was_last_active_admin and would_lose_admin:
            return Response(
                {"detail": "This is the only active Admin account; it cannot be demoted or deactivated."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = super().patch(request, *args, **kwargs)
        if response.status_code == 200:
            target.refresh_from_db()
            changes = {}
            if target.role != previous_role:
                changes['role'] = {'from': previous_role, 'to': target.role}
            if target.is_active != previous_active:
                changes['is_active'] = {'from': previous_active, 'to': target.is_active}

            if changes:
                context = self.get_audit_context()
                record_audit_log(
                    organization=target.organization, actor=request.user, action=AuditAction.UPDATE,
                    target_model="User", target_id=str(target.id), changes_json=changes, **context,
                )
                if 'role' in changes:
                    notify_user(
                        recipient=target,
                        verb=f"Your role was changed to {target.get_role_display()}.",
                        target_model="User", target_id=str(target.id),
                    )
                if 'is_active' in changes:
                    status_word = "activated" if target.is_active else "deactivated"
                    notify_user(
                        recipient=target,
                        verb=f"Your account was {status_word}.",
                        target_model="User", target_id=str(target.id),
                    )
        return response
