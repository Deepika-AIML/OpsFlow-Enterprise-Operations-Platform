from rest_framework import serializers
from .models import Client


class ClientSerializer(serializers.ModelSerializer):
    organization_name = serializers.ReadOnlyField(source='organization.name', default=None)

    class Meta:
        model = Client
        fields = [
            'id', 'name', 'email', 'phone', 
            'address', 'is_active', 'organization', 
            'organization_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['organization'] = request.user.organization
        return super().create(validated_data)