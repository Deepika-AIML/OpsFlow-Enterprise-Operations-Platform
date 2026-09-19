import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager

class RoleChoices(models.TextChoices):
    """
    Application roles used for RBAC throughout the API.

    CLIENT is reserved for a possible future client-facing portal; nothing
    in the current release assigns it (public signup always uses EMPLOYEE,
    and Admin user-management only toggles EMPLOYEE <-> MANAGER).
    """
    ADMIN = 'ADMIN', 'Admin'
    MANAGER = 'MANAGER', 'Manager'
    EMPLOYEE = 'EMPLOYEE', 'Employee'
    CLIENT = 'CLIENT', 'Client'


class UserManager(BaseUserManager):
    def create_user(self, email, organization, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        if not organization:
            raise ValueError('Organization is required')

        email = self.normalize_email(email)
        user = self.model(email=email, organization=organization, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    @staticmethod
    def get_default_organization():
        """
        Single-tenant convenience: every account (superuser, public signup,
        seed script) lands in the same org unless an Admin later creates
        additional Organizations for internal partitioning.
        """
        from apps.organizations.models import Organization

        default_org, _ = Organization.objects.get_or_create(
            slug='default-org',
            defaults={'name': 'Default Organization'}
        )
        return default_org

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', RoleChoices.ADMIN)

        default_org = self.get_default_organization()

        return self.create_user(email=email, organization=default_org, password=password, **extra_fields)


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField('email address', unique=True, null=False, blank=False)

    organization = models.ForeignKey(
        'organizations.Organization', on_delete=models.RESTRICT, related_name='users', null=False
    )
    department = models.ForeignKey(
        'organizations.Department', on_delete=models.SET_NULL, related_name='members', null=True, blank=True
    )

    role = models.CharField(max_length=20, choices=RoleChoices.choices, default=RoleChoices.EMPLOYEE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'users_user'

    def __str__(self):
        return f"{self.email} ({self.role})"

    def get_full_name(self):
        full_name = super().get_full_name()
        return full_name or self.email

    # --- Role helpers -----------------------------------------------------
    # Centralising the role checks here means every permission class and
    # serializer asks the same question the same way, instead of each place
    # re-implementing its own "role == 'ADMIN' or is_superuser" logic.
    @property
    def is_admin(self):
        return self.is_superuser or self.role == RoleChoices.ADMIN

    @property
    def is_manager(self):
        return self.role == RoleChoices.MANAGER

    @property
    def is_employee(self):
        return self.role == RoleChoices.EMPLOYEE

    @property
    def is_admin_or_manager(self):
        return self.is_admin or self.is_manager