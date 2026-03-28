"""
Shopify Feature Flag Tests
Tests for feature flag gating of Shopify integration endpoints.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch
import integrations.shopify.api.main as shopify_main_module

# Create app and client
app = FastAPI()
app.include_router(shopify_main_module.router)
client = TestClient(app)


def test_connect_blocked_when_feature_flag_disabled():
    """Test connect endpoint is blocked when FF_SHOPIFY_APP_ENABLED is false."""
    # Patch the feature flag value directly in the module
    with patch.object(shopify_main_module, 'FF_SHOPIFY_APP_ENABLED', False):
        response = client.post("/integrations/shopify/connect", json={
            "contract_version": "input_contract_v1",
            "shop_domain": "test-store.myshopify.com",
            "shopify_app_installation_id": "install_123",
            "requested_at": "2023-10-27T10:00:00Z"
        })
        
        assert response.status_code == 503
        data = response.json()
        assert "detail" in data
        # Error should contain feature disabled message
        detail_str = str(data.get("detail", ""))
        assert "disabled" in detail_str.lower() or "FEATURE_DISABLED" in detail_str


def test_promote_blocked_when_feature_flag_disabled():
    """Test promote endpoint is blocked when FF_SHOPIFY_APP_ENABLED is false."""
    with patch.object(shopify_main_module, 'FF_SHOPIFY_APP_ENABLED', False):
        response = client.post("/integrations/shopify/promote", json={
            "contract_version": "input_contract_v1",
            "shop_domain": "test-store.myshopify.com",
            "product": {
                "shopify_product_id": "123",
                "title": "Test Product",
                "primary_image_url": "https://example.com/image.jpg",
                "image_urls": ["https://example.com/image.jpg"],
                "product_url": "https://example.com/product",
                "variants": []
            },
            "presets": {
                "goal": "SALES",
                "daily_budget_usd": 10.0,
                "channels": "DEFAULT_MIX"
            },
            "requested_at": "2023-10-27T10:00:00Z"
        })
        
        assert response.status_code == 503


def test_campaigns_blocked_when_feature_flag_disabled():
    """Test campaigns endpoint is blocked when FF_SHOPIFY_APP_ENABLED is false."""
    with patch.object(shopify_main_module, 'FF_SHOPIFY_APP_ENABLED', False):
        response = client.get("/integrations/shopify/campaigns?shop_domain=test-store.myshopify.com")
        
        assert response.status_code == 503


def test_disconnect_blocked_when_feature_flag_disabled():
    """Test disconnect endpoint is blocked when FF_SHOPIFY_APP_ENABLED is false."""
    with patch.object(shopify_main_module, 'FF_SHOPIFY_APP_ENABLED', False):
        response = client.post("/integrations/shopify/disconnect", json={
            "contract_version": "input_contract_v1",
            "shop_domain": "test-store.myshopify.com",
            "requested_at": "2023-10-27T10:00:00Z"
        })
        
        assert response.status_code == 503
