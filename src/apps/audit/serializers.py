# src/apps/audit/serializers.py
from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True, default=None)
    actor_name = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "organization",
            "organization_name",
            "actor",
            "actor_email",
            "actor_name",
            "action",
            "target_model",
            "target_id",
            "changes_json",
            "request_id",
            "ip_address",
            "timestamp",
        ]
        read_only_fields = fields  # Strictly read-only

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() if obj.actor else "System"