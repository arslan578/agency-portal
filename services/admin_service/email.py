import os
import logging

logger = logging.getLogger(__name__)


def send_magic_link_email(to_email: str, magic_url: str) -> bool:
    """
    Send a magic link invite email via Resend.
    Returns True on success, False on failure.
    Falls back to logging the link if RESEND_API_KEY is not configured.
    """
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        logger.warning(
            "RESEND_API_KEY not set — magic link not emailed. URL: %s (to: %s)",
            magic_url, to_email,
        )
        return False

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; padding: 40px 0;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="font-size: 28px; font-weight: 700; color: #2a9d8f; letter-spacing: -0.5px;">Kaivo</div>
        </div>
        <h2 style="font-size: 20px; font-weight: 600; color: #1a1a2e; margin: 0 0 12px 0;">You're invited to Kaivo Agency Portal</h2>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px 0;">
          You've been invited to access the Kaivo Agency Portal. Click the button below to get started.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="{magic_url}"
             style="display: inline-block; background: #2a9d8f; color: #ffffff; text-decoration: none;
                    padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600;">
            Accept Invite
          </a>
        </div>
        <p style="font-size: 13px; color: #999; line-height: 1.5; margin: 24px 0 0 0;">
          This link expires in 48 hours and can only be used once.
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0 16px 0;">
        <p style="font-size: 12px; color: #bbb; text-align: center; margin: 0;">
          Kaivo &mdash; Agency Operating System
        </p>
      </div>
    </body>
    </html>
    """

    text_body = (
        f"You're invited to Kaivo Agency Portal\n\n"
        f"You've been invited to access the Kaivo Agency Portal.\n"
        f"Click the link below to get started:\n\n"
        f"{magic_url}\n\n"
        f"This link expires in 48 hours and can only be used once.\n"
        f"If you didn't expect this invitation, you can safely ignore this email."
    )

    try:
        import resend
        resend.api_key = api_key

        from_addr = os.getenv("RESEND_FROM_EMAIL", "Kaivo <onboarding@resend.dev>")
        resend.Emails.send({
            "from": from_addr,
            "to": [to_email],
            "subject": "You're invited to Kaivo Agency Portal",
            "html": html_body,
            "text": text_body,
        })
        logger.info("Magic link email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send magic link email to %s: %s", to_email, e)
        return False
