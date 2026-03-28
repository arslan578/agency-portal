"""
Service for managing platform credentials securely.
Handles encryption/decryption and CRUD operations.

Platform credentials are linked to clients (brands) within agencies.
Note: The database column is still named 'account_id' for backward compatibility,
but it stores the client_id value.
"""

from sqlalchemy.orm import Session
from fastapi import HTTPException
from packages.db.models import PlatformCredential
from services.shared.encryption import encryption_service
from typing import Optional, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class PlatformCredentialService:
    """Service for managing platform credentials securely"""
    
    @staticmethod
    def get_credentials(db: Session, client_id: int, platform: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve platform credentials for a client.
        Returns decrypted credentials as a dictionary.
        """
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.account_id == client_id,
            PlatformCredential.platform == platform
        ).first()
        
        if not credential or not credential.is_active:
            return None
        
        # Decrypt tokens
        decrypted_data = {
            "platform": credential.platform,
            "app_id": credential.app_id,
        }
        
        if credential.access_token_encrypted:
            try:
                decrypted_data["access_token"] = encryption_service.decrypt(credential.access_token_encrypted)
            except Exception as e:
                logger.error(f"Failed to decrypt access token for platform {platform}: {e}")
                decrypted_data["access_token"] = None
        
        if credential.refresh_token_encrypted:
            try:
                decrypted_data["refresh_token"] = encryption_service.decrypt(credential.refresh_token_encrypted)
            except Exception as e:
                logger.error(f"Failed to decrypt refresh token for platform {platform}: {e}")
                decrypted_data["refresh_token"] = None
        
        if credential.app_secret_encrypted:
            try:
                decrypted_data["app_secret"] = encryption_service.decrypt(credential.app_secret_encrypted)
            except Exception as e:
                logger.error(f"Failed to decrypt app secret for platform {platform}: {e}")
                decrypted_data["app_secret"] = None
                
        decrypted_data["ad_account_id"] = credential.ad_account_id
        decrypted_data["ad_account_name"] = credential.ad_account_name
        decrypted_data["currency"] = credential.currency
        decrypted_data["status"] = credential.status
        
        return decrypted_data
    
    @staticmethod
    def store_credentials(
        db: Session,
        client_id: int,
        platform: str,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        app_id: Optional[str] = None,
        app_secret: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
        ad_account_id: Optional[str] = None,
        ad_account_name: Optional[str] = None,
        currency: Optional[str] = None,
        status: Optional[str] = None
    ) -> PlatformCredential:
        """
        Store platform credentials securely (encrypted) for a client.
        Updates existing if present, creates new if not.
        """
        existing = db.query(PlatformCredential).filter(
            PlatformCredential.account_id == client_id,
            PlatformCredential.platform == platform
        ).first()
        
        if existing:
            if access_token:
                existing.access_token_encrypted = encryption_service.encrypt(access_token)
            if refresh_token:
                existing.refresh_token_encrypted = encryption_service.encrypt(refresh_token)
            if app_secret:
                existing.app_secret_encrypted = encryption_service.encrypt(app_secret)
            if app_id:
                existing.app_id = app_id
            if token_expires_at:
                existing.token_expires_at = token_expires_at
            if ad_account_id is not None:
                existing.ad_account_id = ad_account_id
            if ad_account_name is not None:
                existing.ad_account_name = ad_account_name
            if currency is not None:
                existing.currency = currency
            if status is not None:
                existing.status = status
            existing.is_active = True
            
            db.commit()
            db.refresh(existing)
            return existing
        else:
            credential = PlatformCredential(
                account_id=client_id,
                platform=platform,
                access_token_encrypted=encryption_service.encrypt(access_token) if access_token else None,
                refresh_token_encrypted=encryption_service.encrypt(refresh_token) if refresh_token else None,
                app_id=app_id,
                app_secret_encrypted=encryption_service.encrypt(app_secret) if app_secret else None,
                token_expires_at=token_expires_at,
                ad_account_id=ad_account_id,
                ad_account_name=ad_account_name,
                currency=currency,
                status=status,
                is_active=True
            )
            db.add(credential)
            db.commit()
            db.refresh(credential)
            return credential

    @staticmethod
    def set_ad_account(
        db: Session,
        client_id: int,
        platform: str,
        ad_account_id: str,
        ad_account_name: Optional[str] = None,
        currency: Optional[str] = None,
        status: Optional[str] = None
    ) -> bool:
        """
        Update ONLY the active ad account fields for an existing platform credential.
        Avoids overwriting access/refresh tokens.
        """
        existing = db.query(PlatformCredential).filter(
            PlatformCredential.account_id == client_id,
            PlatformCredential.platform == platform
        ).first()

        if not existing:
            return False

        existing.ad_account_id = ad_account_id
        if ad_account_name is not None:
            existing.ad_account_name = ad_account_name
        if currency is not None:
            existing.currency = currency
        if status is not None:
            existing.status = status
        
        db.commit()
        return True

    @staticmethod
    def get_credentials(db: Session, client_id: int, platform: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve and decrypt platform credentials for a client.
        Returns None if not found or inactive.
        """
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.account_id == client_id,
            PlatformCredential.platform == platform,
            PlatformCredential.is_active == True
        ).first()
        
        if not credential:
            return None
        
        try:
            return {
                "access_token": encryption_service.decrypt(credential.access_token_encrypted) if credential.access_token_encrypted else None,
                "refresh_token": encryption_service.decrypt(credential.refresh_token_encrypted) if credential.refresh_token_encrypted else None,
                "app_id": credential.app_id,
                "app_secret": encryption_service.decrypt(credential.app_secret_encrypted) if credential.app_secret_encrypted else None,
                "token_expires_at": credential.token_expires_at,
                "platform": credential.platform,
                "ad_account_id": credential.ad_account_id,
                "ad_account_name": credential.ad_account_name,
                "currency": credential.currency,
                "status": credential.status
            }
        except Exception as e:
            logger.error(f"Failed to decrypt credentials: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve credentials")
    
    @staticmethod
    def revoke_credentials(db: Session, client_id: int, platform: str) -> bool:
        """Mark credentials as inactive (soft delete)"""
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.account_id == client_id,
            PlatformCredential.platform == platform
        ).first()
        
        if credential:
            credential.is_active = False
            db.commit()
            return True
        return False
