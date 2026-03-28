"""
Shopify Webhook API Endpoints
Handles webhook requests from Shopify.
"""
import hmac
import hashlib
import base64
import json
from fastapi import APIRouter, Request, HTTPException, Header, Depends
from typing import Optional
from sqlalchemy.orm import Session
from packages.db.database import get_db
from integrations.shopify.webhooks.handlers import (
    handle_app_uninstalled,
    handle_app_scopes_update,
    handle_products_update,
    handle_customers_data_request,
    handle_customers_redact,
    handle_shop_redact
)
from integrations.shopify.services.observability import log_shopify_action
import os

router = APIRouter(prefix="/integrations/shopify/webhooks", tags=["Shopify Webhooks"])

# Make SHOPIFY_API_SECRET patchable for tests
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET", "")


def verify_webhook_hmac(request_body: bytes, hmac_header: str) -> bool:
    """
    Verify Shopify webhook HMAC signature.
    
    Shopify sends HMAC-SHA256 signature in base64 format via X-Shopify-Hmac-SHA256 header.
    This function verifies the signature matches the expected value.
    
    Args:
        request_body: Raw request body bytes (must be exact bytes sent by Shopify)
        hmac_header: HMAC signature from X-Shopify-Hmac-SHA256 header
    
    Returns:
        True if signature is valid, False otherwise
    
    Note:
        For Shopify App Store submission, SHOPIFY_API_SECRET MUST be set in production.
        Missing secret or HMAC header is treated as invalid (returns False).
    """
    # CRITICAL: SHOPIFY_API_SECRET must be set in production for App Store compliance
    # Shopify requires apps to verify webhooks with HMAC signatures
    if not SHOPIFY_API_SECRET:
        log_shopify_action(
            action="webhook_hmac_missing_secret",
            shop_domain="unknown",  # Shop domain not available at this stage
            message="SHOPIFY_API_SECRET not set - webhook verification disabled (invalid for production)"
        )
        # Return False to enforce 401 for invalid/missing HMAC
        # This ensures compliance with Shopify's requirement:
        # "If a mandatory compliance webhook sends a request with an invalid Shopify HMAC header,
        # then the app must return a 401 Unauthorized HTTP status."
        return False
    
    if not hmac_header:
        log_shopify_action(
            action="webhook_hmac_missing_header",
            shop_domain="unknown",  # Shop domain not available at this stage
            message="X-Shopify-Hmac-SHA256 header missing"
        )
        return False
    
    # Remove any prefixes like 'sha256=' if present
    hmac_header = hmac_header.replace("sha256=", "").strip()
    
    try:
        # Calculate expected HMAC using SHA256
        digest = hmac.new(
            SHOPIFY_API_SECRET.encode('utf-8'),
            request_body,
            hashlib.sha256
        ).digest()
        
        # Encode to base64 (Shopify's format)
        calculated_hmac = base64.b64encode(digest).decode('utf-8')
        
        # Compare using constant-time comparison to prevent timing attacks
        return hmac.compare_digest(calculated_hmac, hmac_header)
    except Exception as e:
        # Log error but don't expose details
        log_shopify_action(
            action="webhook_hmac_verification_error",
            shop_domain="unknown",  # Shop domain not available at this stage
            error=str(e)
        )
        return False


