import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.authentication.models import RoleChoices

User = get_user_model()


class Command(BaseCommand):
    """
    Idempotent local-dev seed: one default Organization plus one
    Admin/Manager/Employee account each, so the app is immediately usable
    after `docker compose up --build` without any manual setup step.

    Credentials come from environment variables (with safe local-only
    defaults) rather than being hardcoded, and re-running this command is
    always safe - existing accounts are left untouched.
    """
    help = "Create the default Organization and one demo Admin/Manager/Employee user each (idempotent)."

    def handle(self, *args, **options):
        default_org = User.objects.get_default_organization()
        self.stdout.write(f"Organization ready: {default_org.name}")

        demo_users = [
            (
                os.getenv("ADMIN_EMAIL", "admin@opsflow.local"),
                os.getenv("ADMIN_PASSWORD", "Admin@12345"),
                RoleChoices.ADMIN, "Ada", "Admin", True, True,
            ),
            (
                os.getenv("MANAGER_EMAIL", "manager@opsflow.local"),
                os.getenv("MANAGER_PASSWORD", "Manager@12345"),
                RoleChoices.MANAGER, "Max", "Manager", False, False,
            ),
            (
                os.getenv("EMPLOYEE_EMAIL", "employee@opsflow.local"),
                os.getenv("EMPLOYEE_PASSWORD", "Employee@12345"),
                RoleChoices.EMPLOYEE, "Eve", "Employee", False, False,
            ),
        ]

        for email, password, role, first_name, last_name, is_staff, is_superuser in demo_users:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "organization": default_org,
                    "role": role,
                    "first_name": first_name,
                    "last_name": last_name,
                    "is_staff": is_staff,
                    "is_superuser": is_superuser,
                },
            )
            if created:
                user.set_password(password)
                user.save(update_fields=["password"])
                self.stdout.write(self.style.SUCCESS(f"Created {role} user: {email} / {password}"))
            else:
                self.stdout.write(f"{role} user already exists: {email}")
