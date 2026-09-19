from rest_framework import serializers

from .models import Task, TaskStatus, TaskComment, TaskApprovalHistory


class TaskCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.ReadOnlyField(source='author.get_full_name')

    class Meta:
        model = TaskComment
        fields = ['id', 'task', 'author', 'author_name', 'content', 'created_at']
        read_only_fields = ['id', 'task', 'author', 'created_at']


class TaskApprovalHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.ReadOnlyField(source='actor.get_full_name')

    class Meta:
        model = TaskApprovalHistory
        fields = ['id', 'from_status', 'to_status', 'notes', 'actor', 'actor_name', 'created_at']


class TaskSerializer(serializers.ModelSerializer):
    project_name = serializers.ReadOnlyField(source='project.name', default=None)
    assignee_name = serializers.SerializerMethodField()
    created_by_name = serializers.ReadOnlyField(source='created_by.get_full_name')

    class Meta:
        model = Task
        fields = [
            'id', 'organization', 'project', 'project_name',
            'title', 'description', 'status', 'priority',
            'assignee', 'assignee_name', 'created_by', 'created_by_name',
            'due_date', 'is_locked', 'version', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'organization', 'created_by', 'is_locked', 'version', 'created_at', 'updated_at']

    def get_assignee_name(self, obj):
        return obj.assignee.get_full_name() if obj.assignee else None

    def validate_project(self, value):
        request = self.context.get('request')
        if value and request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Selected project does not belong to your organization.")
        return value

    def validate_assignee(self, value):
        request = self.context.get('request')
        if value and request and value.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Selected assignee does not belong to your organization.")
        return value

    def validate_status(self, value):
        # On create there's no instance yet, so any starting status the
        # model allows is fine; transition rules only apply to updates.
        if self.instance and value != self.instance.status:
            if not self.instance.can_transition_to(value):
                raise serializers.ValidationError(
                    f"Cannot move a task from {self.instance.status} to {value}."
                )
        return value

    def validate(self, attrs):
        if self.instance and self.instance.is_locked:
            raise serializers.ValidationError(
                "This task has been approved and is locked. No further changes are allowed."
            )
        return attrs
