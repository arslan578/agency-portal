"""
Meta Business Manager Service for Agency Portal.

Handles all Meta BM operations:
- OAuth token exchange (code → long-lived token)
- BM identification (fetch BM ID + name)
- Client ad account listing under BM
- Auto-link clients to ad accounts
- Insights fetching (campaigns, ad sets)
- Audit logging for all Meta operations

Token rule: Agency Portal uses ONLY the agency's BM token (agencies.meta_agency_access_token).
Never uses or references the client's Kaivo token.
"""

import os
import logging
import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from functools import lru_cache
import time

from packages.db.models import Agency, Client, AuditLog

logger = logging.getLogger(__name__)

META_GRAPH_API_VERSION = "v21.0"
META_GRAPH_BASE = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}"

# Simple in-memory cache for ad_accounts and ad_sets (15 minute TTL)
_cache: Dict[str, tuple] = {}  # key -> (data, expiry_timestamp)
CACHE_TTL_SECONDS = 15 * 60  # 15 minutes


def _cache_get(key: str) -> Optional[Any]:
    """Get from cache if not expired."""
    if key in _cache:
        data, expiry = _cache[key]
        if time.time() < expiry:
            return data
        del _cache[key]
    return None


def _cache_set(key: str, data: Any) -> None:
    """Set cache with TTL."""
    _cache[key] = (data, time.time() + CACHE_TTL_SECONDS)


def _cache_invalidate(prefix: str) -> None:
    """Invalidate all cache keys starting with prefix."""
    keys_to_del = [k for k in _cache if k.startswith(prefix)]
    for k in keys_to_del:
        del _cache[k]


