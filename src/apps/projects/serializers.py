from rest_framework import serializers
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from .models import Project, ProjectMember, ProjectStatus, ProjectMemberRole
from apps.clients.models import Client

User = get_user_model()


class ProjectMemberSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMember
        fields = ['id', 'user', 'user_name', 'role']  # Removed 'created_at'
        read_only_fields = ['id']

    @extend_schema_field(serializers.CharField())
    def get_user_name(self, obj) -> str:
        if obj.user:
            return obj.user.get_full_name() or obj.user.email
        return ""


class ProjectSerializer(serializers.ModelSerializer):
    organization_name = serializers.ReadOnlyField(source='organization.name', default=None)
    client_name = serializers.ReadOnlyField(source='client.name', default=None)
    created_by_email = serializers.ReadOnlyField(source='created_by.email', default=None)
    members = ProjectMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'name', 'description', 'status', 'priority',
            'client', 'client_name', 'organization',
            'organization_name', 'start_date', 'end_date',
            'created_by', 'created_by_email', 'members',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_by', 'created_at', 'updated_at']

    def validate_client(self, value):
        request = self.context.get('request')
        if value and request and hasattr(request, 'user'):
            if value.organization != request.user.organization:
                raise serializers.ValidationError("Selected client does not belong to your organization.")
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['organization'] = request.user.organization
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class AddProjectMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectMember
        fields = ['user', 'role']

    def validate_user(self, value):
        request = self.context.get('request')
        if value and request and hasattr(request, 'user'):
            if value.organization != request.user.organization:
                raise serializers.ValidationError("User does not belong to your organization.")
        return value