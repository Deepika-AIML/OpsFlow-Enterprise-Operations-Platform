from django.contrib import admin
from django.urls import path, re_path, include
from django.http import JsonResponse
from django.views.static import serve as static_serve
from django.conf import settings
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


def health_check(request):
    return JsonResponse({"status": "healthy"})


def frontend_serve(request, path=''):
    """Serve the vanilla frontend, defaulting empty/directory paths to index.html."""
    if not path or path.endswith('/'):
        path = f'{path}index.html'
    return static_serve(request, path, document_root=settings.FRONTEND_DIR)


urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('admin/', admin.site.urls),

    # OpenAPI schema & interactive docs
    path('api/v1/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/v1/docs/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/v1/docs/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # API endpoints
    path('api/v1/', include('apps.authentication.urls')),
    path('api/v1/', include('apps.organizations.urls')),
    path('api/v1/clients/', include('apps.clients.urls')),
    path('api/v1/projects/', include('apps.projects.urls')),
    path('api/v1/tasks/', include('apps.tasks.urls')),
    path('api/v1/audit-logs/', include('apps.audit.urls')),
    path('api/v1/notifications/', include('apps.notifications.urls')),
    path('api/v1/analytics/', include('apps.analytics.urls')),
]

# --------------------------------------------------------------------------
# Frontend (vanilla HTML/CSS/JS) - served as plain static files by this same
# process. Must stay LAST: it is a catch-all for anything that isn't one of
# the API/admin/docs paths above, so it can serve /, /login.html, /js/*.js,
# /css/*.css, etc. straight out of the frontend/ directory.
# --------------------------------------------------------------------------
urlpatterns += [
    re_path(r'^(?P<path>(?!api/|admin/|health/).*)$', frontend_serve),
]
