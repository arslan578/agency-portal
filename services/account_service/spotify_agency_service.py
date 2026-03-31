"""
Spotify Agency Service for Agency Portal.

Pattern mirrors Meta BM and Reddit agency services:
- Agency-level OAuth token storage on Agency model
- Agency ad account discovery via Spotify Ads API
- Client account linking (auto/manual) against Kaivo platform_accounts
- Client campaign insights fetching per linked ad account
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from packages.db.models import Agency, AuditLog, Client
from services.platform_service.connectors.spotify import (
    SpotifyAdsConnector,
    SPOTIFY_ADS_API_BASE,
)

logger = logging.getLogger(__name__)


def log_audit(
    db: Session,
    action: str,
    agency_id: Optional[int] = None,
    client_id: Optional[int] = None,
    user_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Write to audit_logs table (best-effort, non-fatal on failure)."""
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
    Build the exact redirect URI used for Spotify OAuth.
    Must match the URI configured in the Spotify developer app.
    """
    if redirect_uri:
        return redirect_uri
    frontend_url = os.getenv(
        "FRONTEND_URL",
        os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    ).rstrip("/")
    return f"{frontend_url}/integrations/spotify/oauth/callback"


def exchange_code_for_token(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    """
    Exchange OAuth authorization code for Spotify access/refresh tokens.
    Mirrors the flow in api_gateway/main.py but returns a simple dict.
    """
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise ValueError("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set")

    final_redirect = _oauth_redirect_uri(redirect_uri)
    token_url = "https://accounts.spotify.com/api/token"
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": final_redirect,
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(token_url, data=data, auth=(client_id, client_secret))
        if resp.status_code != 200:
            raise ValueError(f"Spotify OAuth token exchange failed: {resp.text}")
        payload = resp.json()

    access_token = payload.get("access_token")
    if not access_token:
        raise ValueError("No access_token in Spotify OAuth response")

    expires_in = int(payload.get("expires_in", 3600))
    return {
        "access_token": access_token,
        "refresh_token": payload.get("refresh_token"),
        "expires_in": expires_in,
        "expires_at": datetime.utcnow() + timedelta(seconds=expires_in),
    }


def _ads_headers(access_token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def connect_spotify_agency(
    db: Session,
    agency_id: int,
    code: str,
    user_id: Optional[int] = None,
    redirect_uri: Optional[str] = None,
) -> Dict[str, Any]:
    """Exchange OAuth code and store tokens on the agency."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    token_data = exchange_code_for_token(code, redirect_uri=redirect_uri)
    agency.spotify_agency_access_token = token_data["access_token"]
    agency.spotify_refresh_token = token_data.get("refresh_token")
    agency.spotify_token_expires_at = token_data["expires_at"]
    agency.spotify_connected_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "spotify_connected",
        agency_id=agency_id,
        user_id=user_id,
        details={"has_refresh_token": bool(token_data.get("refresh_token"))},
    )
    return {"connected": True}


def disconnect_spotify_agency(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Clear Spotify token from agency and reset all client mappings."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    agency.spotify_agency_access_token = None
    agency.spotify_refresh_token = None
    agency.spotify_token_expires_at = None
    agency.spotify_connected_at = None

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    for client in clients:
        client.agency_spotify_account_id = None
        client.spotify_account_name = None
        client.spotify_linked_at = None
        client.spotify_account_status = "agency_not_connected"

    db.commit()
    log_audit(db, "spotify_disconnected", agency_id=agency_id, user_id=user_id)
    return {"disconnected": True}


def get_spotify_status(db: Session, agency_id: int) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    connected = bool(agency.spotify_agency_access_token)
    token_valid = connected
    if connected and agency.spotify_token_expires_at:
        token_valid = agency.spotify_token_expires_at.replace(tzinfo=None) > datetime.utcnow()

    return {
        "connected": connected,
        "connected_at": agency.spotify_connected_at.isoformat() if agency.spotify_connected_at else None,
        "token_valid": token_valid,
        "token_expires_at": agency.spotify_token_expires_at.isoformat()
        if agency.spotify_token_expires_at
        else None,
        "token_warning": bool(
            agency.spotify_token_expires_at
            and (agency.spotify_token_expires_at.replace(tzinfo=None) - datetime.utcnow()).days <= 7
        )
        if connected
        else False,
    }


def get_spotify_agency_accounts(db: Session, agency_id: int) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")
    if not agency.spotify_agency_access_token:
        return {"connected": False, "accounts": [], "reason": "agency_not_connected"}

    connector = SpotifyAdsConnector(
        credentials={"access_token": agency.spotify_agency_access_token}
    )
    result = connector.fetch_ad_accounts()
    if not result.get("success"):
        logger.warning("Spotify ad account fetch failed: %s", result.get("error"))
        return {
            "connected": False,
            "accounts": [],
            "reason": result.get("error_code", "unknown_error"),
        }

    accounts = result.get("ad_accounts", [])
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    linked = {c.agency_spotify_account_id: c.id for c in clients if c.agency_spotify_account_id}
    for acc in accounts:
        acc["linked_client_id"] = linked.get(acc["account_id"])

    return {"connected": True, "accounts": accounts}


def auto_link_spotify_clients(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Auto-link clients to Spotify ad accounts using PlatformAccount records."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency or not agency.spotify_agency_access_token:
        raise ValueError("Agency not connected to Spotify")

    connector = SpotifyAdsConnector(
        credentials={"access_token": agency.spotify_agency_access_token}
    )
    result = connector.fetch_ad_accounts()
    if not result.get("success"):
        raise ValueError(result.get("error") or "Failed to fetch Spotify ad accounts")

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
                PlatformAccount.platform == "spotify",
            )
            .first()
        )
        if pa and pa.account_id in account_map:
            row = account_map[pa.account_id]
            client.agency_spotify_account_id = pa.account_id
            client.spotify_account_name = row.get("name") or row.get("account_name")
            client.spotify_account_status = "linked_kaivo_matched"
            client.spotify_linked_at = datetime.utcnow()
            matched += 1
            log_audit(
                db,
                "spotify_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "matched"},
            )
        else:
            if client.spotify_account_status != "linked_manual":
                client.spotify_account_status = "not_linked"
            not_linked += 1
            log_audit(
                db,
                "spotify_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "not_matched"},
            )

    db.commit()
    return {"matched": matched, "not_linked": not_linked, "total": len(clients)}


