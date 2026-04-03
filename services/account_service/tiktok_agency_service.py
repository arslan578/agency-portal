"""
TikTok Agency Service for Agency Portal.

Pattern mirrors Meta / Reddit / Spotify agency services:
- Agency-level OAuth token storage on Agency model (using TikTok OAuth v2 tokens
  that are already issued in the commercial portal via /platforms/tiktok/oauth/callback).
- Agency ad account discovery via TikTok Business API (oauth2/advertiser/get).
- Client account linking (auto/manual) against Kaivo platform_accounts.
- Client campaign insights fetching per linked ad account.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from packages.db.models import Agency, AuditLog, Client
from services.platform_service.connectors.tiktok import TikTokAdsConnector

logger = logging.getLogger(__name__)


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


def _oauth_redirect_uri(redirect_uri: Optional[str] = None) -> str:
    """
    Build the exact redirect URI used for TikTok OAuth in the agency portal.

    This MUST match the redirect_uri configured in the TikTok Developer app and
    matches the commercial portal pattern:
      {FRONTEND_URL}/integrations/tiktok/oauth/callback
    """
    if redirect_uri:
        return redirect_uri
    frontend_url = os.getenv(
        "FRONTEND_URL",
        os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    ).rstrip("/")
    return f"{frontend_url}/integrations/tiktok/oauth/callback"


def exchange_code_for_token(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    """
    Exchange OAuth authorization code for TikTok access/refresh tokens.

    This mirrors the flow in services.api_gateway.main.tiktok_oauth_callback but
    returns a simple dict for the agency context.
    """
    app_id = os.getenv("TIKTOK_APP_ID")
    app_secret = os.getenv("TIKTOK_APP_SECRET")
    if not app_id or not app_secret:
        raise ValueError("TIKTOK_APP_ID and TIKTOK_APP_SECRET must be set")

    final_redirect = _oauth_redirect_uri(redirect_uri)
    token_url = "https://open.tiktokapis.com/v2/oauth/token/"
    payload = {
        "client_key": app_id,
        "client_secret": app_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": final_redirect,
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(token_url, data=payload)
        if resp.status_code != 200:
            raise ValueError(f"TikTok OAuth token exchange failed: {resp.text}")
        raw = resp.json()

    if isinstance(raw, dict):
        data = raw.get("data", raw) or {}
    else:
        data = {}

    access_token = data.get("access_token")
    if not access_token:
        raise ValueError("No access_token in TikTok OAuth response")

    expires_in = int(data.get("expires_in", 24 * 3600))
    now = datetime.utcnow()
    return {
        "access_token": access_token,
        "refresh_token": data.get("refresh_token"),
        "expires_in": expires_in,
        "expires_at": now + timedelta(seconds=expires_in),
    }


def connect_tiktok_agency(
    db: Session,
    agency_id: int,
    code: str,
    user_id: Optional[int] = None,
    redirect_uri: Optional[str] = None,
) -> Dict[str, Any]:
    """Exchange OAuth code and store TikTok tokens on the agency."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    token_data = exchange_code_for_token(code, redirect_uri=redirect_uri)
    agency.tiktok_agency_access_token = token_data["access_token"]
    agency.tiktok_refresh_token = token_data.get("refresh_token")
    agency.tiktok_token_expires_at = token_data["expires_at"]
    agency.tiktok_connected_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "tiktok_connected",
        agency_id=agency_id,
        user_id=user_id,
        details={"has_refresh_token": bool(token_data.get("refresh_token"))},
    )
    return {"connected": True}


