from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from typing import Optional
import uuid
import os
import asyncio
import httpx

from integrations.shopify.api.schemas import (
    ConnectInputV1, ConnectOutputV1,
    PromoteInputV1, PromoteOutputV1,
    CampaignsOutputV1,
    DisconnectInputV1, DisconnectOutputV1,
    ErrorOutputV1
)
from integrations.shopify.services.integration_service import get_service, ShopifyIntegrationService
from integrations.shopify.persistence.repo import get_persistence
from integrations.shopify.services.feature_flags import (
    FF_SHOPIFY_APP_ENABLED as _FF_SHOPIFY_APP_ENABLED,
    check_feature_flag_enabled
)

# Make FF_SHOPIFY_APP_ENABLED available for patching in tests
FF_SHOPIFY_APP_ENABLED = _FF_SHOPIFY_APP_ENABLED
from integrations.shopify.services.observability import (
    log_shopify_action,
    record_metric,
    create_trace_span,
    SHOPIFY_ACTION_LATENCY
)
from sqlalchemy.orm import Session
from packages.db.database import get_db
from packages.db.models import ShopifyConnection
import time

router = APIRouter(prefix="/integrations/shopify", tags=["Shopify Integration"])

# Shopify OAuth Configuration
SHOPIFY_API_KEY = os.getenv("SHOPIFY_API_KEY")
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET")
SHOPIFY_APP_URL = os.getenv("SHOPIFY_APP_URL", "")
SHOPIFY_SCOPES = os.getenv("SHOPIFY_SCOPES", "read_products")


def create_error_response(
    error_code: str,
    error_message: str,
    retryable: bool,
    correlation_id: str,
    status_code: int = 400
) -> ErrorOutputV1:
    """Create a stable error response with ErrorOutputV1 shape."""
    return ErrorOutputV1(
        contract_version="output_contract_v1",
        error_code=error_code,
        error_message=error_message,
        retryable=retryable,
        correlation_id=correlation_id
    )


def check_app_enabled():
    """Check if Shopify app is enabled via feature flag."""
    if not FF_SHOPIFY_APP_ENABLED:
        correlation_id = f"corr_{uuid.uuid4().hex[:8]}"
        error_response = create_error_response(
            error_code="FEATURE_DISABLED",
            error_message="Shopify app is currently disabled",
            retryable=False,
            correlation_id=correlation_id
        )
        raise HTTPException(
            status_code=503,
            detail=error_response.dict()
        )
@router.post("/connect", response_model=ConnectOutputV1)
async def connect(
    input_data: ConnectInputV1,
    service: ShopifyIntegrationService = Depends(get_service)
):
    """Connect Shopify store to Kaivo workspace."""
    check_app_enabled()
    
    correlation_id = input_data.correlation_id if hasattr(input_data, 'correlation_id') else f"corr_{uuid.uuid4().hex[:8]}"
    start_time = time.time()
    
    with create_trace_span("connect", input_data.shop_domain):
        log_shopify_action(
            action="connect_started",
            shop_domain=input_data.shop_domain,
            correlation_id=correlation_id
        )
        
        try:
            result = await service.connect(input_data)
            
            # Record metrics
            record_metric(
                "shopify_connect_total",
                {
                    "shop_domain": input_data.shop_domain,
                    "workspace_id": result.workspace_id
                }
            )
            
            latency = time.time() - start_time
            SHOPIFY_ACTION_LATENCY.labels(
                action="connect",
                shop_domain=input_data.shop_domain
            ).observe(latency)
            
            log_shopify_action(
                action="connect_completed",
                shop_domain=input_data.shop_domain,
                workspace_id=result.workspace_id,
                correlation_id=correlation_id,
                latency_seconds=latency
            )
            
            return result
            
        except HTTPException:
            raise
        except Exception as e:
            latency = time.time() - start_time
            record_metric(
                "shopify_error_total",
                {
                    "shop_domain": input_data.shop_domain,
                    "error_code": "CONNECT_ERROR",
                    "retryable": "true"
                }
            )
            log_shopify_action(
                action="connect_error",
                shop_domain=input_data.shop_domain,
                correlation_id=correlation_id,
                error=str(e),
                latency_seconds=latency
            )
            error_response = create_error_response(
                error_code="CONNECT_ERROR",
                error_message=str(e),
                retryable=True,
                correlation_id=correlation_id
            )
            raise HTTPException(
                status_code=500,
                detail=error_response.dict()
            )

