"""
Onboarding email for new agency users who complete Stripe payment on getkaivo.com.

Sends a magic link via Resend so the user can access agency.getkaivo.com.
Uses the same Resend REST API pattern as services/account_service/email.py.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)


def _get_resend_api_key() -> Optional[str]:
    return os.getenv("RESEND_API_KEY")


def send_onboarding_magic_link_email(
    to_email: str,
    magic_url: str,
    plan_name: str = "Agency",
) -> tuple[bool, Optional[str]]:
    """
    Send a post-payment onboarding email with a magic link to access the
    agency portal.

    Returns (success, debug_reason).
    """
    api_key = _get_resend_api_key()
    if not api_key:
        logger.warning(
            "Onboarding email for %s not sent (RESEND_API_KEY missing). Link: %s",
            to_email,
            magic_url,
        )
        return False, "missing_api_key"

    subject = "Welcome to Kaivo — Your Agency Portal is Ready"
    preview_text = (
        "Your payment was successful. Click below to set up your agency portal."
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;">{preview_text}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px;height:36px;border-radius:10px;background:#2a9d8f;text-align:center;vertical-align:middle;">
                    <span style="font-size:20px;line-height:36px;">&#9889;</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:0.18em;vertical-align:middle;">KAIVO</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#2a9d8f;">Payment confirmed</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                Welcome to Kaivo!
              </h1>
              <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.65;">
                Your <strong style="color:#2a9d8f;">{plan_name}</strong> plan payment was successful.
                Your agency portal is ready and waiting for you.
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.65;">
                Click the button below to access your portal, complete onboarding,
                and connect your ad platforms.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:#2a9d8f;">
                    <a href="{magic_url}" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Open Your Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="border-top:1px solid #e2e8f0;"></div>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:20px 32px 28px;">
              <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;line-height:1.5;">
                If the button above doesn&rsquo;t work, copy and paste this URL into your browser:
              </p>
              <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all;line-height:1.5;">
                {magic_url}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;line-height:1.5;">
                This link expires in 48 hours and can only be used once.
                If you didn&rsquo;t make this purchase, please contact support.
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;line-height:1.5;">
                &copy; Kaivo &middot; Agency Intelligence Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    from_email = os.getenv("RESEND_FROM_EMAIL", "Kaivo <no-reply@getkaivo.com>")

    logger.info(
        "Sending onboarding email via Resend: to=%s, from=%s, api_key_prefix=%s",
        to_email,
        from_email,
        api_key[:8],
    )

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html,
                "headers": {"X-Entity-Ref-ID": "kaivo-stripe-onboarding"},
            },
            timeout=10,
        )
        if 200 <= response.status_code < 300:
            logger.info(
                "Onboarding email accepted for %s: status=%s",
                to_email,
                response.status_code,
            )
            return True, None

        debug_reason = f"resend_status_{response.status_code}"
        try:
            data = response.json()
            message = data.get("message") or data.get("error") or ""
            if message:
                debug_reason = f"{debug_reason}:{message}"
        except Exception:
            pass

        logger.warning(
            "Onboarding email failed for %s: status=%s, body=%s",
            to_email,
            response.status_code,
            response.text,
        )
        return False, debug_reason
    except Exception as exc:
        logger.exception("Error sending onboarding email to %s: %s", to_email, exc)
        return False, "exception_sending"
