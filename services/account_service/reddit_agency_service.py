"""
Reddit Agency Service for Agency Portal.

Flow mirrors Meta BM behavior:
- Agency-level OAuth token storage
- Agency ad account listing
- Client account linking (auto/manual)
- Client campaign insights fetching
"""

import base64
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from packages.db.models import Agency, AuditLog, Client

logger = logging.getLogger(__name__)

REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
REDDIT_ADS_BASE = os.getenv("REDDIT_ADS_API_BASE_URL", "https://ads-api.reddit.com").rstrip("/")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "KaivoAds/1.0 (https://getkaivo.com)")


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


def _oauth_redirect_uri(redirect_uri: Optional[str] = None) -> str:
    if redirect_uri:
        return redirect_uri
    frontend_url = os.getenv(
        "FRONTEND_URL",
        os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    ).rstrip("/")
    return f"{frontend_url}/integrations/reddit/oauth/callback"


def _auth_basic(client_id: str, client_secret: str) -> str:
    token = f"{client_id}:{client_secret}".encode("utf-8")
    return base64.b64encode(token).decode("utf-8")


def exchange_code_for_token(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise ValueError("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set")

    final_redirect = _oauth_redirect_uri(redirect_uri)
    headers = {
        "Authorization": f"Basic {_auth_basic(client_id, client_secret)}",
        "User-Agent": REDDIT_USER_AGENT,
    }
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": final_redirect,
    }
    with httpx.Client(timeout=30.0, headers=headers) as client:
        resp = client.post(REDDIT_TOKEN_URL, data=data)
        if resp.status_code != 200:
            raise ValueError(f"OAuth token exchange failed: {resp.text}")
        payload = resp.json()

    access_token = payload.get("access_token")
    if not access_token:
        raise ValueError("No access_token in Reddit OAuth response")

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
        "User-Agent": REDDIT_USER_AGENT,
        "Content-Type": "application/json",
    }


def _extract_profile_id(me_data: Any) -> Optional[str]:
    """Handle multiple /me response shapes from Reddit Ads API."""
    if not isinstance(me_data, dict):
        return None
    direct = me_data.get("id") or me_data.get("profile_id")
    if direct:
        return str(direct)

    data = me_data.get("data")
    if isinstance(data, dict):
        nested = data.get("id") or data.get("profile_id")
        if nested:
            return str(nested)

    profile = me_data.get("profile")
    if isinstance(profile, dict):
        pid = profile.get("id") or profile.get("profile_id")
        if pid:
            return str(pid)

    user = me_data.get("user")
    if isinstance(user, dict):
        uid = user.get("id") or user.get("profile_id")
        if uid:
            return str(uid)

    return None


def _extract_businesses(payload: Any) -> List[Dict[str, Any]]:
    """Normalize businesses list from different Reddit API payload shapes."""
    if not isinstance(payload, dict):
        return []

    candidates = []
    if isinstance(payload.get("businesses"), list):
        candidates = payload.get("businesses", [])
    elif isinstance(payload.get("data"), dict) and isinstance(payload["data"].get("businesses"), list):
        candidates = payload["data"].get("businesses", [])

    out: List[Dict[str, Any]] = []
    for b in candidates:
        if isinstance(b, dict):
            bid = b.get("id") or b.get("business_id")
            if bid:
                out.append({"id": str(bid)})
        elif isinstance(b, str):
            out.append({"id": b})

    if out:
        return out

    single = (
        payload.get("business_id")
        or (payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}).get("business_id")
    )
    if single:
        return [{"id": str(single)}]
    return []