@router.post("/promote", response_model=PromoteOutputV1)
async def promote(
    input_data: PromoteInputV1,
    service: ShopifyIntegrationService = Depends(get_service)
):
    """
    Promote a product - creates a Kaivo promotion campaign.
    For Milestone 1: Product data should be provided in request.
    """
    check_app_enabled()
    
    correlation_id = input_data.correlation_id or f"corr_{uuid.uuid4().hex[:12]}"
    start_time = time.time()
    
    with create_trace_span("promote", input_data.shop_domain):
        log_shopify_action(
            action="promote_started",
            shop_domain=input_data.shop_domain,
            workspace_id=None,  # Will be fetched from service
            correlation_id=correlation_id,
            product_id=input_data.product.shopify_product_id,
            goal=input_data.presets.goal.value,
            budget=input_data.presets.daily_budget_usd
        )
        
        try:
            result = await service.promote(input_data)
            
            # Record metrics
            record_metric(
                "shopify_promote_total",
                {
                    "shop_domain": input_data.shop_domain,
                    "workspace_id": "",  # Could fetch from service if needed
                    "status": result.status.value
                }
            )
            
            latency = time.time() - start_time
            SHOPIFY_ACTION_LATENCY.labels(
                action="promote",
                shop_domain=input_data.shop_domain
            ).observe(latency)
            
            log_shopify_action(
                action="promote_completed",
                shop_domain=input_data.shop_domain,
                correlation_id=correlation_id,
                campaign_id=result.kaivo_campaign_id,
                status=result.status.value,
                latency_seconds=latency
            )
            
            return result
            
        except HTTPException as e:
            latency = time.time() - start_time
            error_code = "PROMOTE_ERROR"
            retryable = e.status_code >= 500
            
            record_metric(
                "shopify_error_total",
                {
                    "shop_domain": input_data.shop_domain,
                    "error_code": error_code,
                    "retryable": "true" if retryable else "false"
                }
            )
            
            log_shopify_action(
                action="promote_error",
                shop_domain=input_data.shop_domain,
                correlation_id=correlation_id,
                error_code=error_code,
                error_message=str(e.detail),
                retryable=retryable,
                latency_seconds=latency
            )
            raise
            
        except Exception as e:
            latency = time.time() - start_time
            record_metric(
                "shopify_error_total",
                {
                    "shop_domain": input_data.shop_domain,
                    "error_code": "PROMOTE_ERROR",
                    "retryable": "true"
                }
            )
            log_shopify_action(
                action="promote_error",
                shop_domain=input_data.shop_domain,
                correlation_id=correlation_id,
                error=str(e),
                latency_seconds=latency
            )
            error_response = create_error_response(
                error_code="PROMOTE_ERROR",
                error_message=str(e),
                retryable=True,
                correlation_id=correlation_id
            )
            raise HTTPException(
                status_code=500,
                detail=error_response.dict()
            )

