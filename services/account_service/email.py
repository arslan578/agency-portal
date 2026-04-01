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

  html = f"""
  <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0b1020; padding:32px 0;">
    <div style="max-width:520px;margin:0 auto;background:#f4efe6;border-radius:16px;padding:24px 24px 28px;border:1px solid #ddd6c8;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
        <div style="width:28px;height:28px;border-radius:8px;background:#e76f51;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:18px;">⚡</span>
        </div>
        <div style="font-size:16px;font-weight:800;color:#2a9d8f;letter-spacing:0.16em;">KAIVO</div>
      </div>
      <p style="font-size:13px;color:#5a5a72;font-weight:600;margin:0 0 6px;">Team invitation</p>
      <h1 style="font-size:20px;margin:0 0 10px;color:#1a1a2e;">Join {agency_name} on Kaivo</h1>
      <p style="font-size:13px;color:#5a5a72;line-height:1.6;margin:0 0 18px;">
        You've been invited to join <strong>{agency_name}</strong> as
        <strong>{role_label}</strong> in the Kaivo agency portal.
      </p>
      <div style="margin-bottom:22px;">
        <a href="{invite_url}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#2a9d8f;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">
          Accept invite &amp; sign in
        </a>
      </div>
      <p style="font-size:12px;color:#9a9aaa;line-height:1.5;margin:0 0 4px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="font-size:11px;color:#5a5a72;word-break:break-all;margin:0 0 12px;">
        {invite_url}
      </p>
      <p style="font-size:11px;color:#9a9aaa;line-height:1.5;margin:0;">
        If you weren't expecting this email, you can safely ignore it.
      </p>
    </div>
  </div>
  """

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

