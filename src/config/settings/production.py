"""
Production-oriented settings profile.

Not used by the bundled local docker-compose setup (which runs
``config.settings.base`` for simplicity - see README "Why two settings
files?"), but kept to show how this project would be hardened for a real
deployment: DEBUG off, HTTPS/HSTS headers, and static files served by
WhiteNoise instead of Django's development file server.
"""
import os
from .base import *  # noqa: F401,F403

DEBUG = False

ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# Security headers & cookies
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "False") == "True"
SESSION_COOKIE_SECURE = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "False") == "True"
CSRF_COOKIE_SECURE = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "False") == "True"
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# Static files via WhiteNoise
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
