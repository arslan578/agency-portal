"""
Shopify Webhook Tests
Tests for app/uninstalled and products/update webhooks.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import os
import hmac
import hashlib
import base64
import json
from integrations.shopify.api.webhooks import router as webhook_router

app = FastAPI()
app.include_router(webhook_router)

client = TestClient(app)

SHOPIFY_API_SECRET = "test_secret_key"


def generate_hmac(body: bytes, secret: str) -> str:
    """
    Generate HMAC signature for webhook in base64 format (Shopify's format).
    
    Shopify sends HMAC-SHA256 signatures in base64 format via X-Shopify-Hmac-SHA256 header.
    """
    digest = hmac.new(
        secret.encode('utf-8'),
        body,
        hashlib.sha256
    ).digest()
    return base64.b64encode(digest).decode('utf-8')


@pytest.fixture
def mock_db_session():
    """Mock database session."""
    with patch('integrations.shopify.api.webhooks.get_db') as mock_get_db:
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        yield mock_db


@pytest.fixture
def enable_shopify_app():
    """Enable Shopify app feature flag."""
    with patch.dict(os.environ, {"FF_SHOPIFY_APP_ENABLED": "true", "SHOPIFY_API_SECRET": SHOPIFY_API_SECRET}):
        # Patch the webhook module's SHOPIFY_API_SECRET at module level
        import integrations.shopify.api.webhooks as webhook_module
        original_secret = webhook_module.SHOPIFY_API_SECRET
        webhook_module.SHOPIFY_API_SECRET = SHOPIFY_API_SECRET
        try:
            yield
        finally:
            webhook_module.SHOPIFY_API_SECRET = original_secret


def test_app_uninstalled_webhook_success(enable_shopify_app, mock_db_session):
    """Test app/uninstalled webhook successfully cleans up."""
    webhook_data = {
        "id": 12345,
        "name": "test-store",
        "email": "test@example.com"
    }
    body = json.dumps(webhook_data).encode()
    hmac_header = generate_hmac(body, SHOPIFY_API_SECRET)
    
    # Mock the database session and connection properly
    mock_connection = MagicMock()
    mock_connection.workspace_id = "ws_test123"
    mock_connection.shop_domain = "test-store.myshopify.com"
    
    # Mock db.delete and db.commit to work properly
    mock_db_session.delete = MagicMock()
    mock_db_session.commit = MagicMock()
    mock_db_session.query.return_value.filter.return_value.first.return_value = mock_connection
    
    with patch('integrations.shopify.webhooks.handlers.get_persistence') as mock_get_persistence:
        mock_persistence = MagicMock()
        mock_persistence.get_connection.return_value = mock_connection
        mock_get_persistence.return_value = mock_persistence
        
        # Also patch get_db to return our mock session
        with patch('integrations.shopify.api.webhooks.get_db', return_value=mock_db_session):
            response = client.post(
                "/integrations/shopify/webhooks/app/uninstalled",
                content=body,
                headers={
                    "X-Shopify-Shop-Domain": "test-store.myshopify.com",
                    "X-Shopify-Hmac-Sha256": hmac_header,
                    "Content-Type": "application/json"
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "success"
            assert data["shop_domain"] == "test-store.myshopify.com"


def test_app_uninstalled_webhook_missing_secret_returns_401():
    """Test that webhook with missing SHOPIFY_API_SECRET returns 401.
    
    This test verifies Shopify App Store compliance requirement:
    'If a mandatory compliance webhook sends a request with an invalid 
    Shopify HMAC header, then the app must return a 401 Unauthorized HTTP status.'
    
    When SHOPIFY_API_SECRET is missing/empty, HMAC verification should fail
    and return 401, not bypass verification.
    """
    webhook_data = {
        "id": 12345,
        "name": "test-store",
        "email": "test@example.com"
    }
    body = json.dumps(webhook_data).encode()
    
    # Patch SHOPIFY_API_SECRET to be empty (simulating missing secret)
    import integrations.shopify.api.webhooks as webhook_module
    original_secret = webhook_module.SHOPIFY_API_SECRET
    webhook_module.SHOPIFY_API_SECRET = ""
    
    try:
        with patch('integrations.shopify.api.webhooks.get_db') as mock_get_db:
            mock_db = MagicMock()
            mock_get_db.return_value = mock_db
            
            response = client.post(
                "/integrations/shopify/webhooks/app/uninstalled",
                content=body,
                headers={
                    "X-Shopify-Shop-Domain": "test-store.myshopify.com",
                    "X-Shopify-Hmac-Sha256": "any_hmac_value",
                    "Content-Type": "application/json"
                }
            )
            
            # Should return 401 because HMAC verification fails when secret is missing
            # This ensures compliance with Shopify's requirement
            assert response.status_code == 401
            assert "Invalid webhook signature" in response.text
    finally:
        webhook_module.SHOPIFY_API_SECRET = original_secret


def test_app_uninstalled_webhook_invalid_hmac(enable_shopify_app):
    """Test app/uninstalled webhook rejects invalid HMAC."""
    body = json.dumps({"id": 12345}).encode()
    invalid_hmac = "invalid_signature"
    
    response = client.post(
        "/integrations/shopify/webhooks/app/uninstalled",
        content=body,
        headers={
            "X-Shopify-Shop-Domain": "test-store.myshopify.com",
            "X-Shopify-Hmac-Sha256": invalid_hmac,
            "Content-Type": "application/json"
        }
    )
    
    assert response.status_code == 401


def test_app_uninstalled_webhook_connection_not_found(enable_shopify_app, mock_db_session):
    """Test app/uninstalled webhook handles missing connection gracefully."""
    webhook_data = {"id": 12345}
    body = json.dumps(webhook_data).encode()
    hmac_header = generate_hmac(body, SHOPIFY_API_SECRET)
    
    with patch('integrations.shopify.webhooks.handlers.get_persistence') as mock_get_persistence:
        mock_persistence = MagicMock()
        mock_persistence.get_connection.return_value = None
        mock_get_persistence.return_value = mock_persistence
        
        response = client.post(
            "/integrations/shopify/webhooks/app/uninstalled",
            content=body,
            headers={
                "X-Shopify-Shop-Domain": "nonexistent-store.myshopify.com",
                "X-Shopify-Hmac-Sha256": hmac_header,
                "Content-Type": "application/json"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "not found" in data["message"].lower() or "already" in data["message"].lower()


def test_products_update_webhook_disabled():
    """Test products/update webhook is skipped when feature flag is disabled."""
    with patch.dict(os.environ, {"FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK": "false", "SHOPIFY_API_SECRET": SHOPIFY_API_SECRET}):
        # Patch the webhook module's SHOPIFY_API_SECRET and feature flag
        import integrations.shopify.api.webhooks as webhook_module
        import integrations.shopify.services.feature_flags as ff_module
        
        original_secret = webhook_module.SHOPIFY_API_SECRET
        original_ff = ff_module.FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK
        
        webhook_module.SHOPIFY_API_SECRET = SHOPIFY_API_SECRET
        ff_module.FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK = False
        
        try:
            webhook_data = {"id": 12345}
            body = json.dumps(webhook_data).encode()
            hmac_header = generate_hmac(body, SHOPIFY_API_SECRET)
            
            response = client.post(
                "/integrations/shopify/webhooks/products/update",
                content=body,
                headers={
                    "X-Shopify-Shop-Domain": "test-store.myshopify.com",
                    "X-Shopify-Hmac-Sha256": hmac_header,
                    "Content-Type": "application/json"
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "skipped"
            assert "disabled" in data["message"].lower()
        finally:
            webhook_module.SHOPIFY_API_SECRET = original_secret
            ff_module.FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK = original_ff


def test_products_update_webhook_enabled():
    """Test products/update webhook processes when feature flag is enabled."""
    with patch.dict(os.environ, {"FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK": "true", "SHOPIFY_API_SECRET": SHOPIFY_API_SECRET}):
        # Patch the feature flag module and webhook module
        import integrations.shopify.services.feature_flags as ff_module
        import integrations.shopify.api.webhooks as webhook_module
        original_ff = ff_module.FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK
        original_secret = webhook_module.SHOPIFY_API_SECRET
        
        ff_module.FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK = True
        webhook_module.SHOPIFY_API_SECRET = SHOPIFY_API_SECRET
        
        try:
            webhook_data = {"id": 12345, "title": "Updated Product"}
            body = json.dumps(webhook_data).encode()
            hmac_header = generate_hmac(body, SHOPIFY_API_SECRET)
            
            with patch('integrations.shopify.webhooks.handlers.get_persistence') as mock_get_persistence:
                mock_persistence = MagicMock()
                mock_get_persistence.return_value = mock_persistence
                
                response = client.post(
                    "/integrations/shopify/webhooks/products/update",
                    content=body,
                    headers={
                        "X-Shopify-Shop-Domain": "test-store.myshopify.com",
                        "X-Shopify-Hmac-Sha256": hmac_header,
                        "Content-Type": "application/json"
                    }
                )
                
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "processed"
        finally:
            ff_module.FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK = original_ff
            webhook_module.SHOPIFY_API_SECRET = original_secret


def test_customers_data_request_webhook(enable_shopify_app, mock_db_session):
    """Test customers/data_request webhook (GDPR compliance)."""
    webhook_data = {
        "shop_id": 954889,
        "shop_domain": "test-store.myshopify.com",
        "orders_requested": [299938, 280263],
        "customer": {
            "id": 191167,
            "email": "john@example.com",
            "phone": "555-625-1199"
        },
        "data_request": {
            "id": 9999
        }
    }
    body = json.dumps(webhook_data).encode()
    hmac_header = generate_hmac(body, SHOPIFY_API_SECRET)
    
    response = client.post(
        "/integrations/shopify/webhooks/customers/data_request",
        content=body,
        headers={
            "X-Shopify-Shop-Domain": "test-store.myshopify.com",
            "X-Shopify-Hmac-Sha256": hmac_header,
            "Content-Type": "application/json"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "acknowledged"
    assert data["shop_domain"] == "test-store.myshopify.com"
    assert data["customer_id"] == 191167


def test_customers_redact_webhook(enable_shopify_app, mock_db_session):
    """Test customers/redact webhook (GDPR compliance)."""
    webhook_data = {
        "shop_id": 954889,
        "shop_domain": "test-store.myshopify.com",
        "customer": {
            "id": 191167,
            "email": "john@example.com",
            "phone": "555-625-1199"
        },
        "orders_to_redact": [299938, 280263]
    }
    body = json.dumps(webhook_data).encode()
    hmac_header = generate_hmac(body, SHOPIFY_API_SECRET)
    
    response = client.post(
        "/integrations/shopify/webhooks/customers/redact",
        content=body,
        headers={
            "X-Shopify-Shop-Domain": "test-store.myshopify.com",
            "X-Shopify-Hmac-Sha256": hmac_header,
            "Content-Type": "application/json"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "acknowledged"
    assert data["shop_domain"] == "test-store.myshopify.com"
    assert data["customer_id"] == 191167


def test_shop_redact_webhook(enable_shopify_app, mock_db_session):
    """Test shop/redact webhook (GDPR compliance)."""
    webhook_data = {
        "shop_id": 954889,
        "shop_domain": "test-store.myshopify.com"
    }
    body = json.dumps(webhook_data).encode()
    hmac_header = generate_hmac(body, SHOPIFY_API_SECRET)
    
    response = client.post(
        "/integrations/shopify/webhooks/shop/redact",
        content=body,
        headers={
            "X-Shopify-Shop-Domain": "test-store.myshopify.com",
            "X-Shopify-Hmac-Sha256": hmac_header,
            "Content-Type": "application/json"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "acknowledged"
    assert data["shop_domain"] == "test-store.myshopify.com"


def test_gdpr_webhook_invalid_hmac(enable_shopify_app):
    """Test GDPR webhooks reject invalid HMAC."""
    webhook_data = {
        "shop_id": 954889,
        "shop_domain": "test-store.myshopify.com",
        "customer": {"id": 191167, "email": "john@example.com"}
    }
    body = json.dumps(webhook_data).encode()
    invalid_hmac = "invalid_signature"
    
    # Test customers/data_request
    response = client.post(
        "/integrations/shopify/webhooks/customers/data_request",
        content=body,
        headers={
            "X-Shopify-Shop-Domain": "test-store.myshopify.com",
            "X-Shopify-Hmac-Sha256": invalid_hmac,
            "Content-Type": "application/json"
        }
    )
    assert response.status_code == 401
    
    # Test customers/redact
    response = client.post(
        "/integrations/shopify/webhooks/customers/redact",
        content=body,
        headers={
            "X-Shopify-Shop-Domain": "test-store.myshopify.com",
            "X-Shopify-Hmac-Sha256": invalid_hmac,
            "Content-Type": "application/json"
        }
    )
    assert response.status_code == 401
    
    # Test shop/redact
    shop_data = {"shop_id": 954889, "shop_domain": "test-store.myshopify.com"}
    shop_body = json.dumps(shop_data).encode()
    response = client.post(
        "/integrations/shopify/webhooks/shop/redact",
        content=shop_body,
        headers={
            "X-Shopify-Shop-Domain": "test-store.myshopify.com",
            "X-Shopify-Hmac-Sha256": invalid_hmac,
            "Content-Type": "application/json"
        }
    )
    assert response.status_code == 401
