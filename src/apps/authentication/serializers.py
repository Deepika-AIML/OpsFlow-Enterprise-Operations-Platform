from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import RoleChoices

User = get_user_model()

# Roles a human can be assigned to through the API. ADMIN is deliberately
# excluded here: the brief requires the Admin account to be pre-configured
# (createsuperuser / seed script) rather than obtainable through any HTTP
# request, so neither public signup nor the admin role-change endpoint will
# ever accept it.
ASSIGNABLE_ROLES = (RoleChoices.EMPLOYEE, RoleChoices.MANAGER)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Standard email/password login. The only thing added on top of
    SimpleJWT's default behaviour is embedding role/org/name claims in the
    access token, so the frontend can render the right UI immediately after
    login without an extra round trip - it still can't use those claims to
    grant itself anything, because every protected endpoint re-checks the
    role from the database on every request (see core/permissions.py).
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['role'] = user.role
        token['organization_id'] = str(user.organization.id) if user.organization else None
        token['first_name'] = user.first_name
        token['last_name'] = user.last_name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class PublicSignupSerializer(serializers.ModelSerializer):
    """
    Public registration (AllowAny). Deliberately narrow: full name, email,
    password, confirm password - nothing else. Role is never accepted from
    the client; every account created here is forced to EMPLOYEE, and the
    user is auto-assigned to the single default Organization so signup
    doesn't require picking (or trusting the client to send) a tenant.
    """
    full_name = serializers.CharField(write_only=True, max_length=150, trim_whitespace=True)
    password = serializers.CharField(write_only=True, min_length=8, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'password', 'password_confirm']
        read_only_fields = ['id']

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password_confirm'):
            raise serializers.ValidationError({'password_confirm': "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        full_name = validated_data.pop('full_name').strip()
        first_name, _, last_name = full_name.partition(' ')
        password = validated_data.pop('password')

        user = User.objects.create_user(
            email=validated_data['email'],
            organization=User.objects.get_default_organization(),
            password=password,
            first_name=first_name,
            last_name=last_name,
            role=RoleChoices.EMPLOYEE,
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    """Self-service profile serializer used by GET/PATCH /me/. Only the
    person's display name is editable here - role, status, org and
    department changes always go through Admin User Management so there is
    exactly one code path that can grant a role, and it is fully audited."""
    organization_name = serializers.ReadOnlyField(source='organization.name')
    department_name = serializers.ReadOnlyField(source='department.name', default=None)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'role', 'organization', 'organization_name',
            'department', 'department_name', 'is_active',
            'date_joined',
        ]
        read_only_fields = ['id', 'email', 'role', 'organization', 'department', 'is_active', 'date_joined']


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': "Passwords do not match."})
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': "Passwords do not match."})
        return attrs


class UserCreateSerializer(serializers.ModelSerializer):
    """Admin-only provisioning of a new user directly (Admin User Management
    'add user' action) as an alternative to waiting for public self-signup.
    Same role restriction as the admin role-change endpoint applies."""
    password = serializers.CharField(write_only=True, min_length=8, validators=[validate_password])

    class Meta:
        model = User
        fields = ['id', 'email', 'password', 'first_name', 'last_name', 'role', 'department']

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_role(self, value):
        if value not in ASSIGNABLE_ROLES:
            raise serializers.ValidationError(
                f"Role must be one of: {', '.join(ASSIGNABLE_ROLES)}. The Admin role cannot be assigned through the API."
            )
        return value

    def validate_department(self, value):
        request = self.context.get('request')
        if value and request and getattr(request, 'user', None):
            if value.organization_id != request.user.organization_id:
                raise serializers.ValidationError("Selected department does not belong to your organization.")
        return value

    def create(self, validated_data):
        request = self.context['request']
        password = validated_data.pop('password')
        user = User.objects.create_user(
            organization=request.user.organization,
            password=password,
            **validated_data,
        )
        return user


class OrgMemberSerializer(serializers.ModelSerializer):
    """Minimal, non-admin-gated lookup used to populate assignee/member
    pickers (e.g. the Tasks 'assignee' dropdown) - any authenticated org
    member can see the names of their colleagues, but nothing sensitive
    like account status changes through this endpoint."""
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'role']

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserManagementSerializer(serializers.ModelSerializer):
    """Read/list representation used by the Admin User Management screen."""
    organization_name = serializers.ReadOnlyField(source='organization.name')
    department_name = serializers.ReadOnlyField(source='department.name', default=None)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'role',
            'organization', 'organization_name', 'department', 'department_name',
            'is_active', 'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'email', 'organization', 'date_joined', 'last_login']


class UserRoleUpdateSerializer(serializers.ModelSerializer):
    """Admin-only PATCH for role / active-status / department. Deliberately
    separate from UserManagementSerializer (read model) and UserSerializer
    (self-service) so the writable surface for this highly sensitive action
    is small and easy to audit."""

    class Meta:
        model = User
        fields = ['role', 'is_active', 'department']
        extra_kwargs = {field: {'required': False} for field in ['role', 'is_active', 'department']}

    def validate_role(self, value):
        if value not in ASSIGNABLE_ROLES:
            raise serializers.ValidationError(
                f"Role must be one of: {', '.join(ASSIGNABLE_ROLES)}. The Admin role cannot be assigned through the API."
            )
        return value

    def validate_department(self, value):
        if value and value.organization_id != self.instance.organization_id:
            raise serializers.ValidationError("Selected department does not belong to this user's organization.")
        return value