@router.post("/app/uninstalled")
async def webhook_app_uninstalled(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    db: Session = Depends(get_db)
):
    """
    Handle app/uninstalled webhook from Shopify.
    Performs cleanup: deletes tokens, marks binding inactive, stops jobs.
    """
    # Read request body
    body = await request.body()
    
    # Verify HMAC
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        log_shopify_action(
            action="webhook_hmac_invalid",
            shop_domain=x_shopify_shop_domain,
            webhook_type="app/uninstalled"
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse webhook data
    try:
        webhook_data = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in webhook body")
    
    # Handle uninstall
    result = await handle_app_uninstalled(
        shop_domain=x_shopify_shop_domain,
        db=db,
        webhook_data=webhook_data
    )
    
    return result


@router.post("/app/scopes_update")
async def webhook_app_scopes_update(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    db: Session = Depends(get_db)
):
    """
    Handle app/scopes_update webhook from Shopify.
    Triggered when granted access scopes for an installed app are modified.
    Payload: id, shop_id, previous, current (scope arrays), updated_at.
    """
    # Read request body
    body = await request.body()
    
    # Verify HMAC
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        log_shopify_action(
            action="webhook_hmac_invalid",
            shop_domain=x_shopify_shop_domain,
            webhook_type="app/scopes_update"
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse webhook data
    try:
        webhook_data = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in webhook body")
    
    # Handle scopes update
    result = await handle_app_scopes_update(
        shop_domain=x_shopify_shop_domain,
        db=db,
        webhook_data=webhook_data
    )
    
    return result


@router.post("/products/update")
async def webhook_products_update(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    db: Session = Depends(get_db)
):
    """
    Handle products/update webhook from Shopify (optional, feature-flagged).
    Only processes if FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK is enabled.
    """
    # Read request body first (before checking feature flag, for HMAC verification)
    body = await request.body()
    
    # Verify HMAC
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        log_shopify_action(
            action="webhook_hmac_invalid",
            shop_domain=x_shopify_shop_domain,
            webhook_type="products/update"
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    from integrations.shopify.services.feature_flags import FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK
    
    if not FF_SHOPIFY_PRODUCTS_UPDATE_WEBHOOK:
        return {
            "status": "skipped",
            "message": "products/update webhook is disabled via feature flag"
        }
    
    # Parse webhook data
    try:
        webhook_data = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in webhook body")
    
    # Handle products update
    result = await handle_products_update(
        shop_domain=x_shopify_shop_domain,
        db=db,
        webhook_data=webhook_data
    )
    
    return result


@router.post("/customers/data_request")
async def webhook_customers_data_request(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    db: Session = Depends(get_db)
):
    """
    Handle customers/data_request webhook from Shopify (GDPR compliance).
    Required for Shopify App Review automated checks.
    """
    # Read request body
    body = await request.body()
    
    # Verify HMAC
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        log_shopify_action(
            action="webhook_hmac_invalid",
            shop_domain=x_shopify_shop_domain,
            webhook_type="customers/data_request"
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse webhook data
    try:
        webhook_data = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in webhook body")
    
    # Handle GDPR data request
    result = await handle_customers_data_request(
        shop_domain=x_shopify_shop_domain,
        db=db,
        webhook_data=webhook_data
    )
    
    return result


@router.post("/customers/redact")
async def webhook_customers_redact(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    db: Session = Depends(get_db)
):
    """
    Handle customers/redact webhook from Shopify (GDPR compliance).
    Required for Shopify App Review automated checks.
    """
    # Read request body
    body = await request.body()
    
    # Verify HMAC
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        log_shopify_action(
            action="webhook_hmac_invalid",
            shop_domain=x_shopify_shop_domain,
            webhook_type="customers/redact"
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse webhook data
    try:
        webhook_data = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in webhook body")
    
    # Handle GDPR redact
    result = await handle_customers_redact(
        shop_domain=x_shopify_shop_domain,
        db=db,
        webhook_data=webhook_data
    )
    
    return result


@router.post("/shop/redact")
async def webhook_shop_redact(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    db: Session = Depends(get_db)
):
    """
    Handle shop/redact webhook from Shopify (GDPR compliance).
    Required for Shopify App Review automated checks.
    """
    # Read request body
    body = await request.body()
    
    # Verify HMAC
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        log_shopify_action(
            action="webhook_hmac_invalid",
            shop_domain=x_shopify_shop_domain,
            webhook_type="shop/redact"
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse webhook data
    try:
        webhook_data = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in webhook body")
    
    # Handle GDPR shop redact
    result = await handle_shop_redact(
        shop_domain=x_shopify_shop_domain,
        db=db,
        webhook_data=webhook_data
    )
    
    return result


# Unified webhook endpoint for Shopify compliance_topics
# This MUST be at the END of the file so specific routes (/customers/data_request, etc.) are matched first
# Shopify sends compliance_topics to a single URI with X-Shopify-Topic header
@router.post("")
@router.post("/")
async def webhook_unified(
    request: Request,
    x_shopify_topic: Optional[str] = Header(None, alias="X-Shopify-Topic"),
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    db: Session = Depends(get_db)
):
    """
    Unified webhook endpoint for Shopify compliance topics.
    Shopify sends compliance_topics (customers/data_request, customers/redact, shop/redact)
    to a single URI with X-Shopify-Topic header indicating the topic type.
    
    This endpoint routes to the appropriate handler based on the topic header.
    Required for Shopify App Review automated checks.
    
    Note: This endpoint is at the end of the file so specific routes are matched first.
    """
    # Read request body first (before routing, for HMAC verification)
    body = await request.body()
    
    # Verify HMAC
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        log_shopify_action(
            action="webhook_hmac_invalid",
            shop_domain=x_shopify_shop_domain,
            webhook_type=x_shopify_topic or "unknown"
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse webhook data
    try:
        webhook_data = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in webhook body")
    
    # Route based on X-Shopify-Topic header
    if not x_shopify_topic:
        raise HTTPException(status_code=400, detail="Missing X-Shopify-Topic header")
    
    topic = x_shopify_topic.lower()
    
    if topic == "customers/data_request":
        result = await handle_customers_data_request(
            shop_domain=x_shopify_shop_domain,
            db=db,
            webhook_data=webhook_data
        )
    elif topic == "customers/redact":
        result = await handle_customers_redact(
            shop_domain=x_shopify_shop_domain,
            db=db,
            webhook_data=webhook_data
        )
    elif topic == "shop/redact":
        result = await handle_shop_redact(
            shop_domain=x_shopify_shop_domain,
            db=db,
            webhook_data=webhook_data
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported webhook topic: {x_shopify_topic}"
        )
    
    return result
