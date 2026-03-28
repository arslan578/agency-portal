"""
Role-Based Access Control (RBAC) Dependencies

This module provides FastAPI dependencies for enforcing role-based access
on API endpoints. Use these to protect sensitive operations.

Usage:
    from services.auth_service.dependencies import require_admin, require_member_or_above
    
    @router.post("/agencies/{agency_id}/invite")
    def invite_member(..., ctx: dict = Depends(require_admin)):
        # Only agency admins can access this endpoint
        pass
"""

from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from typing import Any, Dict, Optional
import os
import jwt

from packages.db.database import get_db
from packages.db.models import AgencyMembership, AgencyRole

JWT_SECRET = os.getenv("SECRET_KEY", "TEST_SECRET_KEY_CHANGE_IN_PROD")
JWT_ALGORITHM = "HS256"


def _jwt_membership_fallback_enabled() -> bool:
    """
    When True, if there is no AgencyMembership row but the JWT carries matching
    user_id + agency_id claims (same as X-Agency-ID), trust agency_role from the token.

    Disabled in production unless explicitly overridden (keeps DB as source of truth).
    """
    explicit = os.getenv("ALLOW_JWT_AGENCY_MEMBERSHIP_FALLBACK", "").strip().lower()
    if explicit in ("1", "true", "yes", "on"):
        return True
    if explicit in ("0", "false", "no", "off"):
        return False
    env = os.getenv("ENVIRONMENT", os.getenv("ENV", "development")).strip().lower()
    return env in ("development", "dev", "local", "test")


def decode_jwt_payload(authorization: str) -> Dict[str, Any]:
    """Decode and verify JWT; return claims dict."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
        )
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _parse_user_id_from_payload(payload: Dict[str, Any]) -> Optional[int]:
    """Prefer numeric user_id; avoid treating email `sub` as user id."""
    if "user_id" in payload and payload["user_id"] is not None:
        uid = payload["user_id"]
    else:
        sub = payload.get("sub")
        if isinstance(sub, str) and sub.isdigit():
            uid = sub
        else:
            return None
    if isinstance(uid, int):
        return uid
    if isinstance(uid, str) and uid.isdigit():
        return int(uid)
    return None


def _agency_role_from_jwt_payload(payload: Dict[str, Any]) -> AgencyRole:
    raw = payload.get("agency_role")
    if not isinstance(raw, str):
        return AgencyRole.VIEWER
    key = raw.strip().lower().replace("-", "_")
    role_map = {
        "agency_admin": AgencyRole.ADMIN,
        "agency_member": AgencyRole.MEMBER,
        "agency_viewer": AgencyRole.VIEWER,
    }
    return role_map.get(key, AgencyRole.VIEWER)


def decode_jwt_token(authorization: str) -> Optional[int]:
    """Decode JWT token and extract user_id (int), or None if missing/invalid shape."""
    if not authorization:
        return None
    try:
        payload = decode_jwt_payload(authorization)
    except HTTPException:
        raise
    return _parse_user_id_from_payload(payload)


async def get_current_user_agency_context(
    x_agency_id: Optional[str] = Header(None, alias="X-Agency-ID"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> dict:
    """
    Extract and validate user's agency membership from JWT + headers.
    
    Returns a context dict with:
    - user_id: int
    - agency_id: int
    - role: AgencyRole enum
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )

    payload = decode_jwt_payload(authorization)
    user_id = _parse_user_id_from_payload(payload)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing user in token"
        )

    # Parse agency_id from header
    agency_id = None
    if x_agency_id:
        try:
            agency_id = int(x_agency_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Agency-ID must be an integer"
            )

    if not agency_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Agency-ID header required"
        )

    # Verify user is a member of this agency (preferred)
    membership = db.query(AgencyMembership).filter(
        AgencyMembership.user_id == user_id,
        AgencyMembership.agency_id == agency_id
    ).first()

    if membership:
        return {
            "user_id": user_id,
            "agency_id": agency_id,
            "role": membership.role,
        }

    # Local/dev: token was issued with agency claims but DB has no row (empty DB, wrong DB, seed drift).
    if _jwt_membership_fallback_enabled():
        try:
            claim_aid = payload.get("agency_id")
            claim_aid = int(claim_aid) if claim_aid is not None else None
        except (TypeError, ValueError):
            claim_aid = None
        if claim_aid == agency_id:
            return {
                "user_id": user_id,
                "agency_id": agency_id,
                "role": _agency_role_from_jwt_payload(payload),
            }

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not a member of this agency",
    )


def require_agency_role(allowed_roles: list):
    """
    Dependency factory for role-based access.
    
    Usage:
        @router.post("/sensitive-action")
        def sensitive_action(..., ctx: dict = Depends(require_agency_role([AgencyRole.ADMIN]))):
            pass
    """
    async def check_role(
        context: dict = Depends(get_current_user_agency_context)
    ) -> dict:
        if context["role"] not in allowed_roles:
            allowed_names = [r.value for r in allowed_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {allowed_names}"
            )
        return context
    return check_role


# Convenience dependencies for common role requirements
require_admin = require_agency_role([AgencyRole.ADMIN])
require_member_or_above = require_agency_role([AgencyRole.ADMIN, AgencyRole.MEMBER])
require_any_member = require_agency_role([AgencyRole.ADMIN, AgencyRole.MEMBER, AgencyRole.VIEWER])


# Optional: Get context without requiring specific role (for endpoints that need context but allow any member)
async def get_optional_agency_context(
    x_agency_id: Optional[str] = Header(None, alias="X-Agency-ID"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[dict]:
    """
    Like get_current_user_agency_context but returns None instead of raising
    if context cannot be determined. Useful for endpoints with optional auth.
    """
    if not authorization or not x_agency_id:
        return None
    
    try:
        return await get_current_user_agency_context(
            x_agency_id=x_agency_id,
            authorization=authorization,
            db=db,
        )
    except HTTPException:
        return None
