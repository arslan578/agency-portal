"""
Admin Service — Platform-level administration endpoints.

All endpoints require superuser (is_superuser=True) authentication.
Handles magic link invite management for the agency portal.
"""

import logging
import secrets
import re
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from packages.db.database import get_db, engine
from packages.db.admin_schema import ensure_magic_tokens_table
from packages.db.models import MagicToken, User, Agency, AgencyMembership, AgencyRole
from services.auth_service.dependencies import require_superuser
from services.admin_service.schemas import InviteRequest, ResendInviteRequest, InviteOut
from services.admin_service.email import send_magic_link_email
import os

logger = logging.getLogger(__name__)

app = FastAPI(title="Kaivo Admin Service")
router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://agency.getkaivo.com")
# Next.js route is /verify (not /auth/verify); must match apps/agency-portal proxy public paths.
MAGIC_LINK_PATH = os.getenv("MAGIC_LINK_PATH", "/verify")
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
TOKEN_EXPIRY_HOURS = 48

ROLE_MAP = {
    "agency_admin": AgencyRole.ADMIN,
    "agency_member": AgencyRole.MEMBER,
    "agency_viewer": AgencyRole.VIEWER,
}


@router.post("/invite")
def create_invite(
    body: InviteRequest,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_superuser),
):
    """Send a magic link invite to a new user (superuser only)."""
    ensure_magic_tokens_table(engine)
    email = body.email.lower().strip()

    if not EMAIL_REGEX.match(email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    role_enum = ROLE_MAP.get(body.role)
    if not role_enum:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {list(ROLE_MAP.keys())}",
        )

    if body.agency_id:
        agency = db.query(Agency).filter(Agency.id == body.agency_id).first()
        if not agency:
            raise HTTPException(status_code=404, detail="Agency not found")

    # Invalidate any existing unused, unexpired tokens for this email
    existing_tokens = db.query(MagicToken).filter(
        MagicToken.email == email,
        MagicToken.used_at.is_(None),
        MagicToken.expires_at > datetime.now(timezone.utc),
    ).all()
    for t in existing_tokens:
        t.used_at = datetime.now(timezone.utc)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)

    magic_token = MagicToken(
        token=token,
        email=email,
        role=role_enum,
        agency_id=body.agency_id,
        expires_at=expires_at,
        invited_by_user_id=ctx["user_id"],
    )
    db.add(magic_token)
    db.commit()
    db.refresh(magic_token)

    magic_url = f"{FRONTEND_URL.rstrip('/')}{MAGIC_LINK_PATH}?token={token}"

    sent = send_magic_link_email(email, magic_url)
    if not sent:
        logger.warning(
            "Invite stored for %s but email not sent (configure RESEND_API_KEY). Link: %s",
            email,
            magic_url,
        )

    return {
        "success": True,
        "message": f"Invite created for {email}"
        + ("; email sent." if sent else "; email skipped — set RESEND_API_KEY or copy invite_link."),
        "invite_link": magic_url,
        "email_sent": sent,
    }


@router.get("/invites")
def list_invites(
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_superuser),
):
    """List all magic link invites with computed status (superuser only)."""
    ensure_magic_tokens_table(engine)
    tokens = (
        db.query(MagicToken)
        .order_by(MagicToken.created_at.desc())
        .all()
    )

    result = []
    now = datetime.now(timezone.utc)
    for t in tokens:
        if t.used_at:
            computed_status = "accepted"
        elif t.expires_at:
            exp = t.expires_at if t.expires_at.tzinfo else t.expires_at.replace(tzinfo=timezone.utc)
            computed_status = "expired" if exp < now else "pending"
        else:
            computed_status = "pending"

        agency_name = None
        if t.agency_id:
            agency = db.query(Agency).filter(Agency.id == t.agency_id).first()
            agency_name = agency.name if agency else None

        result.append({
            "id": t.id,
            "email": t.email,
            "role": t.role.value if t.role else "agency_viewer",
            "agency_id": t.agency_id,
            "agency_name": agency_name,
            "status": computed_status,
            "created_at": str(t.created_at) if t.created_at else None,
            "used_at": str(t.used_at) if t.used_at else None,
        })

    return result


@router.post("/resend-invite")
def resend_invite(
    body: ResendInviteRequest,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_superuser),
):
    """Invalidate old token and send a fresh magic link (superuser only)."""
    ensure_magic_tokens_table(engine)
    email = body.email.lower().strip()

    # Find the most recent token for this email to preserve role/agency
    latest = (
        db.query(MagicToken)
        .filter(MagicToken.email == email)
        .order_by(MagicToken.created_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status_code=404, detail="No previous invite found for this email")

    # Invalidate all existing unused tokens for this email
    existing_tokens = db.query(MagicToken).filter(
        MagicToken.email == email,
        MagicToken.used_at.is_(None),
    ).all()
    for t in existing_tokens:
        t.used_at = datetime.now(timezone.utc)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)

    magic_token = MagicToken(
        token=token,
        email=email,
        role=latest.role,
        agency_id=latest.agency_id,
        expires_at=expires_at,
        invited_by_user_id=ctx["user_id"],
    )
    db.add(magic_token)
    db.commit()

    magic_url = f"{FRONTEND_URL.rstrip('/')}{MAGIC_LINK_PATH}?token={token}"

    sent = send_magic_link_email(email, magic_url)
    if not sent:
        logger.warning("Resend: email not sent for %s; link: %s", email, magic_url)

    return {
        "success": True,
        "message": f"New invite created for {email}"
        + ("; email sent." if sent else "; set RESEND_API_KEY to email automatically."),
        "invite_link": magic_url,
        "email_sent": sent,
    }


@router.get("/agencies")
def list_agencies(
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_superuser),
):
    """List all agencies for the invite form workspace selector (superuser only)."""
    agencies = db.query(Agency).order_by(Agency.name).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "current_plan": a.current_plan.value if a.current_plan else "free",
        }
        for a in agencies
    ]


app.include_router(router)
