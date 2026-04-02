"""
Email helpers for agency-level team invites (Settings → Team Management).

Uses the same Resend-based infrastructure pattern as admin_service, but scoped
to AgencyInvite flows. If RESEND_API_KEY is not configured, this module will
log a warning and return False so callers can still return an invite_link
without failing the API.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import requests


logger = logging.getLogger(__name__)


def _get_resend_api_key() -> Optional[str]:
  return os.getenv("RESEND_API_KEY")


def send_agency_invite_email(
  to_email: str,
  invite_url: str,
  agency_name: str,
  role_label: str,
) -> tuple[bool, Optional[str]]:
  """
  Send an agency team invite email via Resend.

  Returns (success, debug_reason) where:
  - success=True if the email was handed off to Resend successfully.
  - success=False if delivery was skipped or Resend returned an error.
  The debug_reason is a short, non-sensitive string intended for API debugging.
  """
  api_key = _get_resend_api_key()
  if not api_key:
    logger.warning(
      "Agency invite for %s not emailed (RESEND_API_KEY missing). Link: %s",
      to_email,
      invite_url,
    )
    return False, "missing_api_key"

  # Basic, branded HTML email. This can be refined later without changing the API.
  subject = f"You've been invited to join {agency_name} on Kaivo"
  preview_text = f"{agency_name} has invited you to collaborate in the Kaivo agency portal."

  html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;">{preview_text}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 0;">
    <tr>
      <td align="center">
        <!-- Main card -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">
          <!-- Header bar -->
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
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#2a9d8f;">Team invitation</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                You&rsquo;ve been invited to join<br>{agency_name}
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.65;">
                <strong>{agency_name}</strong> has invited you to join their team as
                <strong style="color:#2a9d8f;">{role_label}</strong> on the Kaivo agency portal.
                Accept the invitation below to get started.
              </p>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:#2a9d8f;">
                    <a href="{invite_url}" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Accept Invitation &rarr;
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
                {invite_url}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;line-height:1.5;">
                This invitation was sent by {agency_name} via Kaivo. If you weren&rsquo;t expecting this email, you can safely ignore it.
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
    "Sending agency invite via Resend: to=%s, from=%s, subject=%s, api_key_prefix=%s",
    to_email,
    from_email,
    subject,
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
        "headers": {"X-Entity-Ref-ID": "kaivo-agency-invite"},
      },
      timeout=10,
    )
    if 200 <= response.status_code < 300:
      logger.info(
        "Resend agency invite email accepted for %s: status=%s, body=%s",
        to_email,
        response.status_code,
        response.text,
      )
      return True, None

    debug_reason = f"resend_status_{response.status_code}"
    try:
      data = response.json()
      message = data.get("message") or data.get("error") or ""
      if message:
        debug_reason = f"{debug_reason}:{message}"
    except Exception:
      message = response.text

    logger.warning(
      "Resend agency invite email failed for %s: from=%s status=%s, body=%s",
      to_email,
      from_email,
      response.status_code,
      message,
    )
    return False, debug_reason
  except Exception as exc:  # pragma: no cover - network/infra issues
    logger.exception("Error sending agency invite email to %s: %s", to_email, exc)
    return False, "exception_sending"

