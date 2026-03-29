"""
Build agency client hierarchy: Client → Platform → Campaign (+ empty ad_sets for MVP).

Metrics come from UsageRecord rows in the requested period (spend_agency, impressions, clicks).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from packages.db.models import Campaign, Client, PlatformAccount, UsageRecord


def normalize_platform_key(raw: Optional[str]) -> str:
    if not raw:
        return "unknown"
    k = str(raw).lower().strip().replace("-", "_").replace(" ", "_")
    if k in ("facebook", "fb"):
        return "meta"
    if k in ("google_ads", "googleads"):
        return "google"
    return k


PLATFORM_LABELS: Dict[str, str] = {
    "meta": "Meta",
    "tiktok": "TikTok",
    "google": "Google Ads",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
    "snapchat": "Snapchat",
    "pinterest": "Pinterest",
    "unknown": "Other",
}


def platform_display_name(key: str) -> str:
    return PLATFORM_LABELS.get(key, key.replace("_", " ").title())


def _period_start_end(period: str) -> Tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    end = now
    p = (period or "7d").lower().strip()
    if p == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif p == "mtd":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif p == "30d":
        start = now - timedelta(days=30)
    else:
        start = now - timedelta(days=7)
    return start, end


def _campaign_platform_keys(campaign: Campaign) -> Set[str]:
    keys: Set[str] = set()
    alloc = campaign.platform_allocations or {}
    ext = campaign.platform_campaign_ids or {}
    for k in list(alloc.keys()) + list(ext.keys()):
        keys.add(normalize_platform_key(str(k)))
    keys.discard("unknown")
    if not keys:
        keys.add("unknown")
    return keys


def _float_spend(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _rollup_usage(
    rows: List[UsageRecord],
) -> Tuple[Dict[int, Dict[str, float]], Dict[Tuple[int, str], Dict[str, float]]]:
    """Per campaign totals and per (campaign_id, platform_key) totals."""
    by_campaign: Dict[int, Dict[str, float]] = defaultdict(
        lambda: {"spend": 0.0, "impressions": 0.0, "clicks": 0.0}
    )
    by_cp: Dict[Tuple[int, str], Dict[str, float]] = defaultdict(
        lambda: {"spend": 0.0, "impressions": 0.0, "clicks": 0.0}
    )
    for ur in rows:
        cid = ur.campaign_id
        pk = normalize_platform_key(ur.platform)
        sp = _float_spend(ur.spend_agency)
        imp = float(ur.impressions or 0)
        clk = float(ur.clicks or 0)
        for bucket in (by_campaign[cid], by_cp[(cid, pk)]):
            bucket["spend"] += sp
            bucket["impressions"] += imp
            bucket["clicks"] += clk
    return by_campaign, by_cp


def _finalize_metrics(
    spend: float,
    impressions: int,
    clicks: int,
    budget: float,
    conversions: int = 0,
) -> Dict[str, Any]:
    ctr = (clicks / impressions * 100.0) if impressions > 0 else 0.0
    cpc = (spend / clicks) if clicks > 0 else 0.0
    cost_per_conv = (spend / conversions) if conversions > 0 else 0.0
    pacing = min(100.0, (spend / budget * 100.0)) if budget > 0 else 0.0
    over_budget = budget > 0 and spend > budget
    if over_budget:
        pacing = 100.0
    # Simple score from CTR + pacing (no ML)
    score = min(95.0, max(35.0, 45.0 + min(ctr, 5.0) * 6.0 + min(pacing, 100) * 0.15))
    alerts_count = 0
    severity = "ok"
    if over_budget or pacing >= 99 and spend > 0 and budget > 0 and spend > budget * 0.95:
        alerts_count = 1
        severity = "critical"
    elif budget > 0 and spend < budget * 0.3 and pacing < 35:
        alerts_count = 1
        severity = "advisory"
    return {
        "spend": round(spend, 2),
        "impressions": int(impressions),
        "clicks": int(clicks),
        "ctr": round(ctr, 2),
        "cpc": round(cpc, 2),
        "conversions": int(conversions),
        "cost_per_conversion": round(cost_per_conv, 2),
        "budget": round(budget, 2),
        "pacing": round(pacing, 1),
        "score": round(score, 1),
        "alerts": {"count": alerts_count, "severity": severity},
    }


def build_client_hierarchy(
    db: Session,
    agency_id: int,
    period: str = "7d",
    client_id: Optional[int] = None,
) -> Dict[str, Any]:
    start, end = _period_start_end(period)

    q = db.query(Client).filter(Client.agency_id == agency_id)
    if client_id is not None:
        q = q.filter(Client.id == client_id)
    clients: List[Client] = q.order_by(Client.id).all()

    client_ids = [c.id for c in clients]
    campaigns: List[Campaign] = (
        db.query(Campaign).filter(Campaign.client_id.in_(client_ids)).order_by(Campaign.id).all()
        if client_ids
        else []
    )
    campaign_by_client: Dict[int, List[Campaign]] = defaultdict(list)
    all_cids: List[int] = []
    for camp in campaigns:
        if camp.client_id:
            campaign_by_client[camp.client_id].append(camp)
            all_cids.append(camp.id)

    usage_rows: List[UsageRecord] = []
    if all_cids:
        usage_rows = (
            db.query(UsageRecord)
            .filter(
                UsageRecord.campaign_id.in_(all_cids),
                UsageRecord.date >= start,
                UsageRecord.date <= end,
            )
            .all()
        )

    by_campaign, by_cp = _rollup_usage(usage_rows)

    # Platform accounts per client
    accounts_by_client: Dict[int, List[PlatformAccount]] = defaultdict(list)
    if client_ids:
        for acc in (
            db.query(PlatformAccount)
            .filter(PlatformAccount.client_id.in_(client_ids))
            .all()
        ):
            accounts_by_client[acc.client_id].append(acc)

    out_clients: List[Dict[str, Any]] = []
    total_spend = total_imp = total_clk = total_budget = 0.0

    for cl in clients:
        cl_camps = campaign_by_client.get(cl.id, [])
        platform_keys: Set[str] = set()
        for acc in accounts_by_client.get(cl.id, []):
            platform_keys.add(normalize_platform_key(acc.platform))
        for camp in cl_camps:
            platform_keys |= _campaign_platform_keys(camp)

        ordered_platforms = sorted(
            platform_keys,
            key=lambda k: (0 if k == "meta" else 1 if k == "tiktok" else 2 if k == "google" else 3, k),
        )

        cl_spend = cl_imp = cl_clk = cl_budget = 0.0
        platform_nodes: List[Dict[str, Any]] = []

        for pk in ordered_platforms:
            p_acct_rows = [
                a
                for a in accounts_by_client.get(cl.id, [])
                if normalize_platform_key(a.platform) == pk
            ]
            p_accounts = [a.account_id for a in p_acct_rows]
            linked_accounts = [
                {"id": a.id, "external_id": a.account_id or ""} for a in p_acct_rows
            ]
            p_camps = [c for c in cl_camps if pk in _campaign_platform_keys(c)]
            p_spend = p_imp = p_clk = p_budget = 0.0
            camp_nodes: List[Dict[str, Any]] = []

            for camp in p_camps:
                b = float(camp.total_budget_cents or 0) / 100.0
                full = by_campaign.get(camp.id, {"spend": 0, "impressions": 0, "clicks": 0})
                slice_raw = by_cp.get((camp.id, pk), {"spend": 0, "impressions": 0, "clicks": 0})
                ckeys = _campaign_platform_keys(camp)
                if (
                    slice_raw["spend"] == 0
                    and slice_raw["impressions"] == 0
                    and full["spend"] > 0
                    and len(ckeys) == 1
                    and pk in ckeys
                ):
                    slice_raw = full

                m = _finalize_metrics(
                    slice_raw["spend"],
                    int(slice_raw["impressions"]),
                    int(slice_raw["clicks"]),
                    b,
                )
                camp_nodes.append(
                    {
                        "id": camp.id,
                        "name": camp.name or f"Campaign #{camp.id}",
                        "status": camp.status.value if camp.status else "draft",
                        "metrics": m,
                        "ad_sets": [],
                    }
                )
                p_spend += m["spend"]
                p_imp += m["impressions"]
                p_clk += m["clicks"]
                p_budget += m["budget"]

            p_metrics = _finalize_metrics(p_spend, int(p_imp), int(p_clk), p_budget)
            platform_nodes.append(
                {
                    "key": pk,
                    "display_name": platform_display_name(pk),
                    "account_ids": p_accounts,
                    "linked_accounts": linked_accounts,
                    "metrics": p_metrics,
                    "campaigns": camp_nodes,
                }
            )
            cl_spend += p_spend
            cl_imp += p_imp
            cl_clk += p_clk
            cl_budget += p_budget

        cl_budget_total = sum(float(c.total_budget_cents or 0) / 100.0 for c in cl_camps)
        cl_metrics = _finalize_metrics(cl_spend, int(cl_imp), int(cl_clk), cl_budget_total)

        out_clients.append(
            {
                "id": cl.id,
                "name": cl.name,
                "industry": cl.industry,
                "website": cl.website,
                "is_active": cl.is_active if cl.is_active is not None else True,
                "account_mode": getattr(cl, "account_mode", None) or "kaivo_managed",
                "platform_count": len(ordered_platforms),
                "metrics": cl_metrics,
                "platforms": platform_nodes,
            }
        )
        total_spend += cl_spend
        total_imp += cl_imp
        total_clk += cl_clk
        total_budget += cl_budget_total

    totals = _finalize_metrics(total_spend, int(total_imp), int(total_clk), total_budget)

    return {
        "period": period,
        "clients": out_clients,
        "totals": totals,
        "counts": {
            "clients": len(out_clients),
            "platforms": sum(len(c["platforms"]) for c in out_clients),
            "campaigns": sum(
                len(p["campaigns"]) for c in out_clients for p in c["platforms"]
            ),
            "ad_sets": 0,
        },
    }
