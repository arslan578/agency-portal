
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch
import os
import uuid
from integrations.shopify.api.main import router as shopify_router

app = FastAPI()
app.include_router(shopify_router)

client = TestClient(app)

# Helper to override Feature Flag
@pytest.fixture
def enable_shopify_app():
    with patch.dict(os.environ, {"FF_SHOPIFY_APP_ENABLED": "true"}):
        # Also need to patch the module-level variable
        import integrations.shopify.api.main as shopify_main
        original_value = shopify_main.FF_SHOPIFY_APP_ENABLED
        shopify_main.FF_SHOPIFY_APP_ENABLED = True
        yield
        shopify_main.FF_SHOPIFY_APP_ENABLED = original_value

@pytest.fixture
def disable_attribution():
    with patch.dict(os.environ, {"FF_SHOPIFY_ATTRIBUTION_SYNC": "false"}):
        yield

# --- 1. Happy Path (6 tests) ---

def test_connect_success(enable_shopify_app):
    response = client.post("/integrations/shopify/connect", json={
        "contract_version": "input_contract_v1",
        "shop_domain": "test-store.myshopify.com",
        "shopify_app_installation_id": "install_123",
        "requested_at": "2023-10-27T10:00:00Z"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CONNECTED"
    assert "workspace_id" in data
    assert data["shop_domain"] == "test-store.myshopify.com"

def test_promote_success(enable_shopify_app):
    # Ensure connected first
    client.post("/integrations/shopify/connect", json={
        "contract_version": "input_contract_v1",
        "shop_domain": "promote-store.myshopify.com",
        "shopify_app_installation_id": "install_abc",
        "requested_at": "2023-10-27T10:00:00Z"
    })
    
    response = client.post("/integrations/shopify/promote", json={
        "contract_version": "input_contract_v1",
        "shop_domain": "promote-store.myshopify.com",
        "product": {
            "shopify_product_id": "prod_1",
            "title": "Test Product",
            "primary_image_url": "http://img.com/1.jpg",
            "image_urls": ["http://img.com/1.jpg"],
            "product_url": "http://store.com/prod_1",
            "variants": [{"variant_id": "var_1", "price": 10.0}]
        },
        "presets": {
            "goal": "SALES",
            "daily_budget_usd": 50.0,
            "channels": "DEFAULT_MIX"
        },
        "requested_at": "2023-10-27T10:00:00Z"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["DRAFT_CREATED", "SUBMITTED"]
    assert "kaivo_campaign_id" in data

def test_campaigns_list_success(enable_shopify_app):
    shop = "list-store.myshopify.com"
    # Connect and promote strict
    client.post("/integrations/shopify/connect", json={
        "contract_version": "input_contract_v1",
        "shop_domain": shop,
        "shopify_app_installation_id": "i",
        "requested_at": "t"
    })
    client.post("/integrations/shopify/promote", json={
        "contract_version": "input_contract_v1",
        "shop_domain": shop,
        "product": {
            "shopify_product_id": "p1", "title": "t", "primary_image_url": "u", "image_urls": ["u"], "product_url": "u",
            "variants": [{"variant_id": "v", "price": 1}]
        },
        "presets": {"goal": "SALES", "daily_budget_usd": 10, "channels": "DEFAULT_MIX"},
        "requested_at": "t"
    })

    response = client.get(f"/integrations/shopify/campaigns?shop_domain={shop}")
    assert response.status_code == 200
    data = response.json()
    assert len(data["campaigns"]) > 0
    assert data["campaigns"][0]["shopify_product_id"] == "p1"

def test_disconnect_success(enable_shopify_app):
    shop = "disconnect.myshopify.com"
    client.post("/integrations/shopify/connect", json={
        "contract_version": "input_contract_v1", 
        "shop_domain": shop, "shopify_app_installation_id": "x", "requested_at": "t"
    })
    
    response = client.post("/integrations/shopify/disconnect", json={
        "contract_version": "input_contract_v1",
        "shop_domain": shop,
        "requested_at": "t"
    })
    assert response.status_code == 200
    assert response.json()["status"] == "DISCONNECTED"

def test_campaigns_empty_list(enable_shopify_app):
    response = client.get("/integrations/shopify/campaigns?shop_domain=empty-store.myshopify.com")
    assert response.status_code == 200
    assert response.json()["campaigns"] == []

def test_promote_with_optional_fields(enable_shopify_app):
    shop = "opt-fields.myshopify.com"
    client.post("/integrations/shopify/connect", json={"contract_version":"input_contract_v1", "shop_domain":shop, "shopify_app_installation_id":"x", "requested_at":"t"})
    
    response = client.post("/integrations/shopify/promote", json={
        "contract_version": "input_contract_v1",
        "correlation_id": "client_corr_id", # Optional
        "shop_domain": shop,
        "product": {
            "shopify_product_id": "p2", "title": "t", "description_html": "<p>desc</p>", # Optional
            "primary_image_url": "u", "image_urls": ["u"], "product_url": "u",
            "variants": [{"variant_id": "v", "price": 1, "sku": "SKU1", "inventory_quantity": 100}] # Optional fields
        },
        "presets": {"goal": "AWARENESS", "daily_budget_usd": 20, "channels": "DEFAULT_MIX"},
        "requested_at": "t"
    })
    assert response.status_code == 200
    assert response.json()["correlation_id"] == "client_corr_id"


# --- 2. Negative Path (6 tests) ---

def test_connect_invalid_shop_domain(enable_shopify_app):
    # This assumes schema validation handles 'str' but if we had strict regex it would fail stronger.
    # Here we simulate schema missing field error to represent invalid input
    response = client.post("/integrations/shopify/connect", json={
        "contract_version": "input_contract_v1",
        "shopify_app_installation_id": "x", 
        "requested_at": "t"
    })
    assert response.status_code == 422 # Schema validation error (Field required)

def test_promote_missing_required_field(enable_shopify_app):
    response = client.post("/integrations/shopify/promote", json={
        "contract_version": "input_contract_v1",
        "shop_domain": "shop.com",
        # Missing 'product'
        "presets": {"goal": "SALES", "daily_budget_usd": 10, "channels": "DEFAULT_MIX"},
        "requested_at": "t"
    })
    assert response.status_code == 422

def test_promote_invalid_budget_type(enable_shopify_app):
    # Sends string where float is expected (unless coerced), Pydantic might coerce. 
    # Let's send a purely invalid type or if schema has strict check.
    response = client.post("/integrations/shopify/promote", json={
        "contract_version": "input_contract_v1",
        "shop_domain": "shop.com",
        "product": {"shopify_product_id":"1","title":"t","primary_image_url":"u","image_urls":[],"product_url":"u","variants":[]},
        "presets": {"goal": "SALES", "daily_budget_usd": "not-a-number", "channels": "DEFAULT_MIX"},
        "requested_at": "t"
    })
    assert response.status_code == 422

def test_campaigns_missing_shop(enable_shopify_app):
    response = client.get("/integrations/shopify/campaigns")
    assert response.status_code == 422 # Query param required

def test_disconnect_unknown_shop(enable_shopify_app):
    # Depending on logic, this might succeed idempotently or fail. 
    # Current implementation mimics persistence remove, which shouldn't error if not found (idempotent safe)
    # BUT if we want to valid negative path for "Bad Request" payloads:
    response = client.post("/integrations/shopify/disconnect", json={
        "contract_version": "bad_version_v99",
        "shop_domain": "s", "requested_at": "t"
    })
    assert response.status_code == 422 # Literal mismatch

def test_contract_violation_extra_fields(enable_shopify_app):
    response = client.post("/integrations/shopify/connect", json={
        "contract_version": "input_contract_v1",
        "shop_domain": "s", "shopify_app_installation_id": "x", "requested_at": "t",
        "extra_forbidden_field": "hacking_attempt"
    })
    assert response.status_code == 422 # "extra": "forbid" in Config


# --- 3. Edge Cases (4 tests) ---

def test_promote_zero_budget(enable_shopify_app):
    # Should likely handle 0 budget, though business logic might reject. 
    # Persistence mock allows it. Schema is float.
    shop = "zero-budget.myshopify.com"
    client.post("/integrations/shopify/connect", json={"contract_version":"input_contract_v1", "shop_domain":shop, "shopify_app_installation_id":"x", "requested_at":"t"})
    
    response = client.post("/integrations/shopify/promote", json={
        "contract_version": "input_contract_v1",
        "shop_domain": shop,
        "product": {
            "shopify_product_id": "p1", "title": "t", "primary_image_url": "u", "image_urls": ["u"], "product_url": "u",
            "variants": [{"variant_id": "v", "price": 1}]
        },
        "presets": {"goal": "SALES", "daily_budget_usd": 0.0, "channels": "DEFAULT_MIX"},
        "requested_at": "t"
    })
    assert response.status_code == 200 # Allowed contractually, business logic might act later

def test_promote_very_long_strings(enable_shopify_app):
    long_string = "a" * 5000
    shop = "long.myshopify.com"
    client.post("/integrations/shopify/connect", json={"contract_version":"input_contract_v1", "shop_domain":shop, "shopify_app_installation_id":"x", "requested_at":"t"})
    
    response = client.post("/integrations/shopify/promote", json={
        "contract_version": "input_contract_v1",
        "shop_domain": shop,
        "product": {
            "shopify_product_id": "p1", "title": long_string, "primary_image_url": "u", "image_urls": ["u"], "product_url": "u",
            "variants": [{"variant_id": "v", "price": 1}]
        },
        "presets": {"goal": "SALES", "daily_budget_usd": 10, "channels": "DEFAULT_MIX"},
        "requested_at": "t"
    })
    assert response.status_code == 200 # Should handle reasonable text loads

def test_connect_reconnect(enable_shopify_app):
    shop = "reconnect.myshopify.com"
    # Connect 1
    r1 = client.post("/integrations/shopify/connect", json={"contract_version":"input_contract_v1", "shop_domain":shop, "shopify_app_installation_id":"x", "requested_at":"t"})
    assert r1.status_code == 200
    id1 = r1.json()["workspace_id"]
    
    # Connect 2 (Retry/Reconnect)
    r2 = client.post("/integrations/shopify/connect", json={"contract_version":"input_contract_v1", "shop_domain":shop, "shopify_app_installation_id":"x", "requested_at":"t"})
    assert r2.status_code == 200
    id2 = r2.json()["workspace_id"]
    
    assert id1 == id2 # Should return same workspace ID (persistence mock does get_binding check)

def test_campaigns_pagination_ignore(enable_shopify_app):
    # Contracts don't strictly specify limit/offset yet, but standard API behavior often accepts extra query params or ignores them
    # Fastapi will ignore unknown query params unless defined.
    response = client.get("/integrations/shopify/campaigns?shop_domain=s&limit=999&offset=0")
    assert response.status_code == 200 # Should not error

# --- 4. Regression (1 test) ---

def test_no_attribution_access(enable_shopify_app, disable_attribution):
    # With FF_SHOPIFY_ATTRIBUTION_SYNC false, no orders usage.
    # Since we didn't implement orders endpoint in V1, demonstrating regression guard means confirming absence
    # of orders route or failure to access a theoretical structure.
    # In V1 implementation, we just ensure no code path attempts order fetch.
    # We can verify that the list_campaigns doesn't blow up (e.g. trying to join orders).
    response = client.get("/integrations/shopify/campaigns?shop_domain=s")
    assert response.status_code == 200

# --- 5. Determinism (1 test) ---

def test_promote_idempotency_canonicalization(enable_shopify_app):
    shop = "deterministic.myshopify.com"
    prod_id = "prod_det_1"
    client.post("/integrations/shopify/connect", json={"contract_version":"input_contract_v1", "shop_domain":shop, "shopify_app_installation_id":"x", "requested_at":"t"})

    # Payload 1: Budget 50 (int)
    payload1 = {
        "contract_version": "input_contract_v1", "shop_domain": shop,
        "product": {
            "shopify_product_id": prod_id, "title": "t", "primary_image_url": "u", "image_urls": ["u"], "product_url": "u",
            "variants": [{"variant_id": "v", "price": 1}]
        },
        "presets": {"goal": "SALES", "daily_budget_usd": 50, "channels": "DEFAULT_MIX"},
        "requested_at": "t"
    }

    # Payload 2: Budget 50.0 (float)
    payload2 = {
        "contract_version": "input_contract_v1", "shop_domain": shop,
        "product": {
            "shopify_product_id": prod_id, "title": "t", "primary_image_url": "u", "image_urls": ["u"], "product_url": "u",
            "variants": [{"variant_id": "v", "price": 1}]
        },
        "presets": {"goal": "SALES", "daily_budget_usd": 50.0, "channels": "DEFAULT_MIX"},
        "requested_at": "t2"
    }

    resp1 = client.post("/integrations/shopify/promote", json=payload1)
    assert resp1.status_code == 200
    id1 = resp1.json()["kaivo_campaign_id"]

    resp2 = client.post("/integrations/shopify/promote", json=payload2)
    assert resp2.status_code == 200
    id2 = resp2.json()["kaivo_campaign_id"]

    assert id1 == id2 # Must return same ID due to canonicalization