def disconnect_tiktok_agency(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Clear TikTok token from agency and reset all client mappings."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    agency.tiktok_agency_access_token = None
    agency.tiktok_refresh_token = None
    agency.tiktok_token_expires_at = None
    agency.tiktok_connected_at = None

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    for client in clients:
        client.agency_tiktok_account_id = None
        client.tiktok_account_name = None
        client.tiktok_linked_at = None
        client.tiktok_account_status = "agency_not_connected"

    db.commit()
    log_audit(db, "tiktok_disconnected", agency_id=agency_id, user_id=user_id)
    return {"disconnected": True}


def get_tiktok_status(db: Session, agency_id: int) -> Dict[str, Any]:
    """Return agency-level TikTok connection status."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    connected = bool(agency.tiktok_agency_access_token)
    token_valid = connected
    if connected and agency.tiktok_token_expires_at:
        token_valid = agency.tiktok_token_expires_at.replace(tzinfo=None) > datetime.utcnow()

    return {
        "connected": connected,
        "connected_at": agency.tiktok_connected_at.isoformat() if agency.tiktok_connected_at else None,
        "token_valid": token_valid,
        "token_expires_at": agency.tiktok_token_expires_at.isoformat()
        if agency.tiktok_token_expires_at
        else None,
        "token_warning": bool(
            agency.tiktok_token_expires_at
            and (agency.tiktok_token_expires_at.replace(tzinfo=None) - datetime.utcnow()).days <= 7
        )
        if connected
        else False,
    }


def get_tiktok_agency_accounts(db: Session, agency_id: int) -> Dict[str, Any]:
    """List TikTok ad accounts discovered for this agency."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")
    if not agency.tiktok_agency_access_token:
        return {"connected": False, "accounts": [], "reason": "agency_not_connected"}

    connector = TikTokAdsConnector(
        credentials={
            "access_token": agency.tiktok_agency_access_token,
            "app_id": os.getenv("TIKTOK_APP_ID"),
            "app_secret": os.getenv("TIKTOK_APP_SECRET"),
        }
    )
    result = connector.fetch_ad_accounts()
    if not result.get("success"):
        logger.warning("TikTok ad account fetch failed: %s", result.get("error"))
        return {
            "connected": False,
            "accounts": [],
            "reason": result.get("error_code", "unknown_error"),
        }

    accounts = result.get("ad_accounts", [])
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    linked = {
        str(c.agency_tiktok_account_id): str(c.id)
        for c in clients
        if c.agency_tiktok_account_id
    }
    for acc in accounts:
        aid = acc.get("account_id")
        acc["linked_client_id"] = linked.get(str(aid)) if aid is not None else None

    return {"connected": True, "accounts": accounts}


