"""
Feature Flags for Shopify Integration
All flags default to False for safe rollout.
"""
import os

# Feature flags - all default to False
FF_SHOPIFY_APP_ENABLED = os.getenv("FF_SHOPIFY_APP_ENABLED", "false").lower() == "true"
FF_SHOPIFY_ATTRIBUTION_SYNC = os.getenv("FF_SHOPIFY_ATTRIBUTION_SYNC", "false").lower() == "true"
FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK = os.getenv("FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK", "false").lower() == "true"


def check_feature_flag_enabled(flag_name: str) -> bool:
    """Check if a feature flag is enabled."""
    flag_map = {
        "FF_SHOPIFY_APP_ENABLED": FF_SHOPIFY_APP_ENABLED,
        "FF_SHOPIFY_ATTRIBUTION_SYNC": FF_SHOPIFY_ATTRIBUTION_SYNC,
        "FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK": FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK,
    }
    return flag_map.get(flag_name, False)


def require_feature_flag(flag_name: str):
    """Raise exception if feature flag is not enabled."""
    if not check_feature_flag_enabled(flag_name):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=f"Feature {flag_name} is not enabled"
        )
