"""
Microsoft Ads Agency Service for Agency Portal.

Pattern mirrors Meta / Reddit / Spotify / TikTok agency services:
- Agency-level OAuth: authorize in the portal, token exchange via
  POST /agency/{id}/microsoft/connect (same msads.manage scope as commercial flow).
- Agency ad account discovery via MicrosoftAdsConnector (CustomerManagementService).
- Client account linking (auto/manual) against Kaivo platform_accounts.
- Client campaign insights fetching per linked ad account (stub campaigns for now).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from packages.db.models import Agency, AuditLog, Client
from services.platform_service.connectors.microsoft_ads import MicrosoftAdsConnector

logger = logging.getLogger(__name__)

# Must match authorize + token exchange (see api_gateway Microsoft OAuth).
_MSADS_SCOPE = "https://ads.microsoft.com/msads.manage offline_access"


def _oauth_redirect_uri(redirect_uri: Optional[str] = None) -> str:
    """Redirect URI registered in Azure / Microsoft Advertising app."""
    if redirect_uri:
        return redirect_uri
    explicit = os.getenv("MICROSOFT_REDIRECT_URI", "").strip()
    if explicit:
        return explicit
    frontend_url = os.getenv(
        "FRONTEND_URL",
        os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    ).rstrip("/")
    return f"{frontend_url}/integrations/microsoft/oauth/callback"


def exchange_microsoft_code_for_token(
    code: str,
    redirect_uri: Optional[str] = None,
) -> Dict[str, Any]:
    """Exchange OAuth authorization code for Microsoft Advertising tokens."""
    client_id = os.getenv("MICROSOFT_ADS_CLIENT_ID", os.getenv("MICROSOFT_CLIENT_ID"))
    client_secret = os.getenv("MICROSOFT_ADS_CLIENT_SECRET", os.getenv("MICROSOFT_CLIENT_SECRET"))
    if not client_id or not client_secret:
        raise ValueError("MICROSOFT_ADS_CLIENT_ID and MICROSOFT_ADS_CLIENT_SECRET must be set")

    final_redirect = _oauth_redirect_uri(redirect_uri)
    token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": final_redirect,
        "grant_type": "authorization_code",
        "scope": _MSADS_SCOPE,
    }
    with httpx.Client(timeout=30.0) as http:
        resp = http.post(token_url, data=payload)
        token_json = resp.json() if resp.content else {}
    if resp.status_code != 200:
        msg = token_json.get("error_description") or token_json.get("error") or resp.text
        raise ValueError(f"Microsoft OAuth token exchange failed: {msg}")

    access_token = token_json.get("access_token")
    if not access_token:
        raise ValueError("No access_token in Microsoft OAuth response")

    expires_in = int(token_json.get("expires_in", 3600))
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    return {
        "access_token": access_token,
        "refresh_token": token_json.get("refresh_token"),
        "expires_at": expires_at,
    }


def connect_microsoft_agency_oauth(
    db: Session,
    agency_id: int,
    code: str,
    user_id: Optional[int] = None,
    redirect_uri: Optional[str] = None,
) -> Dict[str, Any]:
    """Complete OAuth: exchange code, then store tokens on the agency."""
    tokens = exchange_microsoft_code_for_token(code, redirect_uri=redirect_uri)
    return connect_microsoft_agency(
        db,
        agency_id,
        tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        expires_at=tokens["expires_at"],
        user_id=user_id,
    )


def log_audit(
    db: Session,
    action: str,
    agency_id: Optional[int] = None,
    client_id: Optional[int] = None,
    user_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Best-effort write to audit_logs table."""
    try:
        entry = AuditLog(
            agency_id=agency_id,
            client_id=client_id,
            user_id=user_id,
            action=action,
            details=details or {},
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        logger.error("Audit log write failed: %s", exc)
        db.rollback()


def _microsoft_connector_creds(agency: Agency) -> Dict[str, Any]:
    """Credentials dict for MicrosoftAdsConnector; include refresh_token for SDK refresh behavior."""
    creds: Dict[str, Any] = {"access_token": agency.microsoft_agency_access_token or ""}
    if agency.microsoft_refresh_token:
        creds["refresh_token"] = agency.microsoft_refresh_token
    return creds


def connect_microsoft_agency(
    db: Session,
    agency_id: int,
    access_token: str,
    refresh_token: Optional[str] = None,
    expires_at: Optional[datetime] = None,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Store Microsoft Ads OAuth tokens on the agency.

    This function assumes tokens have already been exchanged by the API gateway
    and provided here. For agency-portal we piggyback on the same token model.
    """
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    agency.microsoft_agency_access_token = access_token
    agency.microsoft_refresh_token = refresh_token
    agency.microsoft_token_expires_at = expires_at
    agency.microsoft_connected_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "microsoft_connected",
        agency_id=agency_id,
        user_id=user_id,
        details={"has_refresh_token": bool(refresh_token)},
    )
    return {"connected": True}


def disconnect_microsoft_agency(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Clear Microsoft Ads tokens from agency and reset all client mappings."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    agency.microsoft_agency_access_token = None
    agency.microsoft_refresh_token = None
    agency.microsoft_token_expires_at = None
    agency.microsoft_connected_at = None

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    for client in clients:
        client.agency_microsoft_account_id = None
        client.microsoft_account_name = None
        client.microsoft_linked_at = None
        client.microsoft_account_status = "agency_not_connected"

    db.commit()
    log_audit(db, "microsoft_disconnected", agency_id=agency_id, user_id=user_id)
    return {"disconnected": True}


def get_microsoft_status(db: Session, agency_id: int) -> Dict[str, Any]:
    """Return agency-level Microsoft Ads connection status."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    connected = bool(agency.microsoft_agency_access_token)
    token_valid = connected
    if connected and agency.microsoft_token_expires_at:
        token_valid = agency.microsoft_token_expires_at.replace(tzinfo=None) > datetime.utcnow()

    return {
        "connected": connected,
        "connected_at": agency.microsoft_connected_at.isoformat() if agency.microsoft_connected_at else None,
        "token_valid": token_valid,
        "token_expires_at": agency.microsoft_token_expires_at.isoformat()
        if agency.microsoft_token_expires_at
        else None,
        "token_warning": bool(
            agency.microsoft_token_expires_at
            and (agency.microsoft_token_expires_at.replace(tzinfo=None) - datetime.utcnow()).days <= 7
        )
        if connected
        else False,
    }


def get_microsoft_agency_accounts(db: Session, agency_id: int) -> Dict[str, Any]:
    """List Microsoft Ads accounts discovered for this agency."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")
    if not agency.microsoft_agency_access_token:
        return {"connected": False, "accounts": [], "reason": "agency_not_connected"}

    connector = MicrosoftAdsConnector(credentials=_microsoft_connector_creds(agency))
    result = connector.fetch_ad_accounts()
    if not result.get("success"):
        logger.warning("Microsoft Ads ad account fetch failed: %s", result.get("error"))
        return {
            "connected": False,
            "accounts": [],
            "reason": result.get("error_code", "unknown_error"),
            "error": result.get("error"),
        }

    accounts = result.get("ad_accounts", [])
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    linked = {
        c.agency_microsoft_account_id: c.id
        for c in clients
        if c.agency_microsoft_account_id
    }
    for acc in accounts:
        acc["linked_client_id"] = linked.get(acc.get("account_id"))

    return {"connected": True, "accounts": accounts}


def auto_link_microsoft_clients(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Auto-link clients to Microsoft Ads accounts using PlatformAccount records."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency or not agency.microsoft_agency_access_token:
        raise ValueError("Agency not connected to Microsoft Ads")

    connector = MicrosoftAdsConnector(credentials=_microsoft_connector_creds(agency))
    result = connector.fetch_ad_accounts()
    if not result.get("success"):
        raise ValueError(result.get("error") or "Failed to fetch Microsoft Ads accounts")

    accounts = result.get("ad_accounts", [])
    account_map = {a["account_id"]: a for a in accounts}

    from packages.db.models import PlatformAccount

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    matched = 0
    not_linked = 0

    for client in clients:
        pa = (
            db.query(PlatformAccount)
            .filter(
                PlatformAccount.client_id == client.id,
                PlatformAccount.platform == "microsoft_ads",
            )
            .first()
        )
        if pa and pa.account_id in account_map:
            row = account_map[pa.account_id]
            client.agency_microsoft_account_id = pa.account_id
            client.microsoft_account_name = row.get("name") or row.get("account_id")
            client.microsoft_account_status = "linked_kaivo_matched"
            client.microsoft_linked_at = datetime.utcnow()
            matched += 1
            log_audit(
                db,
                "microsoft_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "matched"},
            )
        else:
            if client.microsoft_account_status != "linked_manual":
                client.microsoft_account_status = "not_linked"
            not_linked += 1
            log_audit(
                db,
                "microsoft_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "not_matched"},
            )

    db.commit()
    return {"matched": matched, "not_linked": not_linked, "total": len(clients)}


def manual_link_microsoft_client(
    db: Session,
    client_id: int,
    ad_account_id: str,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Manually link a Microsoft Ads account to a client."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")
    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    account_name = ""
    customer_id = None
    if agency and agency.microsoft_agency_access_token:
        try:
            connector = MicrosoftAdsConnector(credentials=_microsoft_connector_creds(agency))
            result = connector.fetch_ad_accounts()
            if result.get("success"):
                for row in result.get("ad_accounts", []):
                    if row.get("account_id") == ad_account_id:
                        account_name = row.get("name") or row.get("account_id", "")
                        customer_id = row.get("customer_id")
                        break
        except Exception:
            account_name = ""

    client.agency_microsoft_account_id = ad_account_id
    client.microsoft_account_name = account_name
    client.microsoft_account_status = "linked_manual"
    client.microsoft_linked_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "microsoft_manual_link",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"ad_account_id": ad_account_id, "account_name": account_name, "customer_id": customer_id},
    )
    return {
        "linked": True,
        "client_id": client_id,
        "ad_account_id": ad_account_id,
        "microsoft_account_name": account_name,
    }


def fetch_client_microsoft_insights(
    db: Session,
    client_id: int,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fetch Microsoft Ads campaigns for a specific client using the agency's Microsoft token.
    For now we return a stub payload shaped like other insights endpoints.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")
    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    if not agency.microsoft_agency_access_token:
        return {
            "connected": False,
            "reason": "agency_not_connected",
            "microsoft_account_status": "agency_not_connected",
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": None,
        }

    if client.microsoft_account_status in ("agency_not_connected", "not_linked") or not client.agency_microsoft_account_id:
        return {
            "connected": False,
            "reason": "not_linked",
            "microsoft_account_status": client.microsoft_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": True,
            "token_expires_at": agency.microsoft_token_expires_at.isoformat()
            if agency.microsoft_token_expires_at
            else None,
        }

    token_valid = True
    if agency.microsoft_token_expires_at:
        token_valid = agency.microsoft_token_expires_at.replace(tzinfo=None) > datetime.utcnow()
    if not token_valid:
        return {
            "connected": False,
            "reason": "token_expired",
            "microsoft_account_status": client.microsoft_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": agency.microsoft_token_expires_at.isoformat()
            if agency.microsoft_token_expires_at
            else None,
        }

    account = {
        "account_id": client.agency_microsoft_account_id,
        "account_name": client.microsoft_account_name or "",
        "currency": "USD",
        "timezone": "",
        "status": "ACTIVE",
    }
    # Stub campaigns for now; reporting API integration can be added later.
    campaigns: List[Dict[str, Any]] = []
    log_audit(
        db,
        "microsoft_insights_fetch",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"campaigns_count": len(campaigns)},
    )
    return {
        "connected": True,
        "microsoft_account_status": client.microsoft_account_status,
        "ad_accounts": [account],
        "campaigns": campaigns,
        "token_valid": True,
        "token_expires_at": agency.microsoft_token_expires_at.isoformat()
        if agency.microsoft_token_expires_at
        else None,
    }