def fetch_reddit_ad_accounts(access_token: str) -> List[Dict[str, Any]]:
    accounts: List[Dict[str, Any]] = []
    headers = _ads_headers(access_token)
    with httpx.Client(timeout=30.0, headers=headers) as client:
        me_resp = client.get(f"{REDDIT_ADS_BASE}/api/v3/me")
        if me_resp.status_code != 200:
            raise ValueError(f"Reddit /me failed: {me_resp.text}")
        me_data = me_resp.json()
        profile_id = _extract_profile_id(me_data)
        if not profile_id:
            logger.warning("Could not determine Reddit profile ID from /me payload: %s", me_data)
            profile_id = None

        profile_data: Dict[str, Any] = {}
        if profile_id:
            profile_resp = client.get(f"{REDDIT_ADS_BASE}/api/v3/profiles/{profile_id}")
            if profile_resp.status_code == 200:
                profile_data = profile_resp.json()
            else:
                logger.warning("Reddit profile fetch failed for %s: %s", profile_id, profile_resp.text)

        businesses = _extract_businesses(profile_data) or _extract_businesses(me_data)

        for biz in businesses:
            biz_id = biz if isinstance(biz, str) else biz.get("id")
            if not biz_id:
                continue
            acct_resp = client.get(f"{REDDIT_ADS_BASE}/api/v3/businesses/{biz_id}/ad_accounts")
            if acct_resp.status_code != 200:
                logger.warning("Reddit ad_accounts failed for business %s: %s", biz_id, acct_resp.status_code)
                continue

            acct_data = acct_resp.json()
            rows = acct_data if isinstance(acct_data, list) else acct_data.get("data", acct_data.get("ad_accounts", []))
            if not isinstance(rows, list):
                rows = []

            for row in rows:
                acct_id = str(row.get("id", row.get("ad_account_id", "")))
                if not acct_id:
                    continue
                accounts.append({
                    "account_id": acct_id,
                    "account_name": row.get("name", f"Reddit Account {acct_id}"),
                    "currency": row.get("currency", "USD"),
                    "status": str(row.get("status", "active")).upper(),
                    "spend": 0.0,
                })

    # Deduplicate by account_id
    unique: Dict[str, Dict[str, Any]] = {}
    for a in accounts:
        unique[a["account_id"]] = a
    return list(unique.values())


def connect_reddit_agency(
    db: Session, agency_id: int, code: str, user_id: Optional[int] = None, redirect_uri: Optional[str] = None
) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    token_data = exchange_code_for_token(code, redirect_uri=redirect_uri)
    agency.reddit_agency_access_token = token_data["access_token"]
    agency.reddit_refresh_token = token_data.get("refresh_token")
    agency.reddit_token_expires_at = token_data["expires_at"]
    agency.reddit_connected_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "reddit_connected",
        agency_id=agency_id,
        user_id=user_id,
        details={"has_refresh_token": bool(token_data.get("refresh_token"))},
    )
    return {"connected": True}


