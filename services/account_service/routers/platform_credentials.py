"""
API router for managing platform credentials.

Platform credentials are linked to clients (brands) within agencies.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from packages.db.database import get_db
from services.account_service.platform_credentials import PlatformCredentialService
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/platform-credentials", tags=["Platform Credentials"])


class StoreCredentialsRequest(BaseModel):
    platform: str
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    token_expires_at: Optional[datetime] = None


@router.post("/store")
async def store_credentials(
    request: StoreCredentialsRequest,
    client_id: int = Query(..., description="Client ID"),
    db: Session = Depends(get_db)
):
    """
    Store platform credentials securely for a client.
    Credentials are encrypted before storage.
    """
    credential = PlatformCredentialService.store_credentials(
        db=db,
        client_id=client_id,
        platform=request.platform,
        access_token=request.access_token,
        refresh_token=request.refresh_token,
        app_id=request.app_id,
        app_secret=request.app_secret,
        token_expires_at=request.token_expires_at
    )
    return {"success": True, "credential_id": credential.id, "platform": credential.platform}


@router.get("/{platform}")
async def get_credentials(
    platform: str,
    client_id: int = Query(..., description="Client ID"),
    db: Session = Depends(get_db)
):
    """
    Get platform credentials (decrypted) for a client.
    """
    credentials = PlatformCredentialService.get_credentials(db, client_id, platform)
    if not credentials:
        raise HTTPException(status_code=404, detail="Credentials not found")
    return {"success": True, "credentials": credentials}


@router.delete("/{platform}")
async def revoke_credentials(
    platform: str,
    client_id: int = Query(..., description="Client ID"),
    db: Session = Depends(get_db)
):
    """
    Revoke platform credentials for a client (soft delete).
    """
    success = PlatformCredentialService.revoke_credentials(db, client_id, platform)
    if not success:
        raise HTTPException(status_code=404, detail="Credentials not found")
    return {"success": True, "message": "Credentials revoked"}


class SelectAccountRequest(BaseModel):
    ad_account_id: str
    ad_account_name: Optional[str] = None
    currency: Optional[str] = None
    status: Optional[str] = None


@router.post("/{platform}/select-account")
async def select_account(
    platform: str,
    request: SelectAccountRequest,
    client_id: int = Query(..., description="Client ID"),
    db: Session = Depends(get_db)
):
    """
    Select an active ad account for a given platform.
    """
    credentials = PlatformCredentialService.get_credentials(db, client_id, platform)
    if not credentials:
        raise HTTPException(status_code=404, detail="Credentials not found")
    success = PlatformCredentialService.set_ad_account(
        db=db,
        client_id=client_id,
        platform=platform,
        ad_account_id=request.ad_account_id,
        ad_account_name=request.ad_account_name,
        currency=request.currency,
        status=request.status
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Credentials not found. Connect the platform first.")
        
    return {"success": True, "message": f"Ad account {request.ad_account_id} selected for {platform}"}
