from rest_framework import serializers

from .models import Department, Organization


class OrganizationSerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(source='users.count', read_only=True)
    client_count = serializers.IntegerField(source='clients.count', read_only=True)
    project_count = serializers.IntegerField(source='projects.count', read_only=True)

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'slug', 'is_active',
            'user_count', 'client_count', 'project_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']


class DepartmentSerializer(serializers.ModelSerializer):
    organization_name = serializers.ReadOnlyField(source='organization.name', default=None)

    class Meta:
        model = Department
        fields = ['id', 'name', 'organization', 'organization_name', 'parent', 'created_at']
        read_only_fields = ['id', 'organization', 'created_at']

    def validate_parent(self, value):
        request = self.context.get('request')
        if value and request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Parent department must belong to your organization.")
        return value

    def create(self, validated_data):
        validated_data['organization'] = self.context['request'].user.organization
        return super().create(validated_data)