@router.get("/campaigns", response_model=CampaignsOutputV1)
async def list_campaigns(
    shop_domain: str,
    correlation_id: Optional[str] = None,
    service: ShopifyIntegrationService = Depends(get_service)
):
    """List campaigns created via Shopify app."""
    print(f"[Shopify List Campaigns] ========== Request Received ==========")
    print(f"[Shopify List Campaigns] Shop domain (raw): {shop_domain}")
    print(f"[Shopify List Campaigns] Correlation ID: {correlation_id}")
    
    check_app_enabled()
    
    # Normalize shop domain for consistent lookup
    normalized_shop_domain = shop_domain.lower().strip()
    print(f"[Shopify List Campaigns] Normalized shop domain: {normalized_shop_domain}")
    
    if not correlation_id:
        correlation_id = f"corr_{uuid.uuid4().hex[:8]}"
        print(f"[Shopify List Campaigns] Generated correlation ID: {correlation_id}")
    
    start_time = time.time()
    
    with create_trace_span("list_campaigns", normalized_shop_domain):
        log_shopify_action(
            action="list_campaigns_started",
            shop_domain=normalized_shop_domain,
            correlation_id=correlation_id
        )
        
        try:
            print(f"[Shopify List Campaigns] Calling service.list_campaigns...")
            result = await service.list_campaigns(normalized_shop_domain, correlation_id)
            
            print(f"[Shopify List Campaigns] Service returned {len(result.campaigns)} campaigns")
            for idx, campaign in enumerate(result.campaigns):
                print(f"[Shopify List Campaigns] Campaign {idx + 1}: {campaign.kaivo_campaign_id} - {campaign.status}")
            
            latency = time.time() - start_time
            SHOPIFY_ACTION_LATENCY.labels(
                action="list_campaigns",
                shop_domain=normalized_shop_domain
            ).observe(latency)
            
            log_shopify_action(
                action="list_campaigns_completed",
                shop_domain=normalized_shop_domain,
                correlation_id=correlation_id,
                campaign_count=len(result.campaigns),
                latency_seconds=latency
            )
            
            print(f"[Shopify List Campaigns] ✅ Returning {len(result.campaigns)} campaigns")
            print(f"[Shopify List Campaigns] ==============================================")
            return result
            
        except Exception as e:
            latency = time.time() - start_time
            record_metric(
                "shopify_error_total",
                {
                    "shop_domain": normalized_shop_domain,
                    "error_code": "LIST_CAMPAIGNS_ERROR",
                    "retryable": "true"
                }
            )
            log_shopify_action(
                action="list_campaigns_error",
                shop_domain=normalized_shop_domain,
                correlation_id=correlation_id,
                error=str(e),
                latency_seconds=latency
            )
            error_response = create_error_response(
                error_code="LIST_CAMPAIGNS_ERROR",
                error_message=str(e),
                retryable=True,
                correlation_id=correlation_id
            )
            raise HTTPException(
                status_code=500,
                detail=error_response.dict()
            )

@router.post("/disconnect", response_model=DisconnectOutputV1)
async def disconnect(
    input_data: DisconnectInputV1,
    service: ShopifyIntegrationService = Depends(get_service)
):
    """Disconnect Shopify store from Kaivo."""
    check_app_enabled()
    
    correlation_id = f"corr_{uuid.uuid4().hex[:8]}"
    start_time = time.time()
    
    with create_trace_span("disconnect", input_data.shop_domain):
        log_shopify_action(
            action="disconnect_started",
            shop_domain=input_data.shop_domain,
            correlation_id=correlation_id
        )
        
        try:
            result = await service.disconnect(input_data)
            
            latency = time.time() - start_time
            SHOPIFY_ACTION_LATENCY.labels(
                action="disconnect",
                shop_domain=input_data.shop_domain
            ).observe(latency)
            
            log_shopify_action(
                action="disconnect_completed",
                shop_domain=input_data.shop_domain,
                correlation_id=correlation_id,
                latency_seconds=latency
            )
            
            return result
            
        except Exception as e:
            latency = time.time() - start_time
            record_metric(
                "shopify_error_total",
                {
                    "shop_domain": input_data.shop_domain,
                    "error_code": "DISCONNECT_ERROR",
                    "retryable": "false"
                }
            )
            log_shopify_action(
                action="disconnect_error",
                shop_domain=input_data.shop_domain,
                correlation_id=correlation_id,
                error=str(e),
                latency_seconds=latency
            )
            error_response = create_error_response(
                error_code="DISCONNECT_ERROR",
                error_message=str(e),
                retryable=False,
                correlation_id=correlation_id
            )
            raise HTTPException(
                status_code=500,
                detail=error_response.dict()
            )