def disconnect_reddit_agency(db: Session, agency_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    agency.reddit_agency_access_token = None
    agency.reddit_refresh_token = None
    agency.reddit_token_expires_at = None
    agency.reddit_connected_at = None

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    for client in clients:
        client.agency_reddit_account_id = None
        client.reddit_account_name = None
        client.reddit_linked_at = None
        client.reddit_account_status = "agency_not_connected"

    db.commit()
    log_audit(db, "reddit_disconnected", agency_id=agency_id, user_id=user_id)
    return {"disconnected": True}


def get_reddit_status(db: Session, agency_id: int) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    connected = bool(agency.reddit_agency_access_token)
    token_valid = connected
    if connected and agency.reddit_token_expires_at:
        token_valid = agency.reddit_token_expires_at.replace(tzinfo=None) > datetime.utcnow()

    return {
        "connected": connected,
        "connected_at": agency.reddit_connected_at.isoformat() if agency.reddit_connected_at else None,
        "token_valid": token_valid,
        "token_expires_at": agency.reddit_token_expires_at.isoformat() if agency.reddit_token_expires_at else None,
        "token_warning": bool(
            agency.reddit_token_expires_at
            and (agency.reddit_token_expires_at.replace(tzinfo=None) - datetime.utcnow()).days <= 7
        ) if connected else False,
    }


def get_reddit_agency_accounts(db: Session, agency_id: int) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")
    if not agency.reddit_agency_access_token:
        return {"connected": False, "accounts": [], "reason": "agency_not_connected"}

    accounts = fetch_reddit_ad_accounts(agency.reddit_agency_access_token)
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    linked = {c.agency_reddit_account_id: c.id for c in clients if c.agency_reddit_account_id}
    for acc in accounts:
        acc["linked_client_id"] = linked.get(acc["account_id"])
    return {"connected": True, "accounts": accounts}


def auto_link_reddit_clients(db: Session, agency_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency or not agency.reddit_agency_access_token:
        raise ValueError("Agency not connected to Reddit")

    accounts = fetch_reddit_ad_accounts(agency.reddit_agency_access_token)
    account_map = {a["account_id"]: a for a in accounts}

    from packages.db.models import PlatformAccount

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    matched = 0
    not_linked = 0
    for client in clients:
        pa = db.query(PlatformAccount).filter(
            PlatformAccount.client_id == client.id,
            PlatformAccount.platform == "reddit",
        ).first()
        if pa and pa.account_id in account_map:
            row = account_map[pa.account_id]
            client.agency_reddit_account_id = pa.account_id
            client.reddit_account_name = row.get("account_name")
            client.reddit_account_status = "linked_kaivo_matched"
            client.reddit_linked_at = datetime.utcnow()
            matched += 1
            log_audit(db, "reddit_auto_link", agency_id=agency_id, client_id=client.id, user_id=user_id, details={"result": "matched"})
        else:
            if client.reddit_account_status != "linked_manual":
                client.reddit_account_status = "not_linked"
            not_linked += 1
            log_audit(db, "reddit_auto_link", agency_id=agency_id, client_id=client.id, user_id=user_id, details={"result": "not_matched"})
    db.commit()
    return {"matched": matched, "not_linked": not_linked, "total": len(clients)}


def manual_link_reddit_client(
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
    if agency and agency.reddit_agency_access_token:
        try:
            for row in fetch_reddit_ad_accounts(agency.reddit_agency_access_token):
                if row["account_id"] == ad_account_id:
                    account_name = row.get("account_name", "")
                    break
        except Exception:
            account_name = ""

    client.agency_reddit_account_id = ad_account_id
    client.reddit_account_name = account_name
    client.reddit_account_status = "linked_manual"
    client.reddit_linked_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        "reddit_manual_link",
        agency_id=agency_id,
        client_id=client_id,
        user_id=user_id,
        details={"ad_account_id": ad_account_id, "account_name": account_name},
    )
    return {"linked": True, "client_id": client_id, "ad_account_id": ad_account_id, "reddit_account_name": account_name}


def _fetch_reddit_campaigns(access_token: str, ad_account_id: str) -> List[Dict[str, Any]]:
    headers = _ads_headers(access_token)
    with httpx.Client(timeout=30.0, headers=headers) as client:
        resp = client.get(f"{REDDIT_ADS_BASE}/api/v3/ad_accounts/{ad_account_id}/campaigns")
        if resp.status_code != 200:
            logger.warning("Reddit campaigns fetch failed for %s: %s", ad_account_id, resp.text)
            return []
        payload = resp.json()
    rows = payload if isinstance(payload, list) else payload.get("data", payload.get("campaigns", []))
    if not isinstance(rows, list):
        rows = []
    campaigns: List[Dict[str, Any]] = []
    for row in rows:
        cid = str(row.get("id", row.get("campaign_id", "")))
        if not cid:
            continue
        campaigns.append({
            "campaign_id": cid,
            "name": row.get("name", f"Campaign {cid}"),
            "objective": row.get("objective", ""),
            "status": str(row.get("status", "UNKNOWN")).upper(),
            "budget_type": "daily",
            "budget": float(row.get("daily_budget", 0) or 0),
            "currency": row.get("currency", "USD"),
            "start_date": row.get("start_time") or row.get("created_at") or "",
            "end_date": row.get("end_time"),
            "ad_account_id": ad_account_id,
            "impressions": int(row.get("impressions", 0) or 0),
            "clicks": int(row.get("clicks", 0) or 0),
            "spend": float(row.get("spend", 0) or 0),
            "reach": int(row.get("reach", 0) or 0),
        })
    return campaigns


def fetch_client_reddit_insights(
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
    if not agency.reddit_agency_access_token:
        return {
            "connected": False,
            "reason": "agency_not_connected",
            "reddit_account_status": "agency_not_connected",
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": None,
        }
    if client.reddit_account_status in ("agency_not_connected", "not_linked") or not client.agency_reddit_account_id:
        return {
            "connected": False,
            "reason": "not_linked",
            "reddit_account_status": client.reddit_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": True,
            "token_expires_at": agency.reddit_token_expires_at.isoformat() if agency.reddit_token_expires_at else None,
        }

    token_valid = True
    if agency.reddit_token_expires_at:
        token_valid = agency.reddit_token_expires_at.replace(tzinfo=None) > datetime.utcnow()
    if not token_valid:
        return {
            "connected": False,
            "reason": "token_expired",
            "reddit_account_status": client.reddit_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "token_valid": False,
            "token_expires_at": agency.reddit_token_expires_at.isoformat() if agency.reddit_token_expires_at else None,
        }

    account = {
        "account_id": client.agency_reddit_account_id,
        "account_name": client.reddit_account_name or "",
        "currency": "USD",
        "timezone": "",
        "status": "ACTIVE",
    }
    campaigns = _fetch_reddit_campaigns(agency.reddit_agency_access_token, client.agency_reddit_account_id)
    log_audit(db, "reddit_insights_fetch", agency_id=agency_id, client_id=client_id, user_id=user_id, details={"campaigns_count": len(campaigns)})
    return {
        "connected": True,
        "reddit_account_status": client.reddit_account_status,
        "ad_accounts": [account],
        "campaigns": campaigns,
        "token_valid": True,
        "token_expires_at": agency.reddit_token_expires_at.isoformat() if agency.reddit_token_expires_at else None,
    }
