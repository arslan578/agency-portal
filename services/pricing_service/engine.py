from decimal import Decimal
from typing import List, Dict, Any
from packages.db.models import PlanTier

KAIVO_CPM_MARKUP = Decimal("1.50")

def calculate_effective_cpm(base_cpm: Decimal, agency_markup_percent: Decimal = Decimal("1.00")) -> Dict[str, Decimal]:
    """
    Calculates the effective CPM breakdown.
    
    Args:
        base_cpm: The raw cost from the platform.
        agency_markup_percent: The agency's markup multiplier (e.g. 1.20 for 20%).
        
    Returns:
        Dict with 'base_cpm', 'kaivo_cpm', 'agency_cpm' (final price to client).
    """
    kaivo_cpm = base_cpm * KAIVO_CPM_MARKUP
    agency_cpm = kaivo_cpm * agency_markup_percent
    
    return {
        "base_cpm": base_cpm,
        "kaivo_cpm": kaivo_cpm,
        "agency_cpm": agency_cpm
    }

def get_plans() -> List[Dict[str, Any]]:
    """
    Returns the official Kaivo Pricing 2.0 tiers.
    """
    return [
        {
            "id": PlanTier.FREE.value,
            "name": "Free Forever",
            "price_monthly": 0,
            "min_spend": 0,
            "max_spend": 1000,
            "features": [
                "Basic routing",
                "Basic reporting",
                "Creative checks",
                "1 brand only",
                "English only",
                "Limited variants",
                "Revenue: CPM spread only"
            ],
            "excluded": [
                "No tracking integrations",
                "No budget optimizer",
                "No multilingual",
                "No custom rules"
            ],
            "cta": "Get Started"
        },
        {
            "id": PlanTier.STARTER.value,
            "name": "Starter",
            "price_monthly": 99,
            "min_spend": 1000,
            "max_spend": 5000,
            "features": [
                "$1,000–$5,000/month ad spend",
                "$99/month platform fee",
                "Kaivo-managed or user-owned accounts",
                "Creative scoring",
                "Multilingual",
                "Reporting dashboard",
                "Saved audiences",
                "Weekly summaries",
                "Revenue: Platform fee + CPM spread"
            ],
            "cta": "Start Trial"
        },
        {
            "id": PlanTier.GROWTH.value,
            "name": "Growth",
            "price_monthly": 199,
            "min_spend": 5000,
            "max_spend": 15000,
            "features": [
                "$5,000–$15,000/month ad spend",
                "$199/month platform fee",
                "Everything in Starter",
                "Budget optimizer",
                "Cross-platform rules",
                "Real-time routing",
                "Variant scoring",
                "Advanced reporting"
            ],
            "is_popular": True,
            "cta": "Start Trial"
        },
        {
            "id": PlanTier.SCALE.value,
            "name": "Scale",
            "price_monthly": 399,
            "min_spend": 15000,
            "max_spend": 50000,
            "features": [
                "$15,000–$50,000/month ad spend",
                "$399/month platform fee",
                "Everything in Growth",
                "Unlimited brands",
                "Unlimited variants",
                "Workspaces",
                "White-label reporting",
                "API access (restricted)"
            ],
            "cta": "Contact Sales"
        },
        {
            "id": PlanTier.ENTERPRISE.value,
            "name": "Enterprise",
            "price_monthly": "5% of spend",
            "min_spend": 50000,
            "max_spend": None,
            "features": [
                "$50,000+/month ad spend",
                "5% of total ad spend fee",
                "User-owned accounts only",
                "Everything in Scale",
                "Full Kaivo Intelligence",
                "Advanced permissions",
                "Enterprise routing",
                "Team access",
                "Priority support",
                "Audit logs",
                "Onboarding concierge"
            ],
            "cta": "Contact Sales"
        }
    ]