@router.get("/auth")
async def initiate_oauth(
    shop: str = Query(..., description="Shop domain (e.g., example.myshopify.com)"),
    host: Optional[str] = Query(None, description="Shopify host parameter for embedded apps"),
    db: Session = Depends(get_db)
):
    """
    Initiate Shopify OAuth flow. Redirects user to Shopify authorization page.
    For embedded apps, host parameter is preserved through the OAuth flow.
    """
    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        raise HTTPException(status_code=500, detail="Shopify credentials not configured")
    
    # Generate state for CSRF protection
    # If host is provided, encode it in state to preserve through OAuth flow
    state = uuid.uuid4().hex
    if host:
        # Encode host in state: state|host (simple encoding)
        import base64
        host_encoded = base64.b64encode(host.encode()).decode()
        state = f"{state}|{host_encoded}"
    
    # Build Shopify OAuth URL
    # For embedded apps, redirect URI should point to backend
    # Frontend will proxy this through /api/proxy/integrations/shopify/auth/callback
    redirect_uri = f"{SHOPIFY_APP_URL}/api/proxy/integrations/shopify/auth/callback"
    oauth_url = (
        f"https://{shop}/admin/oauth/authorize"
        f"?client_id={SHOPIFY_API_KEY}"
        f"&scope={SHOPIFY_SCOPES}"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )
    
    print(f"[Shopify OAuth] ========== OAuth Initiation Started ==========")
    print(f"[Shopify OAuth] Shop: {shop}")
    print(f"[Shopify OAuth] Host: {host}")
    print(f"[Shopify OAuth] State: {state[:20]}... (full: {state})")
    print(f"[Shopify OAuth] Redirect URI: {redirect_uri}")
    print(f"[Shopify OAuth] OAuth URL: {oauth_url}")
    print(f"[Shopify OAuth] Scopes: {SHOPIFY_SCOPES}")
    print(f"[Shopify OAuth] API Key: {SHOPIFY_API_KEY[:10]}...")
    print(f"[Shopify OAuth] Returning 307 redirect to Shopify OAuth page")
    print(f"[Shopify OAuth] ==============================================")
    return RedirectResponse(url=oauth_url)

