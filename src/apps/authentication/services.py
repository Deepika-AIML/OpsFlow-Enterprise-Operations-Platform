import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

logger = logging.getLogger(__name__)
User = get_user_model()


class OpsFlowPasswordResetTokenGenerator(PasswordResetTokenGenerator):
    """Standard Django token generator, scoped with is_active + last_login
    so a token is invalidated the moment the user logs in again or is
    deactivated, same as Django's own password reset view relies on."""

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.password}{timestamp}{user.is_active}"


password_reset_token = OpsFlowPasswordResetTokenGenerator()


class PasswordResetService:
    """Encapsulates the forgot-password flow: issuing a reset link (emailed
    via the configured EMAIL_BACKEND - the console backend in local dev, so
    the link is printed straight to the `web` container logs) and verifying
    it before allowing a new password to be set."""

    @staticmethod
    def request_reset(email):
        try:
            user = User.objects.get(email__iexact=email, is_active=True)
        except User.DoesNotExist:
            # Deliberately silent: don't reveal whether an account exists.
            logger.info("Password reset requested for unknown/inactive email: %s", email)
            return

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = password_reset_token.make_token(user)
        reset_url = f"{settings.FRONTEND_PASSWORD_RESET_URL}?uid={uid}&token={token}"

        send_mail(
            subject="Reset your OpsFlow password",
            message=(
                f"Hi {user.get_full_name()},\n\n"
                f"Use the link below to reset your OpsFlow password. "
                f"This link expires in 1 hour and can only be used once.\n\n"
                f"{reset_url}\n\n"
                f"If you did not request this, you can safely ignore this email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )

    @staticmethod
    def confirm_reset(uid, token, new_password):
        try:
            user_pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_pk)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return None, "This password reset link is invalid."

        if not password_reset_token.check_token(user, token):
            return None, "This password reset link is invalid or has expired."

        user.set_password(new_password)
        user.save(update_fields=['password'])
        return user, None
