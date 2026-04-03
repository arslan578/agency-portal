"""
Google Ads agency service for Agency Portal.

Mirrors Microsoft / TikTok: agency-level OAuth (refresh token), list accessible
customers, auto/manual client linking via PlatformAccount (platform=google_ads),
and campaign fetch for linked clients via GoogleAdsConnector.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from packages.db.models import Agency, AuditLog, Client
from services.platform_service.connector_base import PlatformStatus
from services.platform_service.connectors.google import GoogleAdsConnector

logger = logging.getLogger(__name__)


def _oauth_redirect_uri(redirect_uri: Optional[str] = None) -> str:
    if redirect_uri:
        return redirect_uri
    explicit = os.getenv("GOOGLE_ADS_REDIRECT_URI", "").strip()
    if explicit:
        return explicit
    frontend_url = os.getenv(
        "FRONTEND_URL",
        os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    ).rstrip("/")
    return f"{frontend_url}/integrations/google/oauth/callback"


def _norm_login_customer_id(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    s = str(val).replace("-", "").strip()
    return s if s.isdigit() and len(s) == 10 else None


def exchange_google_ads_code_for_tokens(
    code: str,
    redirect_uri: Optional[str] = None,
) -> Dict[str, Any]:
    client_id = os.getenv("GOOGLE_ADS_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_ADS_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise ValueError("GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET must be set")

    final_redirect = _oauth_redirect_uri(redirect_uri)
    payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": final_redirect,
        "grant_type": "authorization_code",
    }
    with httpx.Client(timeout=30.0) as http:
        resp = http.post("https://oauth2.googleapis.com/token", data=payload)
        body = resp.json() if resp.content else {}

    if resp.status_code != 200:
        msg = body.get("error_description") or body.get("error") or resp.text
        raise ValueError(f"Google OAuth token exchange failed: {msg}")

    refresh = body.get("refresh_token")
    if not refresh:
        raise ValueError(
            "No refresh_token from Google. Revoke app access at "
            "https://myaccount.google.com/permissions and connect again, or use prompt=consent."
        )
    return {"refresh_token": refresh, "access_token": body.get("access_token")}


def log_audit(
    db: Session,
    action: str,
    agency_id: Optional[int] = None,
    client_id: Optional[int] = None,
    user_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
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


def _agency_google_connector_creds(agency: Agency) -> Dict[str, Any]:
    login = _norm_login_customer_id(agency.google_ads_login_customer_id)
    if not login:
        login = _norm_login_customer_id(os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID"))
    return {
        "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", ""),
        "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET", ""),
        "refresh_token": agency.google_ads_refresh_token or "",
        "login_customer_id": login,
    }


def _ensure_agency_google_ads_login_customer_id(db: Session, agency: Agency) -> None:
    """Persist first accessible customer as MCC login when missing (SaaS-friendly default)."""
    if agency.google_ads_login_customer_id or not agency.google_ads_refresh_token:
        return
    if not os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip():
        return
    inferred = _infer_google_ads_login_customer_id(agency)
    if not inferred:
        return
    agency.google_ads_login_customer_id = inferred
    try:
        db.commit()
    except Exception as exc:
        logger.warning("Persist inferred google_ads_login_customer_id failed: %s", exc)
        db.rollback()


def _infer_google_ads_login_customer_id(agency: Agency) -> Optional[str]:
    """
    First ID from list_accessible_customers (usually the MCC). Used as login-customer-id
    for child/campaign queries when the user did not pass one at OAuth connect.
    """
    if not agency.google_ads_refresh_token:
        return None
    if not os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip():
        return None
    creds = {
        "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", ""),
        "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET", ""),
        "refresh_token": agency.google_ads_refresh_token or "",
        "login_customer_id": None,
    }
    try:
        connector = GoogleAdsConnector(credentials=creds)
        if connector.status != PlatformStatus.AVAILABLE:
            return None
        gac = connector._get_google_ads_client(require_customer_id=False)
        resp = gac.get_service("CustomerService").list_accessible_customers()
        for resource_name in resp.resource_names:
            parts = str(resource_name).split("/")
            if len(parts) < 2:
                continue
            cid = parts[-1].replace("-", "")
            if cid.isdigit() and len(cid) == 10:
                return cid
    except Exception as exc:
        logger.warning("Could not infer Google Ads login customer id: %s", exc)
    return None


def connect_google_ads_agency_oauth(
    db: Session,
    agency_id: int,
    code: str,
    user_id: Optional[int] = None,
    redirect_uri: Optional[str] = None,
    login_customer_id: Optional[str] = None,
) -> Dict[str, Any]:
    tokens = exchange_google_ads_code_for_tokens(code, redirect_uri=redirect_uri)
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    agency.google_ads_refresh_token = tokens["refresh_token"]
    agency.google_ads_connected_at = datetime.utcnow()
    if login_customer_id:
        norm = _norm_login_customer_id(login_customer_id)
        if norm:
            agency.google_ads_login_customer_id = norm
    elif not agency.google_ads_login_customer_id:
        inferred = _infer_google_ads_login_customer_id(agency)
        if inferred:
            agency.google_ads_login_customer_id = inferred

    db.commit()
    log_audit(
        db,
        "google_ads_connected",
        agency_id=agency_id,
        user_id=user_id,
        details={"has_refresh_token": True},
    )
    return {"connected": True}


def disconnect_google_ads_agency(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    agency.google_ads_refresh_token = None
    agency.google_ads_connected_at = None
    agency.google_ads_login_customer_id = None

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    for c in clients:
        c.agency_google_ads_customer_id = None
        c.google_ads_account_name = None
        c.google_ads_linked_at = None
        c.google_ads_account_status = "agency_not_connected"

    db.commit()
    log_audit(db, "google_ads_disconnected", agency_id=agency_id, user_id=user_id)
    return {"disconnected": True}


def get_google_ads_status(db: Session, agency_id: int) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    connected = bool(agency.google_ads_refresh_token)
    return {
        "connected": connected,
        "connected_at": agency.google_ads_connected_at.isoformat()
        if agency.google_ads_connected_at
        else None,
        "token_valid": connected,
        "developer_configured": bool(os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip()),
    }


def get_google_ads_agency_accounts(db: Session, agency_id: int) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")
    if not agency.google_ads_refresh_token:
        return {"connected": False, "accounts": [], "reason": "agency_not_connected"}

    if not os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip():
        return {
            "connected": False,
            "accounts": [],
            "reason": "missing_developer_token",
            "error": "GOOGLE_ADS_DEVELOPER_TOKEN is not set on the server",
        }

    _ensure_agency_google_ads_login_customer_id(db, agency)

    connector = GoogleAdsConnector(credentials=_agency_google_connector_creds(agency))
    result = connector.fetch_accessible_ad_accounts()
    if not result.get("success"):
        logger.warning("Google Ads ad account fetch failed: %s", result.get("error"))
        return {
            "connected": False,
            "accounts": [],
            "reason": result.get("error_code", "unknown_error"),
            "error": result.get("error"),
        }

    accounts = result.get("ad_accounts", [])
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    linked = {
        c.agency_google_ads_customer_id: str(c.id)
        for c in clients
        if c.agency_google_ads_customer_id
    }
    for acc in accounts:
        aid = acc.get("account_id")
        acc["linked_client_id"] = linked.get(aid) if aid else None

    return {"connected": True, "accounts": accounts}


def auto_link_google_ads_clients(
    db: Session,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency or not agency.google_ads_refresh_token:
        raise ValueError("Agency not connected to Google Ads")

    _ensure_agency_google_ads_login_customer_id(db, agency)

    connector = GoogleAdsConnector(credentials=_agency_google_connector_creds(agency))
    result = connector.fetch_accessible_ad_accounts()
    if not result.get("success"):
        raise ValueError(
            result.get("error") or "Failed to fetch Google Ads accessible customers"
        )

    accounts = result.get("ad_accounts", [])
    account_map = {a["account_id"]: a for a in accounts if a.get("account_id")}

    from packages.db.models import PlatformAccount

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    matched = 0
    not_linked = 0

    for client in clients:
        pa = (
            db.query(PlatformAccount)
            .filter(
                PlatformAccount.client_id == client.id,
                PlatformAccount.platform == "google_ads",
            )
            .first()
        )
        if pa and pa.account_id in account_map:
            row = account_map[pa.account_id]
            client.agency_google_ads_customer_id = pa.account_id
            client.google_ads_account_name = row.get("account_name") or row.get("name") or pa.account_id
            client.google_ads_account_status = "linked_kaivo_matched"
            client.google_ads_linked_at = datetime.utcnow()
            matched += 1
            log_audit(
                db,
                "google_ads_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "matched"},
            )
        else:
            if client.google_ads_account_status != "linked_manual":
                client.google_ads_account_status = "not_linked"
            not_linked += 1
            log_audit(
                db,
                "google_ads_auto_link",
                agency_id=agency_id,
                client_id=client.id,
                user_id=user_id,
                details={"result": "not_matched"},
            )

    db.commit()
    return {"matched": matched, "not_linked": not_linked, "total": len(clients)}


def manual_link_google_ads_client(
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

    norm_id = str(ad_account_id).replace("-", "").strip()
    if not norm_id.isdigit() or len(norm_id) != 10:
        raise ValueError("ad_account_id must be a 10-digit Google Ads customer ID")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    account_name = ""
    if agency and agency.google_ads_refresh_token:
        _ensure_agency_google_ads_login_customer_id(db, agency)
        try:
            connector = GoogleAdsConnector(credentials=_agency_google_connector_creds(agency))
            result = connector.fetch_accessible_ad_accounts()
            if result.get("success"):
                for row in result.get("ad_accounts", []):
                    if row.get("account_id") == norm_id:
                        account_name = row.get("account_name") or row.get("name") or norm_id
                        break
        except Exception:
            account_name = ""

    client.agency_google_ads_customer_id = norm_id
    client.google_ads_account_name = account_name or client.google_ads_account_name or ""
    client.google_ads_account_status = "linked_manual"
    client.google_ads_linked_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "google_ads_manual_link",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"ad_account_id": norm_id, "account_name": account_name},
    )
    return {
        "linked": True,
        "client_id": client_id,
        "ad_account_id": norm_id,
        "google_ads_account_name": account_name,
    }


def fetch_client_google_ads_insights(
    db: Session,
    client_id: int,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")
    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    if not agency.google_ads_refresh_token:
        return {
            "connected": False,
            "reason": "agency_not_connected",
            "google_ads_account_status": "agency_not_connected",
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": None,
        }

    if (
        client.google_ads_account_status in ("agency_not_connected", "not_linked")
        or not client.agency_google_ads_customer_id
    ):
        return {
            "connected": False,
            "reason": "not_linked",
            "google_ads_account_status": client.google_ads_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": True,
            "token_expires_at": None,
        }

    _ensure_agency_google_ads_login_customer_id(db, agency)

    connector = GoogleAdsConnector(credentials=_agency_google_connector_creds(agency))
    if connector.status != PlatformStatus.AVAILABLE:
        return {
            "connected": False,
            "reason": "connector_unavailable",
            "google_ads_account_status": client.google_ads_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": None,
        }

    cid = client.agency_google_ads_customer_id.replace("-", "").strip()
    cr = connector.fetch_campaigns_for_customer(cid)
    campaigns: List[Dict[str, Any]] = cr.get("campaigns", []) if cr.get("success") else []
    if not cr.get("success"):
        logger.warning("Google Ads campaigns fetch failed for %s: %s", cid, cr.get("error"))

    account = {
        "account_id": cid,
        "account_name": client.google_ads_account_name or "",
        "currency": "USD",
        "timezone": "",
        "status": "ACTIVE",
    }

    log_audit(
        db,
        "google_ads_insights_fetch",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"campaigns_count": len(campaigns)},
    )
    return {
        "connected": True,
        "google_ads_account_status": client.google_ads_account_status,
        "ad_accounts": [account],
        "campaigns": campaigns,
        "token_valid": True,
        "token_expires_at": None,
    }
