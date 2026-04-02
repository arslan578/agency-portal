"""
Post-payment onboarding: generate a magic link for a new paying user.

When Stripe confirms payment on getkaivo.com, this module creates a
MagicToken (role=ADMIN, agency_id=None) and returns the magic link URL.
When the user clicks the link, the existing verify-token endpoint in
auth_service auto-creates User + Agency + Membership + Default Client.
"""

from __future__ import annotations

import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from packages.db.models import MagicToken, AgencyRole
from packages.db.database import engine
from packages.db.admin_schema import ensure_magic_tokens_table

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://agency.getkaivo.com")
MAGIC_LINK_PATH = os.getenv("MAGIC_LINK_PATH", "/verify")
TOKEN_EXPIRY_HOURS = 48
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def create_onboarding_magic_link(
    email: str,
    db: Session,
    stripe_customer_id: Optional[str] = None,
) -> tuple[Optional[str], Optional[str]]:
    """
    Create a magic-link token for a newly-paying user.

    Returns (magic_url, error_reason).
    On success magic_url is populated and error_reason is None.
    On failure magic_url is None and error_reason describes the issue.
    """
    email = email.lower().strip()

    if not email or not EMAIL_REGEX.match(email):
        return None, "invalid_email"

    try:
        ensure_magic_tokens_table(engine)
    except Exception:
        logger.warning("ensure_magic_tokens_table failed — table may already exist")

    # Invalidate any existing unused, unexpired tokens for this email
    existing_tokens = (
        db.query(MagicToken)
        .filter(
            MagicToken.email == email,
            MagicToken.used_at.is_(None),
            MagicToken.expires_at > datetime.now(timezone.utc),
        )
        .all()
    )
    for t in existing_tokens:
        t.used_at = datetime.now(timezone.utc)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)

    magic_token = MagicToken(
        token=token,
        email=email,
        role=AgencyRole.ADMIN,   # new paying user = admin of their own agency
        agency_id=None,          # triggers agency auto-creation on verify
        expires_at=expires_at,
        # No invited_by_user_id — this is system-generated from Stripe
    )
    db.add(magic_token)
    db.commit()
    db.refresh(magic_token)

    magic_url = f"{FRONTEND_URL.rstrip('/')}{MAGIC_LINK_PATH}?token={token}"

    logger.info(
        "Onboarding magic link created for %s (token_id=%s, expires=%s, stripe_customer=%s)",
        email,
        magic_token.id,
        expires_at.isoformat(),
        stripe_customer_id or "N/A",
    )

    return magic_url, None