def log_audit(
    db: Session,
    action: str,
    agency_id: Optional[int] = None,
    client_id: Optional[int] = None,
    user_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Write to audit_logs table."""
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
    except Exception as e:
        logger.error(f"Audit log write failed: {e}")
        db.rollback()


def exchange_code_for_token(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    """
    Exchange OAuth authorization code for a short-lived token,
    then exchange that for a long-lived token (60 days).
    """
    app_id = os.getenv("META_APP_ID")
    app_secret = os.getenv("META_APP_SECRET")
    
    # Use provided redirect_uri or fallback to env var
    final_redirect_uri = redirect_uri or os.getenv("META_REDIRECT_URI", "")

    if not app_id or not app_secret:
        raise ValueError("META_APP_ID and META_APP_SECRET must be set")

    # Step 1: Exchange code for short-lived token
    url = f"{META_GRAPH_BASE}/oauth/access_token"
    params = {
        "client_id": app_id,
        "client_secret": app_secret,
        "redirect_uri": final_redirect_uri,
        "code": code,
    }

    with httpx.Client(timeout=15.0) as client:
        resp = client.get(url, params=params)
        if resp.status_code != 200:
            error_data = resp.json() if resp.content else {}
            error_msg = error_data.get("error", {}).get("message", resp.text)
            raise ValueError(f"OAuth token exchange failed: {error_msg}")
        token_data = resp.json()

    short_token = token_data.get("access_token")
    if not short_token:
        raise ValueError("No access_token in OAuth response")

    # Step 2: Exchange short-lived token for long-lived token
    ll_url = f"{META_GRAPH_BASE}/oauth/access_token"
    ll_params = {
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": short_token,
    }

    with httpx.Client(timeout=15.0) as client:
        resp = client.get(ll_url, params=ll_params)
        if resp.status_code != 200:
            error_data = resp.json() if resp.content else {}
            error_msg = error_data.get("error", {}).get("message", resp.text)
            raise ValueError(f"Long-lived token exchange failed: {error_msg}")
        ll_data = resp.json()

    long_token = ll_data.get("access_token")
    expires_in = ll_data.get("expires_in", 5184000)  # default 60 days

    return {
        "access_token": long_token,
        "expires_in": expires_in,
        "expires_at": datetime.utcnow() + timedelta(seconds=expires_in),
    }


def fetch_business_manager_info(access_token: str) -> Dict[str, Any]:
    """
    Fetch the Business Manager(s) associated with this token.
    Uses /me/businesses endpoint.
    """
    url = f"{META_GRAPH_BASE}/me/businesses"
    params = {
        "access_token": access_token,
        "fields": "id,name,created_time",
        "limit": 10,
    }

    with httpx.Client(timeout=15.0) as client:
        resp = client.get(url, params=params)
        if resp.status_code != 200:
            error_data = resp.json() if resp.content else {}
            error_msg = error_data.get("error", {}).get("message", resp.text)
            raise ValueError(f"Failed to fetch business info: {error_msg}")
        data = resp.json()

    businesses = data.get("data", [])
    if not businesses:
        raise ValueError("No Business Manager found for this token. Ensure the token has business_management scope.")

    # Return the first BM (primary)
    bm = businesses[0]
    return {
        "business_manager_id": bm["id"],
        "business_manager_name": bm.get("name", "Unknown"),
    }


_ACCOUNT_STATUS_MAP = {
    1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED",
    7: "PENDING_RISK_REVIEW", 9: "IN_GRACE_PERIOD",
    100: "PENDING_CLOSURE", 101: "CLOSED",
    201: "ANY_ACTIVE", 202: "ANY_CLOSED",
}


def _fetch_bm_accounts_edge(
    business_manager_id: str, access_token: str, edge: str
) -> List[Dict[str, Any]]:
    """
    Fetch ad accounts from a single BM edge with pagination.
    `edge` is either "owned_ad_accounts" or "client_ad_accounts".
    """
    accounts: List[Dict[str, Any]] = []
    url = f"{META_GRAPH_BASE}/{business_manager_id}/{edge}"
    params = {
        "access_token": access_token,
        "fields": "id,name,account_id,account_status,currency,timezone_name,amount_spent",
        "limit": 100,
    }

    with httpx.Client(timeout=30.0) as client:
        while url:
            resp = client.get(url, params=params)
            if resp.status_code != 200:
                error_data = resp.json() if resp.content else {}
                error_msg = error_data.get("error", {}).get("message", resp.text)
                logger.error(f"BM {edge} fetch failed: {error_msg}")
                break

            data = resp.json()

            for acc in data.get("data", []):
                raw_status = acc.get("account_status", 0)
                accounts.append({
                    "account_id": acc.get("id", ""),
                    "account_name": acc.get("name", "Unnamed"),
                    "currency": acc.get("currency", "USD"),
                    "timezone": acc.get("timezone_name", ""),
                    "status": _ACCOUNT_STATUS_MAP.get(raw_status, f"UNKNOWN_{raw_status}"),
                    "spend": float(acc.get("amount_spent", 0)) / 100,
                })

            next_url = data.get("paging", {}).get("next")
            if next_url:
                url = next_url
                params = {}
            else:
                break

    return accounts


def fetch_bm_client_ad_accounts(
    business_manager_id: str, access_token: str
) -> List[Dict[str, Any]]:
    """
    Fetch ALL ad accounts under a Business Manager — both owned and
    client (shared) accounts.  Owned accounts take priority when
    the same account_id appears on both edges.
    """
    cache_key = f"bm_accounts:{business_manager_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    seen: Dict[str, Dict[str, Any]] = {}

    # 1) Owned accounts first (higher priority)
    for acc in _fetch_bm_accounts_edge(business_manager_id, access_token, "owned_ad_accounts"):
        acc["source"] = "owned"
        seen[acc["account_id"]] = acc

    # 2) Client (shared) accounts — only add if not already seen
    for acc in _fetch_bm_accounts_edge(business_manager_id, access_token, "client_ad_accounts"):
        if acc["account_id"] not in seen:
            acc["source"] = "client"
            seen[acc["account_id"]] = acc

    all_accounts = list(seen.values())
    _cache_set(cache_key, all_accounts)
    return all_accounts


def connect_business_manager(
    db: Session, agency_id: int, code: str, user_id: Optional[int] = None, redirect_uri: Optional[str] = None
) -> Dict[str, Any]:
    """
    Full BM connect flow:
    1. Exchange OAuth code for long-lived token
    2. Fetch BM info
    3. Store credentials on agency
    4. Log audit
    """
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    # Exchange code for token
    token_result = exchange_code_for_token(code, redirect_uri=redirect_uri)
    access_token = token_result["access_token"]
    expires_at = token_result["expires_at"]

    # Fetch BM info
    bm_info = fetch_business_manager_info(access_token)

    # Store on agency
    agency.meta_agency_access_token = access_token
    agency.meta_token_expires_at = expires_at
    agency.meta_business_manager_id = bm_info["business_manager_id"]
    agency.meta_business_manager_name = bm_info["business_manager_name"]
    agency.meta_connected_at = datetime.utcnow()
    db.commit()

    # Log audit
    log_audit(db, "meta_bm_connected", agency_id=agency_id, user_id=user_id, details={
        "business_manager_id": bm_info["business_manager_id"],
        "business_manager_name": bm_info["business_manager_name"],
    })

    # Invalidate cache
    _cache_invalidate(f"bm_accounts:{bm_info['business_manager_id']}")

    return {
        "connected": True,
        "business_manager_name": bm_info["business_manager_name"],
        "business_manager_id": bm_info["business_manager_id"],
    }


def disconnect_business_manager(
    db: Session, agency_id: int, user_id: Optional[int] = None
) -> Dict[str, Any]:
    """Disconnect BM and reset all client linkages."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    old_bm_id = agency.meta_business_manager_id

    # Clear agency BM fields
    agency.meta_agency_access_token = None
    agency.meta_token_expires_at = None
    agency.meta_business_manager_id = None
    agency.meta_business_manager_name = None
    agency.meta_connected_at = None

    # Reset all client meta statuses
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    for c in clients:
        c.meta_account_status = "agency_not_connected"
        c.agency_meta_account_id = None
        c.meta_account_name = None
        c.meta_linked_at = None

    db.commit()

    log_audit(db, "meta_bm_disconnected", agency_id=agency_id, user_id=user_id, details={
        "previous_bm_id": old_bm_id,
    })

    if old_bm_id:
        _cache_invalidate(f"bm_accounts:{old_bm_id}")

    return {"disconnected": True}


def auto_link_clients(
    db: Session, agency_id: int, user_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    For each client in the agency, try to match their Kaivo platform account
    against the BM's client_ad_accounts.
    """
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency or not agency.meta_business_manager_id or not agency.meta_agency_access_token:
        raise ValueError("Agency not connected to Meta BM")

    # Fetch BM ad accounts
    bm_accounts = fetch_bm_client_ad_accounts(
        agency.meta_business_manager_id, agency.meta_agency_access_token
    )
    bm_account_ids = {acc["account_id"] for acc in bm_accounts}
    bm_account_map = {acc["account_id"]: acc for acc in bm_accounts}

    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    matched = 0
    not_linked = 0
    total = len(clients)

    for client in clients:
        # Try to find a matching platform account from Kaivo
        from packages.db.models import PlatformAccount
        platform_account = db.query(PlatformAccount).filter(
            PlatformAccount.client_id == client.id,
            PlatformAccount.platform == "meta",
        ).first()

        found = False
        if platform_account:
            kaivo_account_id = platform_account.account_id
            # Normalize: Meta returns "act_XXXXX" format
            if not kaivo_account_id.startswith("act_"):
                kaivo_account_id_check = f"act_{kaivo_account_id}"
            else:
                kaivo_account_id_check = kaivo_account_id

            if kaivo_account_id_check in bm_account_ids:
                bm_acc = bm_account_map[kaivo_account_id_check]
                client.agency_meta_account_id = kaivo_account_id_check
                client.meta_account_status = "linked_kaivo_matched"
                client.meta_account_name = bm_acc.get("account_name", "")
                client.meta_linked_at = datetime.utcnow()
                matched += 1
                found = True
                log_audit(db, "meta_auto_link", agency_id=agency_id, client_id=client.id,
                         user_id=user_id, details={
                    "result": "matched",
                    "account_id": kaivo_account_id_check,
                    "account_name": bm_acc.get("account_name", ""),
                })

        if not found:
            if client.meta_account_status not in ("linked_manual",):
                client.meta_account_status = "not_linked"
                not_linked += 1
                log_audit(db, "meta_auto_link", agency_id=agency_id, client_id=client.id,
                         user_id=user_id, details={"result": "not_matched"})

    db.commit()

    return {
        "matched": matched,
        "not_linked": not_linked,
        "total": total,
    }


def manual_link_client(
    db: Session,
    client_id: int,
    ad_account_id: str,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Manually assign a BM ad account to a client."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")

    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    # Normalize account ID
    if not ad_account_id.startswith("act_"):
        ad_account_id = f"act_{ad_account_id}"

    # Look up account name from BM
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    account_name = ""
    if agency and agency.meta_business_manager_id and agency.meta_agency_access_token:
        bm_accounts = fetch_bm_client_ad_accounts(
            agency.meta_business_manager_id, agency.meta_agency_access_token
        )
        for acc in bm_accounts:
            if acc["account_id"] == ad_account_id:
                account_name = acc.get("account_name", "")
                break

    client.agency_meta_account_id = ad_account_id
    client.meta_account_status = "linked_manual"
    client.meta_account_name = account_name
    client.meta_linked_at = datetime.utcnow()
    db.commit()

    log_audit(db, "meta_manual_link", agency_id=agency_id, client_id=client_id,
             user_id=user_id, details={
        "ad_account_id": ad_account_id,
        "account_name": account_name,
    })

    return {
        "linked": True,
        "client_id": client_id,
        "ad_account_id": ad_account_id,
        "meta_account_name": account_name,
    }


def check_token_validity(agency: Agency) -> Dict[str, Any]:
    """Check if agency's Meta token is valid and not expired."""
    if not agency.meta_agency_access_token:
        return {"valid": False, "reason": "no_token"}

    if agency.meta_token_expires_at:
        now = datetime.utcnow()
        if agency.meta_token_expires_at.replace(tzinfo=None) < now:
            return {"valid": False, "reason": "expired"}
        days_until_expiry = (agency.meta_token_expires_at.replace(tzinfo=None) - now).days
        return {
            "valid": True,
            "expires_at": agency.meta_token_expires_at.isoformat(),
            "days_until_expiry": days_until_expiry,
            "warning": days_until_expiry <= 7,
        }

    return {"valid": True, "expires_at": None, "days_until_expiry": None, "warning": False}


def fetch_client_meta_insights(
    db: Session,
    client_id: int,
    agency_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fetch Meta insights for a specific client using the agency's BM token.
    Returns campaigns (live), ad_accounts (cached 15m), ad_sets (cached 15m).
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise ValueError("Client not found")

    if client.agency_id != agency_id:
        raise PermissionError("Agency does not own this client")

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise ValueError("Agency not found")

    # Check connection states
    if not agency.meta_agency_access_token or not agency.meta_business_manager_id:
        log_audit(db, "meta_not_connected", agency_id=agency_id, client_id=client_id, user_id=user_id)
        return {
            "connected": False,
            "reason": "agency_not_connected",
            "meta_account_status": "agency_not_connected",
            "ad_accounts": [],
            "campaigns": [],
            "ad_sets": [],
            "token_valid": False,
            "token_expires_at": None,
        }

    if client.meta_account_status in ("agency_not_connected", "not_linked") or not client.agency_meta_account_id:
        return {
            "connected": False,
            "reason": "not_linked",
            "meta_account_status": client.meta_account_status,
            "ad_accounts": [],
            "campaigns": [],
            "ad_sets": [],
            "token_valid": True,
            "token_expires_at": agency.meta_token_expires_at.isoformat() if agency.meta_token_expires_at else None,
        }

    # Check token validity
    token_check = check_token_validity(agency)
    if not token_check["valid"]:
        log_audit(db, "meta_token_expired", agency_id=agency_id, client_id=client_id, user_id=user_id)
        return {
            "connected": False,
            "reason": "token_expired",
            "meta_account_status": client.meta_account_status,
            "business_manager_name": agency.meta_business_manager_name,
            "ad_accounts": [],
            "campaigns": [],
            "ad_sets": [],
            "token_valid": False,
            "token_expires_at": agency.meta_token_expires_at.isoformat() if agency.meta_token_expires_at else None,
        }

    access_token = agency.meta_agency_access_token
    act_id = client.agency_meta_account_id

    # Fetch ad accounts (cached)
    ad_accounts_data = []
    cache_key_accounts = f"ad_accounts:{act_id}"
    cached_accounts = _cache_get(cache_key_accounts)
    if cached_accounts:
        ad_accounts_data = cached_accounts
    else:
        try:
            ad_accounts_data = [{
                "account_id": act_id,
                "account_name": client.meta_account_name or "",
                "currency": "",
                "timezone": "",
                "status": "ACTIVE",
            }]
            # Try to enrich from BM accounts list
            if agency.meta_business_manager_id:
                bm_accounts = fetch_bm_client_ad_accounts(
                    agency.meta_business_manager_id, access_token
                )
                for acc in bm_accounts:
                    if acc["account_id"] == act_id:
                        ad_accounts_data = [acc]
                        break
            _cache_set(cache_key_accounts, ad_accounts_data)
        except Exception as e:
            logger.error(f"Failed to fetch ad accounts for {act_id}: {e}")

    # Fetch campaigns (ALWAYS live, never cached)
    campaigns_data = []
    try:
        campaigns_data = _fetch_campaigns_live(act_id, access_token)
    except Exception as e:
        logger.error(f"Failed to fetch campaigns for {act_id}: {e}")

    # Fetch ad sets (cached 15 min)
    ad_sets_data = []
    cache_key_adsets = f"ad_sets:{act_id}"
    cached_adsets = _cache_get(cache_key_adsets)
    if cached_adsets:
        ad_sets_data = cached_adsets
    else:
        try:
            ad_sets_data = _fetch_ad_sets(act_id, access_token)
            _cache_set(cache_key_adsets, ad_sets_data)
        except Exception as e:
            logger.error(f"Failed to fetch ad sets for {act_id}: {e}")

    # Log audit
    log_audit(db, "meta_insights_fetch", agency_id=agency_id, client_id=client_id,
             user_id=user_id, details={
        "account_id": act_id,
        "campaigns_count": len(campaigns_data),
        "ad_sets_count": len(ad_sets_data),
    })

    return {
        "connected": True,
        "meta_account_status": client.meta_account_status,
        "business_manager_name": agency.meta_business_manager_name,
        "ad_accounts": ad_accounts_data,
        "campaigns": campaigns_data,
        "ad_sets": ad_sets_data,
        "token_valid": token_check["valid"],
        "token_expires_at": token_check.get("expires_at"),
    }


def _fetch_campaigns_live(act_id: str, access_token: str) -> List[Dict[str, Any]]:
    """
    Fetch campaigns and their insights from Meta Graph API.
    Uses batch-style fetching (insights for all campaigns at once) for performance.
    """
    # 1. Fetch Campaign Metadata
    campaigns_url = f"{META_GRAPH_BASE}/{act_id}/campaigns"
    campaigns_params = {
        "access_token": access_token,
        "fields": "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
        "limit": 100,
    }

    raw_campaigns = []
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(campaigns_url, params=campaigns_params)
        if resp.status_code != 200:
            logger.error(f"Campaign fetch failed: {resp.text}")
            return []
        raw_campaigns = resp.json().get("data", [])

    if not raw_campaigns:
        return []

    # 2. Fetch Insights for All Campaigns (Batch approach via the Account edge)
    # This avoids N sequential HTTP calls.
    insights_url = f"{META_GRAPH_BASE}/{act_id}/insights"
    insights_params = {
        "access_token": access_token,
        "fields": "campaign_id,impressions,clicks,spend,reach",
        "level": "campaign",
        "date_preset": "last_30d",
        "limit": 500,
    }

    insights_map = {}
    try:
        with httpx.Client(timeout=30.0) as client:
            i_resp = client.get(insights_url, params=insights_params)
            if i_resp.status_code == 200:
                insights_data = i_resp.json().get("data", [])
                for entry in insights_data:
                    c_id = entry.get("campaign_id")
                    if c_id:
                        insights_map[c_id] = entry
    except Exception as e:
        logger.warning(f"Batch insights fetch failed: {e}")

    # 3. Merge Metadata and Insights
    campaigns = []
    for camp in raw_campaigns:
        campaign_id = camp.get("id", "")
        insights = insights_map.get(campaign_id, {})

        daily_budget = camp.get("daily_budget")
        lifetime_budget = camp.get("lifetime_budget")
        budget_type = "lifetime" if lifetime_budget else "daily"
        budget_value = float(lifetime_budget or daily_budget or 0) / 100

        campaigns.append({
            "campaign_id": campaign_id,
            "name": camp.get("name", "Unnamed"),
            "objective": camp.get("objective", ""),
            "status": camp.get("status", "UNKNOWN"),
            "budget_type": budget_type,
            "budget": budget_value,
            "currency": "USD",
            "start_date": camp.get("start_time", ""),
            "end_date": camp.get("stop_time"),
            "ad_account_id": act_id,
            "impressions": int(insights.get("impressions", 0)),
            "clicks": int(insights.get("clicks", 0)),
            "spend": float(insights.get("spend", 0)),
            "reach": int(insights.get("reach", 0)),
        })

    return campaigns


def _fetch_campaign_insights(campaign_id: str, access_token: str) -> Dict[str, Any]:
    """Fetch insights for a single campaign."""
    url = f"{META_GRAPH_BASE}/{campaign_id}/insights"
    params = {
        "access_token": access_token,
        "fields": "impressions,clicks,spend,reach",
        "date_preset": "last_30d",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                if data:
                    row = data[0]
                    return {
                        "impressions": int(row.get("impressions", 0)),
                        "clicks": int(row.get("clicks", 0)),
                        "spend": float(row.get("spend", 0)),
                        "reach": int(row.get("reach", 0)),
                    }
    except Exception as e:
        logger.warning(f"Insights fetch failed for campaign {campaign_id}: {e}")

    return {"impressions": 0, "clicks": 0, "spend": 0, "reach": 0}


def _fetch_ad_sets(act_id: str, access_token: str) -> List[Dict[str, Any]]:
    """Fetch ad sets for an ad account."""
    url = f"{META_GRAPH_BASE}/{act_id}/adsets"
    params = {
        "access_token": access_token,
        "fields": "id,campaign_id,name,status,daily_budget,targeting",
        "limit": 100,
    }

    ad_sets = []
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                for adset in resp.json().get("data", []):
                    targeting = adset.get("targeting", {})
                    targeting_parts = []
                    if targeting.get("geo_locations", {}).get("countries"):
                        targeting_parts.append(f"Countries: {', '.join(targeting['geo_locations']['countries'])}")
                    if targeting.get("age_min") or targeting.get("age_max"):
                        targeting_parts.append(f"Age: {targeting.get('age_min', '?')}-{targeting.get('age_max', '?')}")
                    if targeting.get("genders"):
                        gender_map = {1: "Male", 2: "Female"}
                        genders = [gender_map.get(g, str(g)) for g in targeting["genders"]]
                        targeting_parts.append(f"Gender: {', '.join(genders)}")
                    targeting_summary = " | ".join(targeting_parts) if targeting_parts else "Broad targeting"

                    ad_sets.append({
                        "adset_id": adset.get("id", ""),
                        "campaign_id": adset.get("campaign_id", ""),
                        "name": adset.get("name", "Unnamed"),
                        "status": adset.get("status", "UNKNOWN"),
                        "daily_budget": float(adset.get("daily_budget", 0)) / 100,
                        "targeting_summary": targeting_summary,
                    })
    except Exception as e:
        logger.error(f"Ad sets fetch failed for {act_id}: {e}")

    return ad_sets


def get_agencies_with_meta_connected(db: Session) -> List[Agency]:
    """Get all agencies that have Meta BM connected."""
    return db.query(Agency).filter(
        Agency.meta_agency_access_token.isnot(None),
        Agency.meta_business_manager_id.isnot(None),
    ).all()


def get_clients_with_linked_meta(db: Session, agency_id: int) -> List[Client]:
    """Get all clients in an agency with linked Meta accounts."""
    return db.query(Client).filter(
        Client.agency_id == agency_id,
        Client.agency_meta_account_id.isnot(None),
        Client.meta_account_status.in_(["linked_kaivo_matched", "linked_manual"]),
    ).all()
