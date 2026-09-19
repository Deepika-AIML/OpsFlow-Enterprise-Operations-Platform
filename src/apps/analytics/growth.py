from datetime import timedelta

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db.models import DateField, DateTimeField
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView


RANGES = {
    "7d": 7,
    "30d": 30,
    "3m": 3,
    "1y": 12,
}


def _model_by_name(name):
    """
    Find an installed Django model by class name.
    """
    target = name.lower()

    for model in apps.get_models():
        if model.__name__.lower() == target:
            return model

    return None


def _created_field(model):
    """
    Find the model's creation date/time field.
    """

    if model is None:
        return None

    for field_name in (
        "created_at",
        "created",
        "date_created",
        "created_on",
    ):
        try:
            field = model._meta.get_field(
                field_name
            )
        except Exception:
            continue

        if isinstance(
            field,
            (DateField, DateTimeField)
        ):
            return field

    return None


def _month_start(value):
    return value.replace(
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )


def _add_months(value, months):
    index = (
        value.year * 12
        + (value.month - 1)
        + months
    )

    year = index // 12
    month = index % 12 + 1

    return value.replace(
        year=year,
        month=month,
        day=1,
    )


def _buckets(range_key, now):
    """
    7D  = 7 daily points
    30D = 30 daily points
    3M  = 3 monthly points
    1Y  = 12 monthly points
    """

    if range_key in (
        "7d",
        "30d",
    ):
        today = now.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

        count = RANGES[range_key]

        start = (
            today
            - timedelta(
                days=count - 1
            )
        )

        return [
            start
            + timedelta(days=index)
            for index in range(count)
        ]

    current_month = _month_start(
        now
    )

    count = RANGES[range_key]

    start = _add_months(
        current_month,
        -(count - 1),
    )

    return [
        _add_months(
            start,
            index,
        )
        for index in range(count)
    ]


def _bucket_end(
    bucket,
    range_key,
):
    if range_key in (
        "7d",
        "30d",
    ):
        return (
            bucket
            + timedelta(days=1)
            - timedelta(
                microseconds=1
            )
        )

    return (
        _add_months(
            bucket,
            1,
        )
        - timedelta(
            microseconds=1
        )
    )


def _label(
    bucket,
    range_key,
):
    if range_key in (
        "7d",
        "30d",
    ):
        return bucket.strftime(
            "%d %b"
        ).lstrip("0")

    return bucket.strftime(
        "%b %Y"
    )


def _count_created_until(
    model,
    field_name,
    endpoint,
):
    if (
        model is None
        or field_name is None
    ):
        return 0

    try:
        return model.objects.filter(
            **{
                f"{field_name}__lte":
                    endpoint
            }
        ).count()

    except Exception:
        return 0


class GrowthAnalyticsView(APIView):
    """
    GET /analytics/growth/?range=7d
    GET /analytics/growth/?range=30d
    GET /analytics/growth/?range=3m
    GET /analytics/growth/?range=1y

    Returns real cumulative database totals.

    No fake/demo historical data is generated.
    """

    permission_classes = [
        IsAuthenticated
    ]

    def get(
        self,
        request,
    ):
        range_key = str(
            request.query_params.get(
                "range",
                "30d",
            )
        ).lower()

        # Old 1M button compatibility.
        if range_key == "1m":
            range_key = "3m"

        if range_key not in RANGES:
            range_key = "30d"

        now = timezone.localtime()

        buckets = _buckets(
            range_key,
            now,
        )

        User = get_user_model()

        models = {
            "users": User,
            "organizations":
                _model_by_name(
                    "Organization"
                ),
            "projects":
                _model_by_name(
                    "Project"
                ),
            "tasks":
                _model_by_name(
                    "Task"
                ),
        }

        fields = {
            key: _created_field(
                model
            )
            for key, model
            in models.items()
        }

        rows = []

        for bucket in buckets:
            endpoint = _bucket_end(
                bucket,
                range_key,
            )

            if timezone.is_naive(
                endpoint
            ):
                endpoint = (
                    timezone.make_aware(
                        endpoint,
                        timezone.get_current_timezone(),
                    )
                )

            row = {
                "date":
                    bucket.date().isoformat(),

                "label":
                    _label(
                        bucket,
                        range_key,
                    ),
            }

            for (
                key,
                model,
            ) in models.items():

                field = fields[key]

                row[key] = (
                    _count_created_until(
                        model,
                        (
                            field.name
                            if field
                            else None
                        ),
                        endpoint,
                    )
                )

            rows.append(row)

        has_data = any(
            any(
                row[key] > 0
                for key in models
            )
            for row in rows
        )

        return JsonResponse(
            {
                "range":
                    range_key,

                "mode":
                    "cumulative",

                "has_data":
                    has_data,

                "series": [
                    {
                        "key":
                            "users",
                        "label":
                            "Users",
                    },
                    {
                        "key":
                            "organizations",
                        "label":
                            "Organizations",
                    },
                    {
                        "key":
                            "projects",
                        "label":
                            "Projects",
                    },
                    {
                        "key":
                            "tasks",
                        "label":
                            "Tasks",
                    },
                ],

                "data":
                    rows,
            }
        )