import os
from datetime import timedelta
from pathlib import Path
import environ

# BASE_DIR = <project_root>/src
BASE_DIR = Path(__file__).resolve().parent.parent.parent
# PROJECT_ROOT = <project_root> (contains frontend/, .env, docker-compose.yml)
PROJECT_ROOT = BASE_DIR.parent
FRONTEND_DIR = PROJECT_ROOT / 'frontend'

env = environ.Env(DJANGO_DEBUG=(bool, False))
env_file = os.path.join(PROJECT_ROOT, '.env')
if os.path.exists(env_file):
    environ.Env.read_env(env_file)

SECRET_KEY = env('DJANGO_SECRET_KEY', default='django-insecure-local-dev-key-change-me')
DEBUG = env('DJANGO_DEBUG')
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])

# --------------------------------------------------------------------------
# Applications
# --------------------------------------------------------------------------
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
]

LOCAL_APPS = [
    'apps.authentication',
    'apps.organizations',
    'apps.clients',
    'apps.projects',
    'apps.tasks',
    'apps.audit',
    'apps.notifications',
    'apps.analytics',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'apps.audit.middleware.AuditContextMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

# --------------------------------------------------------------------------
# Database (MySQL)
#
# WHY MySQL: required by the project brief and already the intended target
# for this codebase. WHY mysqlclient: the C-extension driver officially
# recommended by the Django docs for MySQL/MariaDB (fast, mature, and the
# most common choice in production Django deployments).
# --------------------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': env('DB_NAME', default=env('MYSQL_DATABASE', default='opsflow_db')),
        'USER': env('DB_USER', default=env('MYSQL_USER', default='opsflow_user')),
        'PASSWORD': env('DB_PASSWORD', default=env('MYSQL_PASSWORD', default='opsflow_password')),
        'HOST': env('DB_HOST', default='db'),
        'PORT': env('DB_PORT', default='3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
        },
    }
}

AUTH_USER_MODEL = 'authentication.User'

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# --------------------------------------------------------------------------
# Django REST Framework / JWT / API docs
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'EXCEPTION_HANDLER': 'core.exceptions.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "OpsFlow API",
    "DESCRIPTION": "Operations & Workflow Management Platform API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --------------------------------------------------------------------------
# Password reset / email
#
# There is no real mail server in local development, so the console backend
# prints the reset email (including the reset link) to the `web` container
# logs. Swap EMAIL_BACKEND for a real SMTP backend in production.
# --------------------------------------------------------------------------
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='no-reply@opsflow.local')
FRONTEND_PASSWORD_RESET_URL = env('FRONTEND_PASSWORD_RESET_URL', default='/reset-password.html')
PASSWORD_RESET_TIMEOUT = 60 * 60  # 1 hour, in seconds

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --------------------------------------------------------------------------
# Templates / static files / frontend
#
# The vanilla HTML/CSS/JS frontend lives in ../frontend and is served
# directly by this same Django process (see config/urls.py) so that the
# whole application - API + UI - starts from a single `web` container with
# no separate frontend server and no cross-origin requests to worry about.
# --------------------------------------------------------------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [FRONTEND_DIR],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

STATIC_URL = 'static/'
STATICFILES_DIRS = [FRONTEND_DIR]
STATIC_ROOT = BASE_DIR / 'staticfiles'

# --------------------------------------------------------------------------
# CORS
#
# Same-origin in the bundled Docker setup (frontend + API share one host),
# so this mainly matters if the frontend is ever served separately (e.g. a
# live-reload dev server) while pointed at this API.
# --------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = env.bool('CORS_ALLOW_ALL_ORIGINS', default=False)
CORS_ALLOWED_ORIGINS = env.list(
    'CORS_ALLOWED_ORIGINS',
    default=['http://localhost:8000', 'http://127.0.0.1:8000'],
)
CORS_ALLOW_CREDENTIALS = True