def auto_link_tiktok_clients(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Auto-link clients to TikTok ad accounts using PlatformAccount records.
    """
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency or not agency.tiktok_agency_access_token:
        raise ValueError("Agency not connected to TikTok")

    connector = TikTokAdsConnector(
        credentials={
            "access_token": agency.tiktok_agency_access_token,
            "app_id": os.getenv("TIKTOK_APP_ID"),
            "app_secret": os.getenv("TIKTOK_APP_SECRET"),
        }
    )
    result = connector.fetch_ad_accounts()
    if not result.get("success"):
        raise ValueError(result.get("error") or "Failed to fetch TikTok ad accounts")

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
                PlatformAccount.platform == "tiktok",
            )
            .first()
        )
        if pa and pa.account_id in account_map:
            row = account_map[pa.account_id]
            client.agency_tiktok_account_id = pa.account_id
            client.tiktok_account_name = row.get("name") or row.get("account_name")
            client.tiktok_account_status = "linked_kaivo_matched"
            client.tiktok_linked_at = datetime.utcnow()
            matched += 1
            log_audit(
                db,
                "tiktok_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "matched"},
            )
        else:
            if client.tiktok_account_status != "linked_manual":
                client.tiktok_account_status = "not_linked"
            not_linked += 1
            log_audit(
                db,
                "tiktok_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "not_matched"},
            )

    db.commit()
    return {"matched": matched, "not_linked": not_linked, "total": len(clients)}


def manual_link_tiktok_client(
    db: Session,
    client_id: int,
    ad_account_id: str,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Manually link a TikTok ad account to a client."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")
    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    if str(ad_account_id).startswith("tiktok_bc:"):
        raise ValueError("Map a TikTok advertiser account, not the Business Center (parent) row")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    account_name = ""
    if agency and agency.tiktok_agency_access_token:
        try:
            connector = TikTokAdsConnector(
                credentials={
                    "access_token": agency.tiktok_agency_access_token,
                    "app_id": os.getenv("TIKTOK_APP_ID"),
                    "app_secret": os.getenv("TIKTOK_APP_SECRET"),
                }
            )
            result = connector.fetch_ad_accounts()
            if result.get("success"):
                for row in result.get("ad_accounts", []):
                    if row.get("account_id") == ad_account_id:
                        account_name = row.get("name") or row.get("account_name", "")
                        break
        except Exception:
            account_name = ""

    client.agency_tiktok_account_id = ad_account_id
    client.tiktok_account_name = account_name
    client.tiktok_account_status = "linked_manual"
    client.tiktok_linked_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "tiktok_manual_link",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"ad_account_id": ad_account_id, "account_name": account_name},
    )
    return {
        "linked": True,
        "client_id": client_id,
        "ad_account_id": ad_account_id,
        "tiktok_account_name": account_name,
    }


def _fetch_tiktok_campaigns(access_token: str, ad_account_id: str) -> List[Dict[str, Any]]:
    """
    Fetch campaigns for a given TikTok ad account.

    For now we rely on TikTokAdsConnector.fetch_reports-style behaviour being
    campaign-centric in other services; here we implement a minimal campaign
    listing using TikTok Marketing API v1.3.
    """
    headers = {
        "Content-Type": "application/json",
        "Access-Token": access_token,
    }
    url = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/"
    params = {
        "advertiser_id": ad_account_id,
    }
    with httpx.Client(timeout=30.0, headers=headers) as client:
        resp = client.get(url, params=params)
        if resp.status_code != 200:
            logger.warning("TikTok campaigns fetch failed for %s: %s", ad_account_id, resp.text)
            return []
        payload = resp.json()

    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    rows = data.get("list", [])
    if not isinstance(rows, list):
        rows = []

    campaigns: List[Dict[str, Any]] = []
    for row in rows:
        cid = str(row.get("campaign_id") or row.get("id") or "")
        if not cid:
            continue
        campaigns.append(
            {
                "campaign_id": cid,
                "name": row.get("campaign_name", f"Campaign {cid}"),
                "objective": row.get("objective_type", ""),
                "status": str(row.get("campaign_status", "UNKNOWN")).upper(),
                "budget_type": "daily",
                "budget": float(row.get("budget", 0) or 0) / 100.0,
                "currency": "USD",
                "start_date": row.get("create_time") or "",
                "end_date": row.get("end_time"),
                "ad_account_id": ad_account_id,
            }
        )
    return campaigns


def fetch_client_tiktok_insights(
    db: Session,
    client_id: int,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fetch TikTok campaigns for a specific client using the agency's TikTok token.
    Mirrors Meta/Reddit/Spotify client insights shape.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")
    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    if not agency.tiktok_agency_access_token:
        return {
            "connected": False,
            "reason": "agency_not_connected",
            "tiktok_account_status": "agency_not_connected",
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": None,
        }

    if client.tiktok_account_status in ("agency_not_connected", "not_linked") or not client.agency_tiktok_account_id:
        return {
            "connected": False,
            "reason": "not_linked",
            "tiktok_account_status": client.tiktok_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": True,
            "token_expires_at": agency.tiktok_token_expires_at.isoformat()
            if agency.tiktok_token_expires_at
            else None,
        }

    token_valid = True
    if agency.tiktok_token_expires_at:
        token_valid = agency.tiktok_token_expires_at.replace(tzinfo=None) > datetime.utcnow()
    if not token_valid:
        return {
            "connected": False,
            "reason": "token_expired",
            "tiktok_account_status": client.tiktok_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": agency.tiktok_token_expires_at.isoformat()
            if agency.tiktok_token_expires_at
            else None,
        }

    account = {
        "account_id": client.agency_tiktok_account_id,
        "account_name": client.tiktok_account_name or "",
        "currency": "USD",
        "timezone": "",
        "status": "ACTIVE",
    }
    campaigns = _fetch_tiktok_campaigns(
        agency.tiktok_agency_access_token, client.agency_tiktok_account_id
    )
    log_audit(
        db,
        "tiktok_insights_fetch",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"campaigns_count": len(campaigns)},
    )
    return {
        "connected": True,
        "tiktok_account_status": client.tiktok_account_status,
        "ad_accounts": [account],
        "campaigns": campaigns,
        "token_valid": True,
        "token_expires_at": agency.tiktok_token_expires_at.isoformat()
        if agency.tiktok_token_expires_at
        else None,
    }