@router.get("/auth/callback")
async def oauth_callback(
    shop: str = Query(...),
    code: str = Query(...),
    state: str = Query(...),
    host: Optional[str] = Query(None, description="Shopify host parameter for embedded apps"),
    db: Session = Depends(get_db)
):
    """
    Handle Shopify OAuth callback. Exchanges code for access token and stores it.
    If host parameter is present, redirects to embedded app URL.
    Otherwise, returns HTML for popup flow.
    """
    print(f"[Shopify Callback] ========== OAuth Callback Received ==========")
    print(f"[Shopify Callback] Shop: {shop}")
    print(f"[Shopify Callback] Code: {code[:20]}... (length: {len(code)})")
    print(f"[Shopify Callback] State: {state[:50]}... (length: {len(state)})")
    print(f"[Shopify Callback] Host (query param): {host}")
    
    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        print(f"[Shopify Callback] ❌ ERROR: Shopify credentials not configured")
        raise HTTPException(status_code=500, detail="Shopify credentials not configured")
    
    try:
        # Exchange code for access token
        token_url = f"https://{shop}/admin/oauth/access_token"
        print(f"[Shopify Callback] Step 1: Exchanging code for access token")
        print(f"[Shopify Callback] Token URL: {token_url}")
        
        async with httpx.AsyncClient() as client:
            print(f"[Shopify Callback] Step 1.1: Making POST request to token endpoint")
            response = await client.post(
                token_url,
                json={
                    "client_id": SHOPIFY_API_KEY,
                    "client_secret": SHOPIFY_API_SECRET,
                    "code": code
                }
            )
            print(f"[Shopify Callback] Step 1.2: Token response status: {response.status_code}")
            response.raise_for_status()
            token_data = response.json()
            print(f"[Shopify Callback] Step 1.3: Token response received (has access_token: {'access_token' in token_data})")
        
        access_token = token_data.get("access_token")
        scope = token_data.get("scope", "")
        
        print(f"[Shopify Callback] Step 2: Extracted access token (length: {len(access_token) if access_token else 0})")
        print(f"[Shopify Callback] Step 2.1: Scope: {scope}")
        
        if not access_token:
            print(f"[Shopify Callback] ❌ ERROR: No access token in response")
            print(f"[Shopify Callback] Token data keys: {list(token_data.keys())}")
            raise HTTPException(status_code=400, detail="Failed to get access token")
        
        # Normalize shop domain (lowercase, trim)
        normalized_shop = shop.lower().strip()
        
        # Save connection to database - BLOCKING until fully committed
        persistence = get_persistence(db)
        workspace_id = f"ws_{uuid.uuid4().hex[:8]}"  # Generate workspace ID
        
        print(f"[Shopify Callback] Step 1: Saving connection for shop: {normalized_shop}")
        connection = persistence.save_connection(
            shop_domain=normalized_shop,
            access_token=access_token,
            scope=scope,
            workspace_id=workspace_id
        )
        
        # Force flush and commit to ensure transaction is visible
        db.flush()
        db.commit()
        db.refresh(connection)
        
        print(f"[Shopify Callback] Step 2: Connection committed. ID: {connection.id if hasattr(connection, 'id') else 'N/A'}")
        
        # CRITICAL: Verify connection exists with retry loop (handles DB replication lag)
        # This ensures the connection is visible before we return success
        max_verify_retries = 5
        verify_retry_delay = 0.2  # 200ms between retries
        connection_verified = False
        
        for attempt in range(max_verify_retries):
            # Use a fresh query to verify (bypasses any session cache)
            verify_connection = db.query(ShopifyConnection).filter(
                ShopifyConnection.shop_domain == normalized_shop
            ).first()
            
            if verify_connection and verify_connection.access_token:
                print(f"[Shopify Callback] Step 3: Connection verified in DB (attempt {attempt + 1})")
                connection_verified = True
                break
            else:
                print(f"[Shopify Callback] Step 3: Verification attempt {attempt + 1} failed, retrying...")
                await asyncio.sleep(verify_retry_delay)
                db.commit()  # Refresh session
        
        if not connection_verified:
            print(f"[Shopify Callback] ERROR: Connection could not be verified after {max_verify_retries} attempts")
            raise HTTPException(status_code=500, detail="Failed to verify connection was saved")
        
        print(f"[Shopify Callback] Step 4: Connection fully verified")
        
        # Extract host from state if not in query params (for embedded apps)
        # State format: uuid|base64_encoded_host
        callback_host = host
        if not callback_host and '|' in state:
            try:
                import base64
                state_parts = state.split('|', 1)
                if len(state_parts) == 2:
                    callback_host = base64.b64decode(state_parts[1]).decode()
                    print(f"[Shopify Callback] Extracted host from state: {callback_host}")
            except Exception as e:
                print(f"[Shopify Callback] Failed to extract host from state: {e}")
        
        # If host parameter is present, this is an embedded app installation
        # Redirect to frontend embedded app URL
        if callback_host:
            frontend_url = SHOPIFY_APP_URL
            embedded_url = f"{frontend_url}/integrations/shopify?shop={normalized_shop}&host={callback_host}"
            print(f"[Shopify Callback] Step 5: Host parameter found - redirecting to embedded app")
            print(f"[Shopify Callback] Frontend URL: {frontend_url}")
            print(f"[Shopify Callback] Embedded URL: {embedded_url}")
            print(f"[Shopify Callback] Returning 302 redirect to embedded app")
            print(f"[Shopify Callback] ==============================================")
            return RedirectResponse(url=embedded_url)
        
        # Otherwise, return HTML page for popup flow
        print(f"[Shopify Callback] Returning HTML for popup flow")
        
        # Return HTML page that shows "connecting" first, then polls for confirmation
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Connecting Shopify...</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }}
                .container {{
                    text-align: center;
                    padding: 40px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    backdrop-filter: blur(10px);
                }}
                .icon {{
                    font-size: 64px;
                    margin-bottom: 20px;
                }}
                .spinner {{
                    display: inline-block;
                    width: 64px;
                    height: 64px;
                    border: 4px solid rgba(255, 255, 255, 0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                }}
                @keyframes spin {{
                    to {{ transform: rotate(360deg); }}
                }}
                h1 {{ margin: 0 0 10px 0; font-size: 28px; }}
                p {{ margin: 0; opacity: 0.9; }}
                .success-state {{
                    display: none;
                }}
                .connecting-state {{
                    display: block;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="connecting-state" id="connectingState">
                    <div class="spinner"></div>
                    <h1>Connecting your store...</h1>
                    <p>Please wait while we verify the connection.</p>
                </div>
                <div class="success-state" id="successState">
                    <div class="icon">✓</div>
                    <h1>Shopify Store Connected!</h1>
                    <p>You can close this window now.</p>
                </div>
            </div>
            <script>
                const shopDomain = '{normalized_shop}';
                const workspaceId = '{workspace_id}';
                let isResolved = false;
                let pollCount = 0;
                const maxPolls = 40; // 40 * 400ms = 16 seconds max
                const pollInterval = 400; // Poll every 400ms
                
                // Function to check connection status
                async function checkConnectionStatus() {{
                    if (isResolved) return;
                    
                    pollCount++;
                    console.log(`[Shopify Callback] Polling attempt ${{pollCount}}/${{maxPolls}}`);
                    
                    if (pollCount > maxPolls) {{
                        console.warn('[Shopify Callback] Max polls reached, but backend confirmed save - showing success');
                        // Backend already verified the save, so show success anyway
                        notifyParentAndShowSuccess();
                        return;
                    }}
                    
                    try {{
                        // Call status endpoint directly (we're on the backend origin)
                        const statusUrl = `/integrations/shopify/status?shop_domain=${{encodeURIComponent(shopDomain)}}`;
                        const response = await fetch(statusUrl, {{
                            cache: 'no-store', // Ensure fresh request
                            headers: {{ 'Cache-Control': 'no-cache' }}
                        }});
                        
                        if (!response.ok) {{
                            throw new Error(`Status check failed: ${{response.status}}`);
                        }}
                        
                        const data = await response.json();
                        console.log('[Shopify Callback] Status check response:', data);
                        
                        if (data.connected === true) {{
                            console.log('[Shopify Callback] Connection confirmed via status endpoint!');
                            notifyParentAndShowSuccess();
                        }} else {{
                            // Continue polling
                            setTimeout(checkConnectionStatus, pollInterval);
                        }}
                    }} catch (error) {{
                        console.error('[Shopify Callback] Error checking status:', error);
                        // Retry after delay (network errors are transient)
                        setTimeout(checkConnectionStatus, pollInterval);
                    }}
                }}
                
                // Function to notify parent and show success
                function notifyParentAndShowSuccess() {{
                    if (isResolved) return;
                    isResolved = true;
                    
                    console.log('[Shopify Callback] Resolving connection, notifying parent...');
                    
                    // Notify parent window immediately
                    if (window.opener && !window.opener.closed) {{
                        const message = {{
                            type: 'SHOPIFY_AUTH_SUCCESS',
                            shop_domain: shopDomain,
                            workspace_id: workspaceId
                        }};
                        console.log('[Shopify Callback] Sending postMessage to parent:', message);
                        
                        // Send multiple times to ensure delivery (handles race conditions)
                        window.opener.postMessage(message, '*');
                        setTimeout(() => {{
                            if (window.opener && !window.opener.closed) {{
                                window.opener.postMessage(message, '*');
                            }}
                        }}, 100);
                        setTimeout(() => {{
                            if (window.opener && !window.opener.closed) {{
                                window.opener.postMessage(message, '*');
                            }}
                        }}, 300);
                        
                        console.log('[Shopify Callback] postMessage sent successfully');
                    }} else {{
                        console.warn('[Shopify Callback] window.opener is null or closed, cannot send postMessage');
                    }}
                    
                    // Show success state
                    document.getElementById('connectingState').style.display = 'none';
                    document.getElementById('successState').style.display = 'block';
                    
                    // Auto-close after 2.5 seconds (gives time for postMessage to be received)
                    setTimeout(() => {{
                        try {{
                            window.close();
                        }} catch (e) {{
                            console.log('[Shopify Callback] Could not auto-close window');
                        }}
                    }}, 2500);
                }}
                
                // Start checking connection status after a short delay
                // Backend already verified the save, but we poll to ensure visibility
                // Initial delay ensures DB transaction is fully committed and visible
                setTimeout(() => {{
                    console.log('[Shopify Callback] Starting status polling...');
                    checkConnectionStatus();
                }}, 500); // 500ms initial delay
            </script>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content)
        
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Shopify API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth callback error: {str(e)}")

@router.get("/auth/session")
async def verify_shopify_session(
    shop: str = Query(..., description="Shop domain (e.g., example.myshopify.com)"),
    host: Optional[str] = Query(None, description="Shopify host parameter"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """
    Verify Shopify session when embedded app loads.
    
    For embedded apps: Verifies session token from Authorization header (required for compliance).
    Checks if store is connected and returns connection status.
    """
    authenticated_via_session_token = False
    user_id = None
    
    # Verify session token if provided (embedded app context)
    if authorization and authorization.startswith("Bearer "):
        from integrations.shopify.services.session_token import verify_session_token, SessionTokenError
        
        token = authorization.replace("Bearer ", "").strip()
        try:
            payload = verify_session_token(token)
            authenticated_via_session_token = True
            user_id = payload.get("sub")
            
            # Extract shop from token
            token_shop = payload.get("dest", "").replace("https://", "").replace("http://", "")
            
            log_shopify_action(
                action="session_verified",
                shop_domain=token_shop,
                user_id=user_id,
                message="Session token verified successfully"
            )
            
            # Update shop param from token if different
            if token_shop and token_shop != shop:
                shop = token_shop
                
        except SessionTokenError as e:
            log_shopify_action(
                action="session_verification_failed",
                shop_domain=shop,
                error=str(e)
            )
            raise HTTPException(status_code=401, detail=f"Session token verification failed: {str(e)}")
    
    normalized_shop = shop.lower().strip()
    persistence = get_persistence(db)
    connection = persistence.get_connection(normalized_shop)
    
    if not connection:
        return {
            "authenticated": authenticated_via_session_token,
            "shop": shop,
            "connected": False,
            "requires_install": True,
            "user_id": user_id
        }
    
    return {
        "authenticated": authenticated_via_session_token,
        "shop": shop,
        "connected": True,
        "workspace_id": connection.workspace_id,
        "installed_at": connection.installed_at.isoformat() if connection.installed_at else None,
        "scope": connection.scope,
        "user_id": user_id
    }

@router.get("/status")
async def get_connection_status(
    shop_domain: str = Query(..., description="Shop domain (e.g., example.myshopify.com)"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """
    Get connection status for a Shopify store.
    
    For embedded apps: Verifies session token from Authorization header.
    For non-embedded: Works without authentication (public status check).
    """
    # If Authorization header present, verify session token (embedded app context)
    if authorization and authorization.startswith("Bearer "):
        from integrations.shopify.services.session_token import verify_session_token, SessionTokenError
        
        token = authorization.replace("Bearer ", "").strip()
        try:
            payload = verify_session_token(token)
            # Extract shop from token
            token_shop = payload.get("dest", "").replace("https://", "").replace("http://", "")
            log_shopify_action(
                action="status_check_authenticated",
                shop_domain=token_shop,
                user_id=payload.get("sub"),
                message="Status check with valid session token"
            )
        except SessionTokenError as e:
            log_shopify_action(
                action="status_check_auth_failed",
                shop_domain=shop_domain,
                error=str(e)
            )
            raise HTTPException(status_code=401, detail=f"Session token verification failed: {str(e)}")
    
    # Normalize shop domain (lowercase, trim) for consistent lookup
    normalized_domain = shop_domain.lower().strip()
    
    print(f"[Shopify Status] Checking connection for shop: {normalized_domain} (original: {shop_domain})")
    
    persistence = get_persistence(db)
    connection = persistence.get_connection(normalized_domain)
    
    # Also try original case in case normalization wasn't used during save
    if not connection:
        connection = persistence.get_connection(shop_domain)
        if connection:
            print(f"[Shopify Status] Found connection with original case: {shop_domain}")
    
    if connection:
        print(f"[Shopify Status] Connection found: {connection.shop_domain}, workspace: {connection.workspace_id}")
        return {
            "connected": True,
            "shop_domain": shop_domain,
            "workspace_id": connection.workspace_id,
            "installed_at": connection.installed_at.isoformat() if connection.installed_at else None,
            "scope": connection.scope
        }
    else:
        print(f"[Shopify Status] No connection found for: {normalized_domain}")
        # Debug: List all connections in DB
        all_connections = db.query(ShopifyConnection).all()
        print(f"[Shopify Status] Total connections in DB: {len(all_connections)}")
        for conn in all_connections:
            print(f"[Shopify Status]   - DB has: {conn.shop_domain}")
        return {
            "connected": False,
            "shop_domain": shop_domain
        }

@router.delete("/disconnect")
async def disconnect_store(
    shop_domain: str = Query(..., description="Shop domain (e.g., example.myshopify.com)"),
    db: Session = Depends(get_db)
):
    """
    Disconnect a Shopify store by removing the stored access token.
    """
    persistence = get_persistence(db)
    connection = persistence.get_connection(shop_domain)
    
    if not connection:
        raise HTTPException(status_code=404, detail="Store connection not found")
    
    # Delete the connection from database
    db.delete(connection)
    db.commit()
    
    return {
        "status": "success",
        "shop_domain": shop_domain,
        "message": "Store disconnected successfully"
    }

@router.get("/products")
async def list_products(
    shop_domain: str = Query(..., description="Shop domain (e.g., example.myshopify.com)"),
    limit: int = Query(50, ge=1, le=250, description="Number of products to return (max 250)"),
    db: Session = Depends(get_db)
):
    """
    List products from connected Shopify store (Real API call).
    """
    # Get connection and access token
    persistence = get_persistence(db)
    connection = persistence.get_connection(shop_domain)
    
    if not connection:
        raise HTTPException(
            status_code=404,
            detail=f"Shop {shop_domain} is not connected. Please connect first via /auth"
        )
    
    access_token = connection.access_token
    
    try:
        # Call Shopify Admin API - GET /admin/api/2024-10/products.json
        api_url = f"https://{shop_domain}/admin/api/2024-10/products.json"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                api_url,
                headers={
                    "X-Shopify-Access-Token": access_token,
                    "Content-Type": "application/json"
                },
                params={
                    "limit": limit
                }
            )
            response.raise_for_status()
            data = response.json()
        
        # Extract products from response
        products = data.get("products", [])
        
        # Normalize response (extract key fields)
        normalized_products = []
        for product in products:
            normalized_products.append({
                "id": product.get("id"),
                "title": product.get("title"),
                "handle": product.get("handle"),
                "status": product.get("status"),
                "vendor": product.get("vendor"),
                "product_type": product.get("product_type"),
                "created_at": product.get("created_at"),
                "updated_at": product.get("updated_at"),
                "variants_count": len(product.get("variants", [])),
                "images_count": len(product.get("images", [])),
                # First image URL if available
                "image_url": product.get("images", [{}])[0].get("src") if product.get("images") else None
            })
        
        return {
            "shop_domain": shop_domain,
            "products": normalized_products,
            "count": len(normalized_products),
            "total": data.get("products", [])  # Full response available if needed
        }
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid or expired access token")
        elif e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Shop not found or access denied")
        else:
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Shopify API error: {e.response.text}"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching products: {str(e)}")

@router.post("/promote-by-id", response_model=PromoteOutputV1)
async def promote_by_product_id(
    shop_domain: str = Query(...),
    product_id: str = Query(..., description="Shopify product ID"),
    goal: str = Query("TRAFFIC", description="Campaign goal: SALES, TRAFFIC, or AWARENESS"),
    daily_budget_usd: float = Query(10.0, description="Daily budget in USD"),
    channels: str = Query("DEFAULT_MIX", description="Channels preset"),
    correlation_id: Optional[str] = None,
    service: ShopifyIntegrationService = Depends(get_service),
    db: Session = Depends(get_db)
):
    """
    Promote a product by fetching it from Shopify API first (Real API call for Milestone 1).
    This endpoint fetches product data from Shopify, then creates promotion.
    """
    from integrations.shopify.api.schemas import GoalPreset, ChannelsPreset, PromotePresets
    from datetime import datetime, timezone
    
    try:
        # Fetch product from Shopify (Real API call)
        normalized_product = await service._fetch_product_from_shopify(shop_domain, product_id)
        
        # Build PromoteInputV1
        promote_input = PromoteInputV1(
            contract_version="input_contract_v1",
            correlation_id=correlation_id,
            shop_domain=shop_domain,
            product=normalized_product,
            presets=PromotePresets(
                goal=GoalPreset(goal),
                daily_budget_usd=daily_budget_usd,
                channels=ChannelsPreset(channels)
            ),
            requested_at=datetime.now(timezone.utc).isoformat()
        )
        
        # Call promote service
        return await service.promote(promote_input)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error promoting product: {str(e)}")
