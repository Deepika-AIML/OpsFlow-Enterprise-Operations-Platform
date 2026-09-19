import uuid
from django.db import models
from django.utils.text import slugify
class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, null=False, blank=False)
    slug = models.SlugField(max_length=100, unique=True, null=False, blank=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'organizations_organization'

    def __str__(self):
        return self.name


class Department(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='departments'
    )
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL, related_name='subdepartments', null=True, blank=True
    )
    name = models.CharField(max_length=150, null=False, blank=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'organizations_department'
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'parent', 'name'], name='unique_dept_per_parent_in_org'
            ),
            models.UniqueConstraint(
                fields=['organization', 'name'], condition=models.Q(parent__isnull=True), name='unique_root_dept_per_org'
            )
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.name}"