def manual_link_spotify_client(
    db: Session,
    client_id: int,
    ad_account_id: str,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")
    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    account_name = ""
    if agency and agency.spotify_agency_access_token:
        try:
            connector = SpotifyAdsConnector(
                credentials={"access_token": agency.spotify_agency_access_token}
            )
            result = connector.fetch_ad_accounts()
            if result.get("success"):
                for row in result.get("ad_accounts", []):
                    if row.get("account_id") == ad_account_id:
                        account_name = row.get("name") or row.get("account_name", "")
                        break
        except Exception:
            account_name = ""

    client.agency_spotify_account_id = ad_account_id
    client.spotify_account_name = account_name
    client.spotify_account_status = "linked_manual"
    client.spotify_linked_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "spotify_manual_link",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"ad_account_id": ad_account_id, "account_name": account_name},
    )
    return {
        "linked": True,
        "client_id": client_id,
        "ad_account_id": ad_account_id,
        "spotify_account_name": account_name,
    }


def _fetch_spotify_campaigns(access_token: str, ad_account_id: str) -> List[Dict[str, Any]]:
    """
    Fetch campaigns for a given Spotify ad account.
    Uses the Campaign Management API.
    """
    headers = _ads_headers(access_token)
    url = f"{SPOTIFY_ADS_API_BASE}/ad_accounts/{ad_account_id}/campaigns"
    with httpx.Client(timeout=30.0, headers=headers) as client:
        resp = client.get(url)
        if resp.status_code != 200:
            logger.warning("Spotify campaigns fetch failed for %s: %s", ad_account_id, resp.text)
            return []
        payload = resp.json()

    rows = payload if isinstance(payload, list) else payload.get("data", payload.get("campaigns", []))
    if not isinstance(rows, list):
        rows = []

    campaigns: List[Dict[str, Any]] = []
    for row in rows:
        cid = str(row.get("id") or row.get("campaign_id") or "")
        if not cid:
            continue
        campaigns.append(
            {
                "campaign_id": cid,
                "name": row.get("name", f"Campaign {cid}"),
                "objective": row.get("objective", row.get("delivery_goal_group", "")),
                "status": row.get("status", "UNKNOWN"),
                "budget_type": "daily",
                "budget": float(row.get("daily_budget_micro_amount", 0) or 0) / 1_000_000,
                "currency": row.get("currency", "USD"),
                "start_date": row.get("start_time") or row.get("created_at") or "",
                "end_date": row.get("end_time"),
                "ad_account_id": ad_account_id,
            }
        )
    return campaigns


def fetch_client_spotify_insights(
    db: Session,
    client_id: int,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fetch Spotify campaigns for a specific client using the agency's Spotify token.
    Mirrors reddit/meta insights shape for UI consumption.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")
    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    if not agency.spotify_agency_access_token:
        return {
            "connected": False,
            "reason": "agency_not_connected",
            "spotify_account_status": "agency_not_connected",
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": None,
        }

    if client.spotify_account_status in ("agency_not_connected", "not_linked") or not client.agency_spotify_account_id:
        return {
            "connected": False,
            "reason": "not_linked",
            "spotify_account_status": client.spotify_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": True,
            "token_expires_at": agency.spotify_token_expires_at.isoformat()
            if agency.spotify_token_expires_at
            else None,
        }

    token_valid = True
    if agency.spotify_token_expires_at:
        token_valid = agency.spotify_token_expires_at.replace(tzinfo=None) > datetime.utcnow()
    if not token_valid:
        return {
            "connected": False,
            "reason": "token_expired",
            "spotify_account_status": client.spotify_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": agency.spotify_token_expires_at.isoformat()
            if agency.spotify_token_expires_at
            else None,
        }

    account = {
        "account_id": client.agency_spotify_account_id,
        "account_name": client.spotify_account_name or "",
        "currency": "USD",
        "timezone": "",
        "status": "ACTIVE",
    }
    campaigns = _fetch_spotify_campaigns(
        agency.spotify_agency_access_token, client.agency_spotify_account_id
    )
    log_audit(
        db,
        "spotify_insights_fetch",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"campaigns_count": len(campaigns)},
    )
    return {
        "connected": True,
        "spotify_account_status": client.spotify_account_status,
        "ad_accounts": [account],
        "campaigns": campaigns,
        "token_valid": True,
        "token_expires_at": agency.spotify_token_expires_at.isoformat()
        if agency.spotify_token_expires_at
        else None,
    }

