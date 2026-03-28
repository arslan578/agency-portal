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
from typing import Optional
import os
import jwt

from packages.db.database import get_db
from packages.db.models import AgencyMembership, AgencyRole, User

JWT_SECRET = os.getenv("SECRET_KEY", "TEST_SECRET_KEY_CHANGE_IN_PROD")
JWT_ALGORITHM = "HS256"


def decode_jwt_token(authorization: str) -> Optional[int]:
    """Decode JWT token and extract user_id"""
    if not authorization:
        return None
    
    try:
        # Handle "Bearer <token>" format
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id") or payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


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
    
    user_id = decode_jwt_token(authorization)
    if not user_id:
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
    
    # Verify user is a member of this agency
    membership = db.query(AgencyMembership).filter(
        AgencyMembership.user_id == user_id,
        AgencyMembership.agency_id == agency_id
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this agency"
        )
    
    return {
        "user_id": user_id,
        "agency_id": agency_id,
        "role": membership.role
    }


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
        return await get_current_user_agency_context(x_agency_id, authorization, db)
    except HTTPException:
        return None


async def require_superuser(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> dict:
    """
    Dependency that requires the authenticated user to be a superuser.
    Used to protect platform-level admin endpoints (e.g. magic link invites).
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )

    user_id = decode_jwt_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing user in token"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required"
        )

    return {"user_id": user.id, "email": user.email}
