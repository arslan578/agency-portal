"""Shared agency path ↔ JWT context checks for account_service routes."""

from fastapi import HTTPException, status


def ensure_agency_scope(ctx: dict, agency_id: int) -> None:
    """Require URL/path agency_id to match the authenticated user's X-Agency-ID context."""
    if ctx.get("agency_id") != agency_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this agency",
        )
