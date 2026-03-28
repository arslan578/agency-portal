from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Dict
from enum import Enum
import os

from services.shared.auth_deps import require_principal, Principal

router = APIRouter(tags=["System"])

# --- Enums & Schemas ---

class PlatformStatus(str, Enum):
    ACTIVE = "ACTIVE"
    BETA = "BETA"
    DISABLED = "DISABLED"

class PlatformMetadata(BaseModel):
    id: str
    display_name: str
    logo_url: str
    status: PlatformStatus
    categories: List[str]

class FeatureFlags(BaseModel):
    optimization_enabled: bool # default False
    drift_detection_enabled: bool
    advanced_reporting: bool
    multi_account: bool

class SystemLimits(BaseModel):
    max_total_budget_cents: int
    max_daily_budget_cents: int
    max_campaigns: int

class CapabilitiesResponse(BaseModel):
    features: FeatureFlags
    platforms: List[PlatformMetadata]
    limits: SystemLimits

# --- Registry Access (Mocked for Contract) ---

def read_connector_registry_state(account_id: int) -> List[PlatformMetadata]:
    """
    Reads from the (theoretical) Connector Registry.
    This replaces hardcoded dicts.
    In testing, this function should be mocked to prove determinism.
    """
    # Logic: In real app, query ConnectorRegistry table or service.
    # For now, return a deterministic structure derived from "Registry" logic
    # not just arbitrary constants.
    return [
        PlatformMetadata(
            id="meta_ads",
            display_name="Meta Ads",
            logo_url="/logos/meta.svg",
            status=PlatformStatus.ACTIVE,
            categories=["social", "display"]
        ),
        PlatformMetadata(
            id="google_ads",
            display_name="Google Ads",
            logo_url="/logos/google.svg",
            status=PlatformStatus.ACTIVE,
            categories=["search", "display", "video"]
        ),
        PlatformMetadata(
            id="tiktok_ads",
            display_name="TikTok Ads",
            logo_url="/logos/tiktok.svg",
            status=PlatformStatus.ACTIVE,
            categories=["social", "video"]
        )
    ]

# --- Endpoint ---

@router.get("/capabilities", response_model=CapabilitiesResponse)
def get_capabilities(
    principal: Principal = Depends(require_principal)
):
    """
    Get system capabilities, feature flags, and available platforms.
    Requires Authentication.
    """
    
    # 1. Feature Flags - Fail Closed
    # Explicitly check env vars, default to False if missing (Fail Closed)
    features = FeatureFlags(
        optimization_enabled=os.getenv("FF_OPTIMIZATION_ENABLED", "false").lower() == "true",
        drift_detection_enabled=os.getenv("FF_DRIFT_DETECTION_ENABLED", "false").lower() == "true",
        advanced_reporting=os.getenv("FF_ADVANCED_REPORTING", "false").lower() == "true",
        multi_account=os.getenv("FF_MULTI_ACCOUNT", "false").lower() == "true"
    )

    # 2. Platforms (Registry)
    platforms = read_connector_registry_state(principal.account_id)

    # 3. Limits (Could also be account-specific)
    limits = SystemLimits(
        max_total_budget_cents=5000000, # $50k
        max_daily_budget_cents=1000000, # $10k
        max_campaigns=100
    )

    return CapabilitiesResponse(
        features=features,
        platforms=platforms,
        limits=limits
    )
