from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from redis import Redis
import os
import logging
import uuid
import time
import random
from pathlib import Path
from dotenv import load_dotenv
from typing import Optional, Callable, Any, Dict
from collections import defaultdict
import threading

# Configure Logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
# Try root directory first (where backend is typically run from)
root_dir = Path(__file__).parent.parent.parent  # Go up from services/api_gateway/main.py to project root
env_path = root_dir / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
    logger.info(f"Loaded .env from: {env_path}")
    # Verify token was loaded
    token_check = os.getenv("META_ACCESS_TOKEN")
    logger.info(f"META_ACCESS_TOKEN loaded: {'Yes' if token_check else 'No'} (length: {len(token_check) if token_check else 0})")
else:
    # Fallback to current directory
    load_dotenv()
    logger.warning(f".env not found at {env_path}, trying current directory")
    token_check = os.getenv("META_ACCESS_TOKEN")
    logger.info(f"META_ACCESS_TOKEN loaded: {'Yes' if token_check else 'No'} (length: {len(token_check) if token_check else 0})")

# --- Environment Validation ---
def validate_environment():
    """
    Validate environment configuration for production readiness.
    Checks critical environment variables and environment-specific requirements.
    """
    env = os.getenv("ENVIRONMENT", "development")
    validation_errors = []

    # Required variables for all environments
    required_vars = [
        "META_ACCESS_TOKEN",
        "DATABASE_URL",
    ]

    # Environment-specific required variables
    if env in ["staging", "production"]:
        required_vars.extend([
            "REDIS_URL",
            "JWT_SECRET_KEY",
            # Add other production requirements
        ])

    # Check required variables
    for var in required_vars:
        if not os.getenv(var):
            validation_errors.append(f"Missing required environment variable: {var}")

    # Validate Meta token format (basic check)
    meta_token = os.getenv("META_ACCESS_TOKEN")
    if meta_token and len(meta_token) < 50:  # Basic length check
        validation_errors.append("META_ACCESS_TOKEN appears to be invalid (too short)")

    # Check database connectivity
    try:
        from packages.db.database import engine
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        validation_errors.append(f"Database connectivity failed: {e}")

    # Check Redis connectivity if in production
    if env in ["staging", "production"]:
        try:
            import redis
            redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))
            redis_client.ping()
        except Exception as e:
            validation_errors.append(f"Redis connectivity failed: {e}")

    # Environment-specific validations
    if env == "production":
        # Stricter checks for production
        if os.getenv("DEBUG", "false").lower() == "true":
            validation_errors.append("DEBUG should be disabled in production")

        # Check if we're not using default secrets
        jwt_secret = os.getenv("JWT_SECRET_KEY", "")
        if jwt_secret in ["", "your-secret-key-here", "development-secret"]:
            validation_errors.append("JWT_SECRET_KEY must be set to a secure value in production")

    return validation_errors

# Validate environment on startup
env_errors = validate_environment()
if env_errors:
    logger.error("Environment validation failed:")
    for error in env_errors:
        logger.error(f"  - {error}")
    
    # STRICT ENFORCEMENT: Exit on validation failure in staging/production
    env = os.getenv("ENVIRONMENT", "development")
    if env in ["staging", "production"]:
        logger.critical("Critical environment validation errors in production environment!")
        logger.critical("Service will not start. Fix environment configuration and restart.")
        import sys
        sys.exit(1)
    else:
        logger.warning("Environment validation failed in development mode. Service will continue but may not function correctly.")

# --- Environment Variable Enforcement ---
# (Removed restricted env checks for V1 strict compliance)

# Imports moved to Router Mounting section to strict hermetic testing
# from services.auth_service.main import app as auth_app
# ... (others moved)

app = FastAPI(
    title="KaivoCore Unified API v2.0",
    description="Unified API Gateway for KaivoCore v2.0 microservices.",
    version="2.0.0"
)

# ---------------------------------------------------------------------------
# Platform name normalization (URL path names → internal DB/registry names)
# ---------------------------------------------------------------------------
PLATFORM_URL_TO_INTERNAL = {
    "microsoft": "microsoft_ads",
    "facebook": "meta",
    "instagram": "meta",
    "google": "google_ads",
}

def normalize_platform_name(platform: str) -> str:
    """Map URL-facing platform slug to internal registry/DB name."""
    return PLATFORM_URL_TO_INTERNAL.get(platform, platform)

# ---------------------------------------------------------------------------
# Platform Credential Helpers (optional, DB-backed)
# ---------------------------------------------------------------------------
def resolve_platform_access_token(platform: str, account_id: Optional[int]) -> Optional[str]:
    """
    Resolve an access token from stored platform credentials.
    Returns None if account_id is missing, credentials not found, or DB unavailable.
    """
    creds = resolve_platform_credentials(platform, account_id)
    if creds:
        token = creds.get("access_token")
        return token if isinstance(token, str) and token.strip() else None
    return None

def resolve_platform_credentials(platform: str, account_id: Optional[int]) -> Optional[Dict[str, Any]]:
    """
    Resolve full credentials from stored platform credentials.
    """
    if account_id is None:
        return None

    try:
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        db = SessionLocal()
        try:
            return PlatformCredentialService.get_credentials(db, account_id, platform)
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Platform credentials lookup failed (platform={platform}, account_id={account_id}): {e}")
        return None

# --- CORS Configuration ---
# Allow specific domains for v2
origins = [
    "https://kaivocore.pages.dev",
    "https://app.getkaivo.com",
    "https://agency.getkaivo.com",
    "https://agency-staging.getkaivo.com",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
]

# Add FRONTEND_URL / NEXT_PUBLIC_APP_URL (e.g. ngrok) for local dev over tunnel
frontend_url = os.getenv("FRONTEND_URL") or os.getenv("NEXT_PUBLIC_APP_URL")
if frontend_url:
    frontend_url = frontend_url.rstrip("/")
    if frontend_url not in origins:
        origins.append(frontend_url)

# Add any extra origins from env
extra_origins = os.getenv("CORS_ALLOWED_ORIGINS")
if extra_origins:
    for o in extra_origins.split(","):
        o = o.strip().rstrip("/")
        if o and o not in origins:
            origins.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Proxy Route Handler ---
@app.get("/api/proxy/api/platforms/meta/ad-accounts")
async def proxy_meta_ad_accounts(request: Request):
    """Proxy for Meta ad accounts endpoint."""
    return await get_meta_ad_accounts(request)

@app.post("/api/proxy/api/platforms/meta/campaigns/{campaign_id}/launch")
async def proxy_meta_campaign_launch(campaign_id: str, request: Request):
    """Proxy for Meta campaign launch endpoint."""
    return await launch_meta_campaign(campaign_id, request)

# --- Correlation ID Middleware ---
@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    """Add correlation ID to all requests for observability."""
    # Get correlation ID from header or generate new one
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())

    # Add to request state for use in handlers
    request.state.correlation_id = correlation_id

    # Set in logger context for structured logging
    logger_adapter = logging.LoggerAdapter(logger, {"correlation_id": correlation_id})

    response = await call_next(request)

    # Add correlation ID to response headers
    response.headers["x-correlation-id"] = correlation_id

    return response

# --- Metrics Collection ---
class MetricsCollector:
    """Simple in-memory metrics collector for key business and technical metrics."""

    def __init__(self):
        self._metrics = defaultdict(lambda: defaultdict(int))
        self._timers = {}
        self._lock = threading.RLock()  # Use RLock to prevent deadlock in nested calls (stop_timer -> observe_histogram)

    def increment_counter(self, name: str, labels: Optional[Dict[str, str]] = None, value: int = 1):
        """Increment a counter metric."""
        key = f"{name}:{str(labels) if labels else ''}"
        with self._lock:
            self._metrics['counter'][key] += value

    def set_gauge(self, name: str, value: float, labels: Optional[Dict[str, str]] = None):
        """Set a gauge metric."""
        key = f"{name}:{str(labels) if labels else ''}"
        with self._lock:
            self._metrics['gauge'][key] = value

    def observe_histogram(self, name: str, value: float, labels: Optional[Dict[str, str]] = None):
        """Observe a histogram metric (store last value for simplicity)."""
        key = f"{name}:{str(labels) if labels else ''}"
        with self._lock:
            self._metrics['histogram'][key] = value

    def start_timer(self, name: str, labels: Optional[Dict[str, str]] = None):
        """Start a timer."""
        key = f"{name}:{str(labels) if labels else ''}"
        with self._lock:
            self._timers[key] = time.time()

    def stop_timer(self, name: str, labels: Optional[Dict[str, str]] = None):
        """Stop a timer and record duration."""
        key = f"{name}:{str(labels) if labels else ''}"
        with self._lock:
            if key in self._timers:
                duration = time.time() - self._timers[key]
                del self._timers[key]
                self.observe_histogram(f"{name}_duration", duration, labels)

    def get_metrics(self) -> Dict[str, Any]:
        """Get all metrics for reporting."""
        with self._lock:
            return dict(self._metrics)

# Global metrics collector
metrics = MetricsCollector()

# --- Retry Utility ---
def retry_with_exponential_backoff(
    func: Callable,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    backoff_factor: float = 2.0,
    jitter: bool = True
) -> Any:
    """
    Retry a function with exponential backoff.

    Args:
        func: Function to retry
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        backoff_factor: Exponential backoff multiplier
        jitter: Add random jitter to prevent thundering herd

    Returns:
        Result of the function call

    Raises:
        Last exception if all retries fail
    """
    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_exception = e

            if attempt == max_retries:
                # All retries exhausted
                raise e

            # Calculate delay with exponential backoff
            delay = min(base_delay * (backoff_factor ** attempt), max_delay)

            # Add jitter to prevent thundering herd
            if jitter:
                delay = delay * (0.5 + random.random() * 0.5)  # 50-100% of calculated delay

            logger.warning(f"Attempt {attempt + 1}/{max_retries + 1} failed: {e}. Retrying in {delay:.2f}s")
            time.sleep(delay)

    # This should never be reached, but just in case
    raise last_exception

# --- Router Mounting ---
# In TEST_MODE, skip mounting DB-dependent services to ensure hermetic testing
if os.getenv("TEST_MODE", "false").lower() != "true":
    from services.auth_service.main import app as auth_app
    from services.account_service.main import app as account_app
    from services.account_service.routers.agency import router as agency_router
    from services.agent_service.main import app as agent_app
    from services.audience_service.main import app as audience_app
    from services.billing_service.main import app as billing_app
    from services.campaign_service.main import app as campaign_app
    from services.creative_service.main import app as creative_app
    from services.intelligence_service.main import app as intelligence_app
    from services.policy_service.main import app as policy_app
    from services.reporting_service.main import app as reporting_app
    from services.i18n_service.main import app as i18n_app
    from integrations.shopify.api.main import router as shopify_router

    app.include_router(auth_app.router, prefix="/auth", tags=["Auth"])
    app.include_router(account_app.router, tags=["Accounts"])
    app.include_router(agency_router, tags=["Agency"])
    app.include_router(agent_app.router, tags=["Agent"])
    app.include_router(audience_app.router, tags=["Audiences"])
    app.include_router(billing_app.router, tags=["Billing"])
    app.include_router(campaign_app.router, prefix="/campaign", tags=["Campaigns"])
    app.include_router(creative_app.router, tags=["Creative"])
    app.include_router(i18n_app.router, prefix="/i18n", tags=["i18n"])
    app.include_router(intelligence_app.router, tags=["Intelligence"])
    app.include_router(policy_app.router, tags=["Policy"])
    app.include_router(reporting_app.router, tags=["Reporting"])

    # Shopify Integration (Gated)
    if os.getenv("FF_SHOPIFY_APP_ENABLED", "false").lower() == "true":
        from integrations.shopify.api.webhooks import router as shopify_webhook_router
        app.include_router(shopify_router)
        app.include_router(shopify_webhook_router)

# --- OS Runtime Activation ---
import httpx
from fastapi import Request, Query
from fastapi.responses import JSONResponse, RedirectResponse
import uuid
import hashlib
import hmac
from datetime import datetime

# Feature Flags
FF_OS_RUNTIME_ENABLED = os.getenv("FF_OS_RUNTIME_ENABLED", "false").lower() == "true"
OS_RUNTIME_URL = os.getenv("OS_RUNTIME_URL", "http://os-runtime-service:3000")

@app.get("/")
async def root():
    """
    Root endpoint - API information and links to available endpoints.
    """
    return {
        "service": "KaivoCore Unified API v2.0",
        "version": "2.0.0",
        "status": "running",
        "documentation": "/docs",
        "health": "/healthz",
        "capabilities": "/capabilities",
        "endpoints": {
            "auth": "/auth",
            "accounts": "/accounts",
            "agent": "/agent",
            "audiences": "/audiences",
            "billing": "/billing",
            "campaigns": "/campaigns",
            "creative": "/creative",
            "i18n": "/i18n",
            "intelligence": "/intelligence",
            "policy": "/policy",
            "reporting": "/reporting"
        }
    }

@app.get("/capabilities")
@app.get("/capabilities/")  # Add trailing slash route to prevent redirect loop
async def get_capabilities():
    """
    Returns the capabilities of the Kaivo OS.
    Source of truth for enabled features.
    """
    try:
        # Determine Feature Flags
        # Determine Feature Flags
        features = {
            "FF_SHOPIFY_APP_ENABLED": os.getenv("FF_SHOPIFY_APP_ENABLED", "false").lower() == "true",
            "FF_OS_RUNTIME_ENABLED": os.getenv("FF_OS_RUNTIME_ENABLED", "false").lower() == "true",
        }

        response = {
            "environment": os.getenv("NODE_ENV", "unknown"),
            "platforms": [], # Safe default: empty list implies no specific platforms detected yet
            "features": features
        }
        return response
    except Exception as e:
        logger.error(f"Error fetching capabilities: {e}")
        # Safe default on error
        return {
            "environment": "unknown",
            "platforms": [],
            "features": {}
        }

@app.post("/platforms/meta/test-connection")
async def test_meta_connection(request: Request):
    """
    Test Meta Ads API connection using access token.
    Accepts access_token in request body or uses META_ACCESS_TOKEN env var.
    """
    try:
        # Handle empty body gracefully
        try:
            body = await request.json()
        except Exception:
            body = {}
        access_token = body.get("access_token") if body else None
        if not access_token:
            access_token = os.getenv("META_ACCESS_TOKEN")
        
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "message": "Provide access_token in request body or set META_ACCESS_TOKEN environment variable"
                }
            )
        
        # Import and test connection
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("meta", credentials={"access_token": access_token})
        result = connector.test_connection(access_token=access_token)
        
        if result.get("success"):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=400)
            
    except Exception as e:
        logger.error(f"Meta connection test error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Connection test failed",
                "message": str(e)
            }
        )

@app.get("/platforms/meta/ad-accounts")
async def get_meta_ad_accounts(request: Request):
    """
    Fetch all Meta ad accounts for the authenticated user.
    Uses META_ACCESS_TOKEN from env or access_token from query param.
    """
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    logger_adapter = logging.LoggerAdapter(logger, {"correlation_id": correlation_id})

    # Start metrics collection
    logger_adapter.info("Incrementing meta_api_calls metric")
    metrics.increment_counter("meta_api_calls", {"endpoint": "ad_accounts"})
    logger_adapter.info(f"Current metrics: {metrics.get_metrics()}")

    try:
        # Check query param first, then env var
        access_token = request.query_params.get("access_token")
        account_id_raw = request.query_params.get("account_id")
        account_id: Optional[int] = None
        if account_id_raw:
            try:
                account_id = int(account_id_raw)
            except ValueError:
                account_id = None

        if not access_token:
            # If user stored credentials, prefer those (exact contract, no UI patching).
            creds = resolve_platform_credentials("meta", account_id)
            if creds:
                access_token = creds.get("access_token")
                logger.info(f"Using stored Meta access token for account_id={account_id}")
            else:
                access_token = os.getenv("META_ACCESS_TOKEN")
                logger.info(f"META_ACCESS_TOKEN from env: {'Found' if access_token else 'Not found'}")
        
        if not access_token:
            logger.warning("META_ACCESS_TOKEN not found in environment or query params")
            # Debug: Check if .env file exists
            env_file_exists = os.path.exists(".env")
            logger.warning(f".env file exists: {env_file_exists}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN",
                    "message": "Provide access_token query parameter or set META_ACCESS_TOKEN environment variable. Make sure backend .env file has META_ACCESS_TOKEN set and backend is restarted."
                }
            )
        
        logger.info(f"Fetching Meta ad accounts using token (length: {len(access_token) if access_token else 0})")
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("meta", credentials={"access_token": access_token})
        result = connector.fetch_ad_accounts(access_token=access_token, correlation_id=correlation_id)
        
        if result.get("success"):
            metrics.increment_counter("meta_api_success", {"endpoint": "ad_accounts"})
            return JSONResponse(content=result, status_code=200)
        else:
            metrics.increment_counter("meta_api_error", {"endpoint": "ad_accounts", "error_code": result.get("error_code", "unknown")})
            logger_adapter.error(f"Meta API returned error: {result.get('error')}")
            return JSONResponse(content=result, status_code=400)
            
    except Exception as e:
        logger.error(f"Meta fetch ad accounts error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to fetch ad accounts",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.get("/platforms/meta/campaigns")
async def get_meta_campaigns(request: Request):
    """
    Fetch campaigns for a specific Meta ad account.
    Query params: ad_account_id (required), access_token (optional), limit (optional, 1-100, default: 25)
    """
    try:
        ad_account_id = request.query_params.get("ad_account_id")
        access_token = request.query_params.get("access_token")
        account_id_raw = request.query_params.get("account_id")
        account_id: Optional[int] = None
        if account_id_raw:
            try:
                account_id = int(account_id_raw)
            except ValueError:
                account_id = None

        if not access_token:
            stored = resolve_platform_access_token("meta", account_id)
            if stored:
                access_token = stored
            else:
                access_token = os.getenv("META_ACCESS_TOKEN")
        
        # Validate limit parameter
        try:
            limit = int(request.query_params.get("limit", 25))
            if limit < 1 or limit > 100:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Limit must be between 1 and 100",
                        "error_code": "INVALID_LIMIT",
                        "message": "Provide limit query parameter between 1 and 100"
                    }
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Invalid limit parameter",
                    "error_code": "INVALID_LIMIT",
                    "message": "Limit must be a valid integer"
                }
            )
        
        if not ad_account_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing ad_account_id",
                    "error_code": "MISSING_PARAMETER",
                    "message": "Provide ad_account_id query parameter"
                }
            )
        
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN",
                    "message": "Provide access_token query parameter or set META_ACCESS_TOKEN environment variable"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("meta", credentials={"access_token": access_token})
        result = connector.fetch_campaigns(ad_account_id=ad_account_id, access_token=access_token, limit=limit)
        
        if result.get("success"):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=400)
            
    except Exception as e:
        logger.error(f"Meta fetch campaigns error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to fetch campaigns",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.post("/platforms/meta/ads")
async def create_meta_ad(request: Request):
    """
    Create a new ad in Meta Ads.
    Body: { ad_account_id, ad_set_id, ad_config, access_token (optional) }
    """
    try:
        body = await request.json()
        ad_account_id = body.get("ad_account_id")
        ad_set_id = body.get("ad_set_id")
        ad_config = body.get("ad_config", {})
        access_token = body.get("access_token") or os.getenv("META_ACCESS_TOKEN")
        
        if not ad_account_id or not ad_set_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing required parameters",
                    "error_code": "MISSING_PARAMETER",
                    "message": "Provide ad_account_id and ad_set_id in request body"
                }
            )
        
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN",
                    "message": "Provide access_token in request body or set META_ACCESS_TOKEN environment variable"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("meta", credentials={"access_token": access_token})
        result = connector.create_ad(ad_account_id, ad_set_id, ad_config, access_token)
        
        return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
            
    except Exception as e:
        logger.error(f"Create Meta ad error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to create ad",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.put("/platforms/meta/campaigns/{campaign_id}")
async def update_meta_campaign(campaign_id: str, request: Request):
    """
    Update a Meta campaign.
    Body: { campaign_config, access_token (optional) }
    """
    try:
        body = await request.json()
        campaign_config = body.get("campaign_config", {})
        access_token = body.get("access_token") or os.getenv("META_ACCESS_TOKEN")
        
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("meta", credentials={"access_token": access_token})
        result = connector.update_campaign(campaign_id, campaign_config, access_token)
        
        return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
            
    except Exception as e:
        logger.error(f"Update Meta campaign error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to update campaign",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.delete("/platforms/meta/campaigns/{campaign_id}")
async def delete_meta_campaign(campaign_id: str, request: Request):
    """
    Delete a Meta campaign.
    Query params: access_token (optional)
    """
    try:
        access_token = request.query_params.get("access_token") or os.getenv("META_ACCESS_TOKEN")
        
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("meta", credentials={"access_token": access_token})
        result = connector.delete_campaign(campaign_id, access_token)
        
        return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
            
    except Exception as e:
        logger.error(f"Delete Meta campaign error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to delete campaign",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.post("/platforms/meta/campaigns/{campaign_id}/launch")
async def launch_meta_campaign(campaign_id: str, request: Request):
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    logger_adapter = logging.LoggerAdapter(logger, {"correlation_id": correlation_id})

    # Start metrics collection
    metrics.start_timer("campaign_launch", {"platform": "meta", "correlation_id": correlation_id})
    metrics.increment_counter("campaign_launch_total", {"platform": "meta"})
    """
    Launch a campaign to Meta Ads platform.
    Body: { ad_account_id (required), campaign_config (optional), access_token (optional) }
    """
    try:
        body = await request.json()
        ad_account_id = body.get("ad_account_id")
        campaign_config = body.get("campaign_config", {})
        access_token = body.get("access_token") or os.getenv("META_ACCESS_TOKEN")

        # Normalize ad account id for deterministic hashing and metadata (store without "act_" prefix)
        normalized_ad_account = (
            ad_account_id.replace("act_", "")
            if isinstance(ad_account_id, str) and ad_account_id.startswith("act_")
            else ad_account_id
        )
        
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN",
                    "message": "Provide access_token in request body or set META_ACCESS_TOKEN environment variable"
                }
            )
        
        if not ad_account_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing ad_account_id",
                    "error_code": "MISSING_PARAMETER",
                    "message": "Provide ad_account_id in request body"
                }
            )
        
        # Get campaign details from database to build config
        from sqlalchemy.orm import Session
        from packages.db.database import get_db
        from packages.db.models import Campaign
        
        db_gen = get_db()
        db: Session = next(db_gen)
        try:
            campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()
            
            if not campaign:
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "error": "Campaign not found",
                        "error_code": "NOT_FOUND"
                    }
                )
            
            # Generate CANONICAL INTENT HASH for idempotency
            # Focus on user intent, not internal IDs - represents what user actually wants to achieve
            # This ensures same intent always produces same result, regardless of internal state
            import hashlib
            import json

            # Normalize ad_account_id (remove act_ prefix if present)
            normalized_ad_account = ad_account_id.replace("act_", "") if ad_account_id and ad_account_id.startswith("act_") else ad_account_id
            
            # Canonical intent data - what the user actually wants to achieve
            intent_data = {
                "goal": campaign.goal or "OUTCOME_TRAFFIC",  # User's objective
                "daily_budget_cents": int(campaign.total_budget_cents / 30),  # Normalized daily budget
                "platform_allocations": campaign.platform_allocations or {},  # How budget is distributed
                "ad_account_id": normalized_ad_account,  # Target account (normalized)
                "audience_id": campaign.audience_id,  # Targeting intent (represents user-defined audience)
            }

            # Sort keys for deterministic hashing, remove any None values
            canonical_intent = {k: v for k, v in intent_data.items() if v is not None}
            intent_json = json.dumps(canonical_intent, sort_keys=True, separators=(',', ':'))

            idempotency_key = hashlib.sha256(intent_json.encode('utf-8')).hexdigest()[:32]  # Use SHA256 for better security
            
            logger_adapter.info(f"Generated canonical intent hash for campaign {campaign_id}: {idempotency_key[:16]}... (intent: {intent_json[:100]}...)")

            # IDEMPOTENCY CHECK: If platform_campaign_id already exists, update existing campaign
            platform_ids = campaign.platform_campaign_ids or {}
            existing_meta_campaign_id = platform_ids.get("meta")

            # STRICT DETERMINISTIC MATCHING ONLY: No reconciliation
            # If platform_campaign_id exists, update. If not, create new.
            # Removed campaign-name reconciliation as per client requirements.

            if existing_meta_campaign_id:
                # Campaign already launched to Meta - update existing campaign (idempotent)
                logger_adapter.info(f"Campaign {campaign_id} already has Meta platform ID: {existing_meta_campaign_id}. Updating existing campaign.")
                
                from services.platform_service.connector_factory import get_connector
                
                connector = get_connector("meta", credentials={"access_token": access_token})
                
                # Build update config from campaign data
                update_config = {
                    "name": campaign.name,
                    "status": campaign_config.get("status", "PAUSED"),  # Allow status override
                }
                
                # Add budget if provided
                if campaign_config.get("daily_budget"):
                    update_config["daily_budget"] = campaign_config["daily_budget"]
                
                # Update existing Meta campaign
                update_result = connector.update_campaign(
                    platform_campaign_id=existing_meta_campaign_id,
                    campaign_config=update_config,
                    access_token=access_token,
                    correlation_id=correlation_id
                )
                
                if update_result.get("success"):
                    logger_adapter.info(f"Successfully updated Meta campaign {existing_meta_campaign_id} for Kaivo campaign {campaign_id}")
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "platform_campaign_id": existing_meta_campaign_id,
                            "status": "updated",
                            "message": "Campaign already launched to Meta. Updated existing platform campaign.",
                            "idempotent": True,
                            **update_result
                        }
                    )
                else:
                    # Update failed, return error
                    logger_adapter.error(f"Failed to update Meta campaign {existing_meta_campaign_id}: {update_result.get('error')}")
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "platform_campaign_id": existing_meta_campaign_id,
                            "status": "update_failed",
                            "error": update_result.get("error"),
                            "error_code": update_result.get("error_code"),
                            "message": "Campaign already launched but update failed."
                        }
                    )
            
            # Map campaign goal to Meta objective
            goal_mapping = {
                "conversion": "OUTCOME_TRAFFIC",
                "conversions": "OUTCOME_TRAFFIC",
                "traffic": "OUTCOME_TRAFFIC",
                "awareness": "OUTCOME_AWARENESS",
                "engagement": "OUTCOME_ENGAGEMENT",
                "leads": "OUTCOME_LEADS",
                "sales": "OUTCOME_SALES",
                "app_promotion": "OUTCOME_APP_PROMOTION"
            }
            campaign_goal = (campaign.goal or "traffic").lower()
            meta_objective = goal_mapping.get(campaign_goal, "OUTCOME_TRAFFIC")
            
            # Build campaign config for Meta
            # Note: objective is always set from campaign.goal mapping, not from campaign_config override
            meta_config = {
                "ad_account_id": ad_account_id,
                "name": campaign.name,
                "objective": meta_objective,  # Always use mapped objective from campaign.goal
                "status": campaign_config.get("status", "PAUSED"),  # Allow status override
                "daily_budget": campaign.total_budget_cents / 100.0 / 30.0,  # Convert to daily (rough estimate)
                "access_token": access_token
            }
            # Allow other campaign_config fields to override (except objective which is always from mapping)
            for key, value in campaign_config.items():
                if key not in ["objective"]:  # Don't allow objective override
                    meta_config[key] = value
            
            from services.platform_service.connector_factory import get_connector
            
            connector = get_connector("meta", credentials={"access_token": access_token})
            result = connector.launch_campaign(meta_config, correlation_id=correlation_id)
            
            # If successful, update campaign with platform_campaign_id and idempotency key
            if result.get("success") and result.get("platform_campaign_id"):
                platform_ids = campaign.platform_campaign_ids or {}
                platform_ids["meta"] = result.get("platform_campaign_id")
                # Store idempotency key metadata for reconciliation
                if "_meta" not in platform_ids:
                    platform_ids["_meta"] = {}
                platform_ids["_meta"]["idempotency_key"] = idempotency_key
                platform_ids["_meta"]["ad_account_id"] = normalized_ad_account
                platform_ids["_meta"]["last_launch_at"] = str(datetime.utcnow().isoformat())
                campaign.platform_campaign_ids = platform_ids
                db.commit()
                db.refresh(campaign)
                logger_adapter.info(f"Campaign {campaign_id} launched to Meta. Platform ID: {result.get('platform_campaign_id')}, Idempotency Key: {idempotency_key[:16]}...")

                # Record success metrics
                metrics.increment_counter("campaign_launch_success", {"platform": "meta"})

            return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
        finally:
            db.close()
            # Stop timer
            metrics.stop_timer("campaign_launch", {"platform": "meta", "correlation_id": correlation_id})

    except Exception as e:
        logger_adapter.error(f"Launch Meta campaign error: {e}", exc_info=True)
        # Record error metrics
        metrics.increment_counter("campaign_launch_error", {"platform": "meta", "error_type": type(e).__name__})
        metrics.stop_timer("campaign_launch", {"platform": "meta", "correlation_id": correlation_id})
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to launch campaign",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.post("/platforms/google/campaigns/{campaign_id}/launch")
async def launch_google_ads_campaign(campaign_id: str, request: Request):
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    logger_adapter = logging.LoggerAdapter(logger, {"correlation_id": correlation_id})

    # Start metrics collection
    metrics.start_timer("campaign_launch", {"platform": "google_ads", "correlation_id": correlation_id})
    metrics.increment_counter("campaign_launch_total", {"platform": "google_ads"})
    """
    Launch a campaign to Google Ads platform.
    Uses stored credentials (preferred) or environment variables as fallback.
    Body: { campaign_config (optional) }
    """
    try:
        body = await request.json() if request.headers.get("content-type") == "application/json" else {}
        campaign_config = body.get("campaign_config", {})
        
        # Get campaign details from database to build config
        from sqlalchemy.orm import Session
        from packages.db.database import get_db
        from packages.db.models import Campaign
        
        db_gen = get_db()
        db: Session = next(db_gen)
        try:
            campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()
            if not campaign:
                return JSONResponse(status_code=404, content={"success": False, "error": "Campaign not found"})
            
            # Resolve credentials
            creds = resolve_platform_credentials("google_ads", campaign.account_id)
            if not creds:
                # Fallback to env for demo/stub compatibility if requested
                developer_token = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
                client_id = os.getenv("GOOGLE_ADS_CLIENT_ID")
                client_secret = os.getenv("GOOGLE_ADS_CLIENT_SECRET")
                refresh_token = os.getenv("GOOGLE_ADS_REFRESH_TOKEN")
                customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID")
                
                if not all([developer_token, client_id, client_secret, refresh_token, customer_id]):
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "error": "Missing Google Ads credentials. Please connect your account in Settings.",
                            "error_code": "MISSING_CREDENTIALS"
                        }
                    )
                creds = {
                    "developer_token": developer_token,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "customer_id": customer_id
                }
            
            # Use customer_id from credentials (the selected ad_account_id if stored there)
            customer_id = creds.get("ad_account_id") or creds.get("customer_id")
            if not customer_id:
                return JSONResponse(status_code=400, content={"success": False, "error": "No Google Ads Customer ID selected."})

            
            # Generate idempotency key (similar to Meta pattern)
            import hashlib
            import json

            intent_data = {
                "goal": campaign.goal or "traffic",
                "daily_budget_cents": int(campaign.total_budget_cents / 30),
                "platform_allocations": campaign.platform_allocations or {},
                "customer_id": customer_id,
                "audience_id": campaign.audience_id,
            }

            canonical_intent = {k: v for k, v in intent_data.items() if v is not None}
            intent_json = json.dumps(canonical_intent, sort_keys=True, separators=(',', ':'))
            idempotency_key = hashlib.sha256(intent_json.encode('utf-8')).hexdigest()[:32]
            
            logger_adapter.info(f"Generated canonical intent hash for campaign {campaign_id}: {idempotency_key[:16]}...")
            
            # IDEMPOTENCY CHECK: If platform_campaign_id already exists, update existing campaign
            platform_ids = campaign.platform_campaign_ids or {}
            existing_google_campaign_id = platform_ids.get("google_ads")

            if existing_google_campaign_id:
                # Campaign already launched to Google Ads - update existing campaign
                logger_adapter.info(f"Campaign {campaign_id} already has Google Ads platform ID: {existing_google_campaign_id}. Updating existing campaign.")
                
                from services.platform_service.connector_factory import get_connector
                
                connector = get_connector("google_ads")
                
                update_config = {
                    "name": campaign.name,
                    "status": campaign_config.get("status", "PAUSED"),
                }
                
                # Update existing Google Ads campaign
                update_result = connector.update_campaign(
                    platform_campaign_id=existing_google_campaign_id,
                    campaign_config=update_config,
                    correlation_id=correlation_id
                )
                
                if update_result.get("success"):
                    logger_adapter.info(f"Successfully updated Google Ads campaign {existing_google_campaign_id} for Kaivo campaign {campaign_id}")
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "platform_campaign_id": existing_google_campaign_id,
                            "status": "updated",
                            "message": "Campaign already launched to Google Ads. Updated existing platform campaign.",
                            "idempotent": True,
                            **update_result
                        }
                    )
                else:
                    logger_adapter.error(f"Failed to update Google Ads campaign {existing_google_campaign_id}: {update_result.get('error')}")
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "platform_campaign_id": existing_google_campaign_id,
                            "status": "update_failed",
                            "error": update_result.get("error"),
                            "error_code": update_result.get("error_code"),
                            "message": "Campaign already launched but update failed."
                        }
                    )
            
            # Map campaign goal to Google Ads campaign type
            goal_mapping = {
                "conversion": "SEARCH",
                "conversions": "SEARCH",
                "traffic": "SEARCH",
                "awareness": "DISPLAY",
                "engagement": "DISPLAY",
                "leads": "SEARCH",
                "sales": "PERFORMANCE_MAX",
            }
            campaign_goal = (campaign.goal or "traffic").lower()
            
            # Build campaign config for Google Ads
            google_config = {
                "name": campaign.name,
                "goal": campaign_goal,
                "total_budget_cents": campaign.total_budget_cents,
                "status": campaign_config.get("status", "PAUSED"),
                "account_id": campaign.account_id,
                "audience_id": campaign.audience_id
            }
            
            # Allow other campaign_config fields to override
            for key, value in campaign_config.items():
                if key not in ["goal"]:  # Don't allow goal override (comes from campaign.goal)
                    google_config[key] = value
            
            from services.platform_service.connector_factory import get_connector
            
            connector = get_connector("google_ads")
            result = connector.launch_campaign(google_config, correlation_id=correlation_id)
            
            # If successful, update campaign with platform_campaign_id
            if result.get("success") and result.get("platform_campaign_id"):
                platform_ids = campaign.platform_campaign_ids or {}
                platform_ids["google_ads"] = result.get("platform_campaign_id")
                # Store idempotency key metadata
                if "_google_ads" not in platform_ids:
                    platform_ids["_google_ads"] = {}
                platform_ids["_google_ads"]["idempotency_key"] = idempotency_key
                platform_ids["_google_ads"]["customer_id"] = customer_id
                platform_ids["_google_ads"]["last_launch_at"] = str(datetime.utcnow().isoformat())
                campaign.platform_campaign_ids = platform_ids
                db.commit()
                db.refresh(campaign)
                logger_adapter.info(f"Campaign {campaign_id} launched to Google Ads. Platform ID: {result.get('platform_campaign_id')}, Idempotency Key: {idempotency_key[:16]}...")

                # Record success metrics
                metrics.increment_counter("campaign_launch_success", {"platform": "google_ads"})

            return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
        finally:
            db.close()
            # Stop timer
            metrics.stop_timer("campaign_launch", {"platform": "google_ads", "correlation_id": correlation_id})

    except Exception as e:
        logger_adapter.error(f"Launch Google Ads campaign error: {e}", exc_info=True)
        # Record error metrics
        metrics.increment_counter("campaign_launch_error", {"platform": "google_ads", "error_type": type(e).__name__})
        metrics.stop_timer("campaign_launch", {"platform": "google_ads", "correlation_id": correlation_id})
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to launch campaign",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )


@app.post("/platforms/microsoft/campaigns/{campaign_id}/launch")
async def launch_microsoft_ads_campaign(campaign_id: str, request: Request):
    """
    Launch a campaign to Microsoft Ads platform.
    Currently uses the MicrosoftAdsConnector, which is implemented as a stub
    that can later be extended with real Microsoft Advertising API calls.
    """
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    logger_adapter = logging.LoggerAdapter(logger, {"correlation_id": correlation_id})

    metrics.start_timer("campaign_launch", {"platform": "microsoft_ads", "correlation_id": correlation_id})
    metrics.increment_counter("campaign_launch_total", {"platform": "microsoft_ads"})

    try:
        body = await request.json() if request.headers.get("content-type") == "application/json" else {}
        campaign_config_overrides = body.get("campaign_config", {})

        from sqlalchemy.orm import Session
        from packages.db.database import get_db
        from packages.db.models import Campaign

        db_gen = get_db()
        db: Session = next(db_gen)
        try:
            campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()

            if not campaign:
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "error": "Campaign not found",
                        "error_code": "NOT_FOUND",
                    },
                )

            # Build a minimal config for Microsoft Ads. This is intentionally simple and
            # focuses on wiring; advanced mapping can be added later.
            ms_config = {
                "name": campaign.name,
                "goal": (campaign.goal or "traffic").lower(),
                "total_budget_cents": campaign.total_budget_cents,
                "account_id": campaign.account_id,
                "audience_id": campaign.audience_id,
            }

            # Resolve credentials
            creds = resolve_platform_credentials("microsoft_ads", campaign.account_id)
            
            # Allow overrides from request body (except core identity fields)
            for key, value in campaign_config_overrides.items():
                if key not in ["name", "account_id"]:
                    ms_config[key] = value

            from services.platform_service.connector_factory import get_connector

            connector = get_connector("microsoft_ads", credentials=creds)
            result = connector.launch_campaign(ms_config)

            # If successful, store platform campaign id on campaign record
            if result.get("success") and result.get("platform_campaign_id"):
                platform_ids = campaign.platform_campaign_ids or {}
                platform_ids["microsoft_ads"] = result.get("platform_campaign_id")
                campaign.platform_campaign_ids = platform_ids
                db.commit()
                db.refresh(campaign)

                logger_adapter.info(
                    f"Campaign {campaign_id} launched to Microsoft Ads. Platform ID: {result.get('platform_campaign_id')}"
                )
                metrics.increment_counter("campaign_launch_success", {"platform": "microsoft_ads"})

            return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
        finally:
            db.close()
            metrics.stop_timer("campaign_launch", {"platform": "microsoft_ads", "correlation_id": correlation_id})
    except Exception as e:
        logger_adapter.error(f"Launch Microsoft Ads campaign error: {e}", exc_info=True)
        metrics.increment_counter("campaign_launch_error", {"platform": "microsoft_ads", "error_type": type(e).__name__})
        metrics.stop_timer("campaign_launch", {"platform": "microsoft_ads", "correlation_id": correlation_id})
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to launch campaign",
                "error_code": "INTERNAL_ERROR",
                "message": str(e),
            },
        )

@app.post("/platforms/google/test-connection")
async def test_google_ads_connection(request: Request):
    """
    Test Google Ads API connection using environment variables.
    """
    try:
        # Check if credentials are configured
        developer_token = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
        client_id = os.getenv("GOOGLE_ADS_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_ADS_CLIENT_SECRET")
        refresh_token = os.getenv("GOOGLE_ADS_REFRESH_TOKEN")
        customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID")
        
        if not all([developer_token, client_id, client_secret, refresh_token, customer_id]):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing Google Ads credentials",
                    "message": "Configure GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, and GOOGLE_ADS_CUSTOMER_ID environment variables"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("google_ads")
        result = connector.test_connection()
        
        if result.get("success"):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=400)
            
    except Exception as e:
        logger.error(f"Google Ads connection test error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Connection test failed",
                "message": str(e)
            }
        )

@app.post("/platforms/tiktok/campaigns/{campaign_id}/launch")
async def launch_tiktok_campaign(campaign_id: str, request: Request):
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    logger_adapter = logging.LoggerAdapter(logger, {"correlation_id": correlation_id})

    # Start metrics collection
    metrics.start_timer("campaign_launch", {"platform": "tiktok", "correlation_id": correlation_id})
    metrics.increment_counter("campaign_launch_total", {"platform": "tiktok"})
    """
    Launch a campaign to TikTok Ads platform.
    Uses stored credentials (preferred) or environment variables as fallback.
    Body: { campaign_config (optional) }
    """
    try:
        body = await request.json() if request.headers.get("content-type") == "application/json" else {}
        campaign_config = body.get("campaign_config", {})
        
        # Get campaign details from database to build config
        from sqlalchemy.orm import Session
        from packages.db.database import get_db
        from packages.db.models import Campaign
        
        db_gen = get_db()
        db: Session = next(db_gen)
        try:
            campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()
            if not campaign:
                return JSONResponse(status_code=404, content={"success": False, "error": "Campaign not found"})
                
            # Resolve credentials
            creds = resolve_platform_credentials("tiktok", campaign.account_id)
            if not creds:
                # Fallback to env
                app_id = os.getenv("TIKTOK_APP_ID")
                app_secret = os.getenv("TIKTOK_APP_SECRET")
                access_token = os.getenv("TIKTOK_ACCESS_TOKEN")
                advertiser_id = os.getenv("TIKTOK_ADVERTISER_ID")
                
                if not all([app_id, app_secret, access_token, advertiser_id]):
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "error": "Missing TikTok Ads credentials. Please connect your account in Settings.",
                            "error_code": "MISSING_CREDENTIALS"
                        }
                    )
                creds = {
                    "app_id": app_id,
                    "app_secret": app_secret,
                    "access_token": access_token,
                    "advertiser_id": advertiser_id
                }
                
            advertiser_id = creds.get("ad_account_id") or creds.get("advertiser_id")
            if not advertiser_id:
                return JSONResponse(status_code=400, content={"success": False, "error": "No TikTok Advertiser ID selected."})

            
            # Generate idempotency key
            import hashlib
            import json

            intent_data = {
                "goal": campaign.goal or "traffic",
                "daily_budget_cents": int(campaign.total_budget_cents / 30),
                "platform_allocations": campaign.platform_allocations or {},
                "advertiser_id": advertiser_id,
                "audience_id": campaign.audience_id,
            }

            canonical_intent = {k: v for k, v in intent_data.items() if v is not None}
            intent_json = json.dumps(canonical_intent, sort_keys=True, separators=(',', ':'))
            idempotency_key = hashlib.sha256(intent_json.encode('utf-8')).hexdigest()[:32]
            
            logger_adapter.info(f"Generated canonical intent hash for campaign {campaign_id}: {idempotency_key[:16]}...")
            
            # IDEMPOTENCY CHECK: If platform_campaign_id already exists, update existing campaign
            platform_ids = campaign.platform_campaign_ids or {}
            existing_tiktok_campaign_id = platform_ids.get("tiktok")

            if existing_tiktok_campaign_id:
                # Campaign already launched to TikTok - update existing campaign
                logger_adapter.info(f"Campaign {campaign_id} already has TikTok platform ID: {existing_tiktok_campaign_id}. Updating existing campaign.")
                
                from services.platform_service.connector_factory import get_connector
                
                connector = get_connector("tiktok")
                
                update_config = {
                    "name": campaign.name,
                    "status": campaign_config.get("status", "PAUSED"),
                }
                
                # Update existing TikTok campaign
                update_result = connector.update_campaign(
                    platform_campaign_id=existing_tiktok_campaign_id,
                    campaign_config=update_config,
                    correlation_id=correlation_id
                )
                
                if update_result.get("success"):
                    logger_adapter.info(f"Successfully updated TikTok campaign {existing_tiktok_campaign_id} for Kaivo campaign {campaign_id}")
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "platform_campaign_id": existing_tiktok_campaign_id,
                            "status": "updated",
                            "message": "Campaign already launched to TikTok. Updated existing platform campaign.",
                            "idempotent": True,
                            **update_result
                        }
                    )
                else:
                    logger_adapter.error(f"Failed to update TikTok campaign {existing_tiktok_campaign_id}: {update_result.get('error')}")
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "platform_campaign_id": existing_tiktok_campaign_id,
                            "status": "update_failed",
                            "error": update_result.get("error"),
                            "error_code": update_result.get("error_code"),
                            "message": "Campaign already launched but update failed."
                        }
                    )
            
            # Build campaign config for TikTok
            tiktok_config = {
                "name": campaign.name,
                "goal": (campaign.goal or "traffic").lower(),
                "total_budget_cents": campaign.total_budget_cents,
                "status": campaign_config.get("status", "PAUSED"),
                "account_id": campaign.account_id,
                "audience_id": campaign.audience_id
            }
            
            # Allow other campaign_config fields to override
            for key, value in campaign_config.items():
                if key not in ["goal"]:  # Don't allow goal override (comes from campaign.goal)
                    tiktok_config[key] = value
            
            from services.platform_service.connector_factory import get_connector
            
            connector = get_connector("tiktok")
            result = connector.launch_campaign(tiktok_config, correlation_id=correlation_id)
            
            # If successful, update campaign with platform_campaign_id
            if result.get("success") and result.get("platform_campaign_id"):
                platform_ids = campaign.platform_campaign_ids or {}
                platform_ids["tiktok"] = result.get("platform_campaign_id")
                # Store idempotency key metadata
                if "_tiktok" not in platform_ids:
                    platform_ids["_tiktok"] = {}
                platform_ids["_tiktok"]["idempotency_key"] = idempotency_key
                platform_ids["_tiktok"]["advertiser_id"] = advertiser_id
                platform_ids["_tiktok"]["last_launch_at"] = str(datetime.utcnow().isoformat())
                campaign.platform_campaign_ids = platform_ids
                db.commit()
                db.refresh(campaign)
                logger_adapter.info(f"Campaign {campaign_id} launched to TikTok. Platform ID: {result.get('platform_campaign_id')}, Idempotency Key: {idempotency_key[:16]}...")

                # Record success metrics
                metrics.increment_counter("campaign_launch_success", {"platform": "tiktok"})

            return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
        finally:
            db.close()
            # Stop timer
            metrics.stop_timer("campaign_launch", {"platform": "tiktok", "correlation_id": correlation_id})

    except Exception as e:
        logger_adapter.error(f"Launch TikTok campaign error: {e}", exc_info=True)
        # Record error metrics
        metrics.increment_counter("campaign_launch_error", {"platform": "tiktok", "error_type": type(e).__name__})
        metrics.stop_timer("campaign_launch", {"platform": "tiktok", "correlation_id": correlation_id})
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to launch campaign",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.post("/platforms/tiktok/test-connection")
async def test_tiktok_connection(request: Request):
    """
    Test TikTok Ads API connection using environment variables.
    """
    try:
        # Check if credentials are configured
        app_id = os.getenv("TIKTOK_APP_ID")
        app_secret = os.getenv("TIKTOK_APP_SECRET")
        access_token = os.getenv("TIKTOK_ACCESS_TOKEN")
        advertiser_id = os.getenv("TIKTOK_ADVERTISER_ID")
        
        if not all([app_id, app_secret, access_token, advertiser_id]):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing TikTok Ads credentials",
                    "message": "Configure TIKTOK_APP_ID, TIKTOK_APP_SECRET, TIKTOK_ACCESS_TOKEN, and TIKTOK_ADVERTISER_ID environment variables"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("tiktok")
        result = connector.test_connection()
        
        if result.get("success"):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=400)
            
    except Exception as e:
        logger.error(f"TikTok connection test error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Connection test failed",
                "message": str(e)
            }
        )

@app.put("/platforms/google/campaigns/{campaign_id}")
async def update_google_ads_campaign(campaign_id: str, request: Request):
    """
    Update a Google Ads campaign.
    Uses environment variables for credentials.
    Body: { campaign_config: { name, status, budget, ... } }
    """
    try:
        # Check if credentials are configured
        developer_token = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
        if not developer_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing Google Ads credentials",
                    "error_code": "MISSING_CREDENTIALS",
                    "message": "Configure GOOGLE_ADS_* environment variables"
                }
            )
        
        body = await request.json() if request.headers.get("content-type") == "application/json" else {}
        campaign_config = body.get("campaign_config", {})
        
        if not campaign_config:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing campaign_config",
                    "error_code": "MISSING_PARAMETER",
                    "message": "Provide campaign_config in request body"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("google_ads")
        result = connector.update_campaign(
            platform_campaign_id=campaign_id,
            campaign_config=campaign_config
        )
        
        return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
        
    except Exception as e:
        logger.error(f"Update Google Ads campaign error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to update campaign",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.get("/platforms/google/campaigns")
async def get_google_ads_campaigns(request: Request):
    """
    List Google Ads campaigns.
    Uses environment variables for credentials.
    Query params: limit (optional, 1-100, default: 25)
    """
    try:
        # Check if credentials are configured
        developer_token = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
        if not developer_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing Google Ads credentials",
                    "error_code": "MISSING_CREDENTIALS",
                    "message": "Configure GOOGLE_ADS_* environment variables"
                }
            )
        
        # Validate limit parameter
        try:
            limit = int(request.query_params.get("limit", 25))
            if limit < 1 or limit > 100:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Limit must be between 1 and 100",
                        "error_code": "INVALID_LIMIT"
                    }
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Invalid limit parameter",
                    "error_code": "INVALID_LIMIT"
                }
            )
        
        # TODO: Implement fetch_campaigns method in GoogleAdsConnector
        # For now, return a placeholder response
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "campaigns": [],
                "count": 0,
                "message": "Campaign listing pending implementation in GoogleAdsConnector"
            }
        )
        
    except Exception as e:
        logger.error(f"Get Google Ads campaigns error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to fetch campaigns",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.get("/platforms/meta/ad-sets")
async def get_meta_ad_sets(request: Request):
    """
    Fetch ad sets for a specific Meta campaign.
    Query params: campaign_id (required), access_token (optional), limit (optional, 1-100, default: 25)
    """
    try:
        campaign_id = request.query_params.get("campaign_id")
        access_token = request.query_params.get("access_token") or os.getenv("META_ACCESS_TOKEN")
        
        # Validate limit parameter
        try:
            limit = int(request.query_params.get("limit", 25))
            if limit < 1 or limit > 100:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Limit must be between 1 and 100",
                        "error_code": "INVALID_LIMIT",
                        "message": "Provide limit query parameter between 1 and 100"
                    }
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Invalid limit parameter",
                    "error_code": "INVALID_LIMIT",
                    "message": "Limit must be a valid integer"
                }
            )
        
        if not campaign_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing campaign_id",
                    "error_code": "MISSING_PARAMETER",
                    "message": "Provide campaign_id query parameter"
                }
            )
        
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN",
                    "message": "Provide access_token query parameter or set META_ACCESS_TOKEN environment variable"
                }
            )
        
        from services.platform_service.connector_factory import get_connector
        
        connector = get_connector("meta", credentials={"access_token": access_token})
        result = connector.fetch_ad_sets(campaign_id=campaign_id, access_token=access_token, limit=limit)
        
        if result.get("success"):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=400)
            
    except Exception as e:
        logger.error(f"Meta fetch ad sets error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to fetch ad sets",
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )

@app.post("/os/run")
async def run_os_intent(request: Request):
    """
    Proxies execution requests to the OS Runtime Service.
    Strictly gated by FF_OS_RUNTIME_ENABLED.
    """
    # 1. Feature Flag Check
    if not FF_OS_RUNTIME_ENABLED:
        return JSONResponse(
            status_code=403,
            content={"code": "FEATURE_DISABLED", "feature": "FF_OS_RUNTIME_ENABLED"}
        )
    
    # 2. Auth Check - Standard JWT authentication required
    _verify_auth_header(request)

    # 3. Forward Request
    try:
        body = await request.json()
        if not body:
            return JSONResponse(
                 status_code=400,
                 content={"code": "INVALID_REQUEST", "details": ["Request body cannot be empty"]}
            )
    except Exception:
        return JSONResponse(
             status_code=400,
             content={"code": "INVALID_REQUEST", "details": ["Invalid JSON body"]}
        )
    
    async with httpx.AsyncClient() as client:
        try:
            # Inject deterministic identity header if bypass active? 
            # Request is proxied. OS Runtime might expect auth headers?
            # For now, just forwarding body.
            resp = await client.post(f"{OS_RUNTIME_URL}/os/run", json=body, timeout=30.0)
            return JSONResponse(content=resp.json(), status_code=resp.status_code)
        except Exception as e:
             raise HTTPException(status_code=503, detail=f"OS Runtime unavailable: {str(e)}")


def _verify_auth_header(request: Request):
    """
    Helper to enforce JWT auth. Raises HTTPException on failure.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = auth_header.split(" ")[1]
    
    # Allow bypassing strict JWT for Hermetic Testing
    is_test_mode = os.getenv("TEST_MODE", "false").lower() == "true"
    
    if is_test_mode:
        return
        
    try:
        from services.auth_service.auth import SECRET_KEY, ALGORITHM
        from jose import jwt
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception: 
        raise HTTPException(status_code=401, detail="Unauthorized")

# --- Meta OAuth Endpoints ---
@app.get("/platforms/meta/oauth/initiate")
async def initiate_meta_oauth(
    account_id: int = Query(..., description="Kaivo account ID"),
    redirect_uri: Optional[str] = Query(None, description="Custom redirect URI (optional)")
):
    """
    Initiate Meta OAuth flow. Returns Facebook authorization URL.

    IMPORTANT: The redirect_uri sent to Facebook MUST exactly match the URI
    registered in the Meta Developer Portal (Valid OAuth Redirect URIs).
    We use META_REDIRECT_URI env var so it is always correct regardless of
    where the backend is running.

    account_id is encoded inside the `state` parameter (format: random_hex|account_id)
    because Facebook only passes back `code` and `state` on the redirect —
    it strips any other custom query parameters.
    """
    try:
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")

        if not app_id or not app_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Meta OAuth not configured",
                    "message": "META_APP_ID and META_APP_SECRET must be set"
                }
            )

        # Encode account_id in state so we can recover it on callback.
        # Facebook only returns code+state; it strips custom query params.
        state = f"{uuid.uuid4().hex}|{account_id}"

        # The redirect_uri MUST exactly match the one registered in the Meta
        # Developer Portal. Use META_REDIRECT_URI env var first, then fall back
        # to the canonical app.getkaivo.com path.
        if not redirect_uri:
            redirect_uri = os.getenv(
                "META_REDIRECT_URI",
                "https://app.getkaivo.com/integrations/meta/oauth/callback"
            )

        # Meta OAuth scopes for Ads API
        # - ads_read: Read ad accounts and campaigns
        # - ads_management: Create/update/delete campaigns (CRITICAL for launch_campaign)
        # - business_management: Access Business Manager resources
        # - pages_read_engagement: Read page insights
        # - pages_show_list: List pages
        scopes = [
            "ads_read",
            "ads_management",
            "business_management",
            "pages_read_engagement",
            "pages_show_list"
        ]
        scope_string = ",".join(scopes)

        # URL-encode the redirect_uri before embedding it in the OAuth URL
        from urllib.parse import quote
        encoded_redirect_uri = quote(redirect_uri, safe="")

        # Build Meta OAuth authorization URL with all required parameters
        oauth_url = (
            f"https://www.facebook.com/v21.0/dialog/oauth"
            f"?client_id={app_id}"
            f"&redirect_uri={encoded_redirect_uri}"
            f"&scope={scope_string}"
            f"&state={state}"
            f"&response_type=code"
        )

        logger.info(f"Meta OAuth initiated: account_id={account_id}, redirect_uri={redirect_uri}")

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "oauth_url": oauth_url,
                "state": state,
                "account_id": account_id
            }
        )

    except Exception as e:
        logger.error(f"Meta OAuth initiation error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to initiate OAuth",
                "message": str(e)
            }
        )

@app.get("/platforms/meta/oauth/callback")
async def meta_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None, description="OAuth authorization code"),
    state: Optional[str] = Query(None, description="CSRF state token (format: random_hex|account_id)"),
    account_id: Optional[int] = Query(None, description="Kaivo account ID (parsed from state)"),
    error: Optional[str] = Query(None, description="OAuth error if any"),
    error_reason: Optional[str] = Query(None, description="Error reason"),
    error_description: Optional[str] = Query(None, description="Error description")
):
    """
    Handle Meta OAuth callback. Exchanges authorization code for access token and stores it.

    Facebook redirects here with `code` and `state` query parameters.
    The `state` encodes the account_id (format: random_hex|account_id) because
    Facebook strips any other custom query parameters from the redirect_uri.

    The redirect_uri used here for token exchange MUST exactly match the one
    registered in the Meta Developer Portal and the one used in initiate.
    """
    try:
        # Handle OAuth errors returned by Facebook
        if error:
            logger.warning(f"Meta OAuth error from Facebook: {error} - {error_description}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": error,
                    "error_reason": error_reason,
                    "error_description": error_description
                }
            )

        # Require both code and state
        if not code or not state:
            logger.error(f"Meta OAuth callback missing params: code={bool(code)}, state={bool(state)}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing OAuth parameters",
                    "message": "Facebook did not return 'code' or 'state'. Ensure the OAuth flow was initiated correctly."
                }
            )

        # Decode account_id from state (format: random_hex|account_id)
        # This is how we recover account_id since Facebook strips custom query params.
        resolved_account_id = account_id
        if resolved_account_id is None and "|" in state:
            try:
                _, account_id_str = state.rsplit("|", 1)
                resolved_account_id = int(account_id_str)
            except (ValueError, IndexError):
                pass

        if resolved_account_id is None:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing account_id",
                    "message": "Could not parse account_id from state. Ensure you started OAuth from the integrations page."
                }
            )

        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")

        if not app_id or not app_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Meta OAuth not configured",
                    "message": "META_APP_ID and META_APP_SECRET must be set"
                }
            )

        # The redirect_uri for token exchange MUST exactly match the one registered
        # in the Meta Developer Portal and the one used in the initiate step.
        redirect_uri = os.getenv(
            "META_REDIRECT_URI",
            "https://app.getkaivo.com/integrations/meta/oauth/callback"
        )

        logger.info(f"Meta OAuth callback: account_id={resolved_account_id}, redirect_uri={redirect_uri}")

        # Exchange authorization code for short-lived user access token
        token_url = "https://graph.facebook.com/v21.0/oauth/access_token"
        token_params = {
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
            "code": code
        }

        async with httpx.AsyncClient() as client:
            token_response = await client.get(token_url, params=token_params)
            token_response.raise_for_status()
            token_data = token_response.json()

        short_lived_token = token_data.get("access_token")
        expires_in = token_data.get("expires_in", 3600)  # Default 1 hour

        if not short_lived_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Failed to get access token",
                    "message": f"Meta API response: {token_data}"
                }
            )

        # Exchange short-lived token for long-lived token (~60 days)
        long_lived_token_url = "https://graph.facebook.com/v21.0/oauth/access_token"
        long_lived_params = {
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": short_lived_token
        }

        from datetime import datetime, timedelta
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        async with httpx.AsyncClient() as client:
            long_lived_response = await client.get(long_lived_token_url, params=long_lived_params)

        if long_lived_response.status_code == 200:
            long_lived_data = long_lived_response.json()
            final_token = long_lived_data.get("access_token", short_lived_token)
            final_expires_in = long_lived_data.get("expires_in", 5184000)  # 60 days
            token_type = "long-lived"
        else:
            # Fallback to short-lived token if long-lived exchange fails
            logger.warning(f"Long-lived token exchange failed: {long_lived_response.text}. Using short-lived token.")
            final_token = short_lived_token
            final_expires_in = expires_in
            token_type = "short-lived"

        expires_at = datetime.utcnow() + timedelta(seconds=final_expires_in)

        db = SessionLocal()
        try:
            credential = PlatformCredentialService.store_credentials(
                db=db,
                client_id=resolved_account_id,
                platform="meta",
                access_token=final_token,
                app_id=app_id,
                token_expires_at=expires_at
            )

            response_content = {
                "success": True,
                "message": "Meta account connected successfully",
                "credential_id": credential.id,
                "token_type": token_type,
                "expires_at": expires_at.isoformat(),
                "expires_in_days": final_expires_in // 86400
            }
            if token_type == "short-lived":
                response_content["warning"] = "Long-lived token exchange failed, using short-lived token (~1 hour)"

            return JSONResponse(status_code=200, content=response_content)
        finally:
            db.close()

    except httpx.HTTPStatusError as e:
        logger.error(f"Meta OAuth callback HTTP error: {e.response.text}")
        return JSONResponse(
            status_code=e.response.status_code,
            content={
                "success": False,
                "error": "OAuth exchange failed",
                "message": e.response.text
            }
        )
    except Exception as e:
        logger.error(f"Meta OAuth callback error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "OAuth callback failed",
                "message": str(e)
            }
        )

@app.post("/platforms/meta/oauth/refresh")
async def refresh_meta_token(
    request: Request,
    account_id: int = Query(..., description="Kaivo account ID")
):
    """
    Refresh Meta long-lived access token (extend expiration).
    Long-lived tokens can be refreshed before expiration.
    """
    try:
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")
        
        if not app_id or not app_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Meta OAuth not configured",
                    "message": "META_APP_ID and META_APP_SECRET must be set"
                }
            )
        
        # Get stored token
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService
        
        db = SessionLocal()
        try:
            credentials = PlatformCredentialService.get_credentials(db, account_id, "meta")
            if not credentials or not credentials.get("access_token"):
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "error": "No stored Meta credentials found",
                        "message": "Please connect Meta account first"
                    }
                )
            
            current_token = credentials.get("access_token")
            
            # Exchange current token for new long-lived token
            refresh_url = "https://graph.facebook.com/v21.0/oauth/access_token"
            refresh_params = {
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": current_token
            }
            
            async with httpx.AsyncClient() as client:
                refresh_response = await client.get(refresh_url, params=refresh_params)
                refresh_response.raise_for_status()
                refresh_data = refresh_response.json()
            
            new_token = refresh_data.get("access_token")
            expires_in = refresh_data.get("expires_in", 5184000)  # 60 days
            
            if not new_token:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Failed to refresh token",
                        "message": "Meta API did not return new access token"
                    }
                )
            
            # Update stored credentials
            from datetime import datetime, timedelta
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            
            PlatformCredentialService.store_credentials(
                db=db,
                client_id=account_id,
                platform="meta",
                access_token=new_token,
                app_id=app_id,
                token_expires_at=expires_at
            )
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Token refreshed successfully",
                    "expires_at": expires_at.isoformat(),
                    "expires_in_days": expires_in // 86400
                }
            )
        finally:
            db.close()
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Meta token refresh HTTP error: {e.response.text}")
        return JSONResponse(
            status_code=e.response.status_code,
            content={
                "success": False,
                "error": "Token refresh failed",
                "message": e.response.text
            }
        )
    except Exception as e:
        logger.error(f"Meta token refresh error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Token refresh failed",
                "message": str(e)
            }
        )
    

# --- Reddit OAuth Endpoints ---
@app.get("/platforms/reddit/oauth/initiate")
async def initiate_reddit_oauth(
    account_id: int = Query(..., description="Kaivo account ID"),
    redirect_uri: Optional[str] = Query(None, description="Custom redirect URI (optional)"),
):
    """
    Initiate Reddit OAuth2 flow (authorization code, duration=permanent).
    Returns the Reddit authorization URL and state token.
    """
    try:
        client_id = os.getenv("REDDIT_CLIENT_ID")
        client_secret = os.getenv("REDDIT_CLIENT_SECRET")

        if not client_id or not client_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Reddit OAuth not configured",
                    "message": "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set",
                },
            )

        # Encode account_id in state so we can recover it on callback (Reddit only returns code+state)
        state = f"{uuid.uuid4().hex}|{account_id}"

        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com")).rstrip("/")
        if not redirect_uri:
            redirect_uri = f"{frontend_url}/integrations/reddit/oauth/callback"

        scope = "adsread"

        from urllib.parse import quote, urlencode
        params = {
            "client_id": client_id,
            "response_type": "code",
            "state": state,
            "redirect_uri": redirect_uri,
            "duration": "permanent",
            "scope": scope,
        }
        oauth_url = f"https://www.reddit.com/api/v1/authorize?{urlencode(params)}"

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "oauth_url": oauth_url,
                "state": state,
                "account_id": account_id,
            },
        )
    except Exception as e:
        logger.error(f"Reddit OAuth initiation error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to initiate Reddit OAuth",
                "message": str(e),
            },
        )


@app.get("/platforms/reddit/oauth/callback")
async def reddit_oauth_callback(
    code: str = Query(..., description="OAuth authorization code"),
    state: str = Query(..., description="CSRF state token (format: random_hex|account_id)"),
    account_id: Optional[int] = Query(None, description="Kaivo account ID (optional, parsed from state if not provided)"),
    error: Optional[str] = Query(None, description="OAuth error if any"),
    error_description: Optional[str] = Query(None, description="Error description"),
):
    """
    Handle Reddit OAuth callback.
    Exchanges authorization code for access + refresh tokens and stores them.
    account_id is encoded in state (format: random_hex|account_id) since Reddit only returns code+state.
    """
    try:
        if error:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": error,
                    "error_description": error_description,
                },
            )

        # Parse account_id from state if not in query (Reddit only returns code+state)
        if account_id is None and state and "|" in state:
            try:
                _, account_id_str = state.rsplit("|", 1)
                account_id = int(account_id_str)
            except (ValueError, IndexError):
                pass
        if account_id is None:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing account_id",
                    "message": "Could not parse account_id from state. Ensure you started OAuth from the integrations page.",
                },
            )

        client_id = os.getenv("REDDIT_CLIENT_ID")
        client_secret = os.getenv("REDDIT_CLIENT_SECRET")

        if not client_id or not client_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Reddit OAuth not configured",
                    "message": "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set",
                },
            )

        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com")).rstrip("/")
        redirect_uri = f"{frontend_url}/integrations/reddit/oauth/callback"

        token_url = "https://www.reddit.com/api/v1/access_token"
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }

        user_agent = os.getenv("REDDIT_USER_AGENT", "KaivoAds/1.0 (https://getkaivo.com)")

        async with httpx.AsyncClient(headers={"User-Agent": user_agent}) as client:
            token_response = await client.post(
                token_url,
                data=token_data,
                auth=(client_id, client_secret),
            )
            token_response.raise_for_status()
            token_json = token_response.json()

        access_token = token_json.get("access_token")
        refresh_token = token_json.get("refresh_token")
        expires_in = token_json.get("expires_in", 3600)

        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Failed to get access token",
                    "message": f"Reddit API did not return access token: {token_json}",
                },
            )

        from datetime import datetime, timedelta
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

        db = SessionLocal()
        try:
            credential = PlatformCredentialService.store_credentials(
                db,
                account_id,
                "reddit",
                access_token=access_token,
                refresh_token=refresh_token,
                app_id=client_id,
                app_secret=client_secret,
                token_expires_at=expires_at,
            )

            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Reddit account connected successfully",
                    "credential_id": credential.id,
                    "expires_at": expires_at.isoformat(),
                    "has_refresh_token": bool(refresh_token),
                },
            )
        finally:
            db.close()
    except httpx.HTTPStatusError as e:
        logger.error(f"Reddit OAuth callback HTTP error: {e.response.text}")
        return JSONResponse(
            status_code=e.response.status_code,
            content={
                "success": False,
                "error": "OAuth exchange failed",
                "message": e.response.text,
            },
        )
    except Exception as e:
        logger.error(f"Reddit OAuth callback error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "OAuth callback failed",
                "message": str(e),
            },
        )
    
# --- Health Check ---
@app.get("/healthz", tags=["Health"])
async def health_check():
    """
    Health check endpoint that verifies Database, Redis, and OS Runtime connectivity.
    """
    health_status = {
        "status": "ok",
        "service": "api_gateway",
        "database": "unknown",
        "redis": "unknown",
        "os_runtime": "unknown"
    }
    
    # Check Database
    try:
        db_url = os.getenv("DATABASE_URL")
        if db_url:
            engine = create_engine(db_url)
            # Use run_sync logic or simple connect for Async, but sqlalchemy is often sync.
            # Keeping DB check simple/sync if engine is sync.
            # If main.py uses sync sqlalchemy, that's fine in async def if fast, 
            # but ideally should be awaited or run in threadpool. 
            # For this task, assuming sync connect is acceptable or non-blocking enough for health check.
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            health_status["database"] = "connected"
        else:
            health_status["database"] = "not_configured"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["database"] = "disconnected"
        health_status["status"] = "error"

    # Check Redis
    try:
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            # Redis from_url and ping can be sync or async depending on lib. 
            # Assuming 'redis' lib (sync). In async func this blocks loop.
            # But correct for 'redis' pypi package.
            r = Redis.from_url(redis_url)
            r.ping()
            health_status["redis"] = "connected"
        else:
            health_status["redis"] = "not_configured"
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        health_status["redis"] = "disconnected"
        health_status["status"] = "error"

    # Check OS Runtime
    if FF_OS_RUNTIME_ENABLED:
        try:
            # Using async client for probe
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(f"{OS_RUNTIME_URL}/health")
                if resp.status_code == 200:
                    health_status["os_runtime"] = "connected"
                else:
                    health_status["os_runtime"] = "error"
                    health_status["os_runtime_details"] = f"Status {resp.status_code}"
                    health_status["status"] = "error"
        except Exception as e:
            health_status["os_runtime"] = "unreachable"
            health_status["os_runtime_details"] = str(e)
            health_status["status"] = "error"
    else:
        health_status["os_runtime"] = "disabled"

    if health_status["status"] == "error":
        raise HTTPException(status_code=503, detail=health_status)
        
    return health_status

@app.get("/api/metrics")
async def get_metrics():
    """
    Expose collected metrics for monitoring and observability.
    Returns metrics in a simple JSON format (can be adapted for Prometheus later).
    """
    try:
        current_metrics = metrics.get_metrics()

        # Format metrics for response
        response = {
            "timestamp": time.time(),
            "counters": {},
            "gauges": {},
            "histograms": {}
        }

        for metric_type, metrics_data in current_metrics.items():
            for key, value in metrics_data.items():
                # Parse metric name and labels
                if ":" in key:
                    name, labels_str = key.split(":", 1)
                else:
                    name = key
                    labels_str = ""

                response[f"{metric_type}s"][name] = {
                    "value": value,
                    "labels": labels_str if labels_str else None
                }

        return response

    except Exception as e:
        logger.error(f"Error retrieving metrics: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to retrieve metrics"}
        )

# --- Platform Credentials Endpoints ---
@app.get("/platform-credentials/{platform}")
@app.get("/platform-credentials/{platform}/")  # Add trailing slash support
async def get_platform_credentials(request: Request, platform: str, client_id: int = None):
    """
    Get stored platform credentials for an account.
    """
    try:
        # Verify authentication
        _verify_auth_header(request)
        
        # Use client_id from query param or resolve from stored credentials
        resolved_account_id = client_id
        if not resolved_account_id:
            # If no client_id provided, could potentially extract from JWT or other context
            # For now, return error
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "client_id is required",
                    "message": "client_id query parameter must be provided"
                }
            )
        
        # Use the helper function that already exists
        from services.account_service.platform_credentials import PlatformCredentialService
        from packages.db.database import SessionLocal
        
        internal_platform = normalize_platform_name(platform)
        
        db = SessionLocal()
        try:
            credentials = PlatformCredentialService.get_credentials(db, resolved_account_id, internal_platform)
            if not credentials:
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "error": "Credentials not found",
                        "message": f"No credentials found for platform {platform} and account {resolved_account_id}"
                    }
                )
            
            # Sanitize datetime objects for JSON serialization
            serializable = {}
            for k, v in credentials.items():
                if hasattr(v, 'isoformat'):
                    serializable[k] = v.isoformat()
                else:
                    serializable[k] = v
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "credentials": serializable
                }
            )
        finally:
            db.close()
            
    except HTTPException:
        # Re-raise HTTP exceptions (like 401 from auth)
        raise
    except Exception as e:
        logger.error(f"Error getting platform credentials: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to retrieve platform credentials",
                "message": str(e)
            }
        )

# --- TikTok OAuth Endpoints ---
@app.get("/platforms/tiktok/oauth/initiate")
async def initiate_tiktok_oauth(
    account_id: int = Query(..., description="Kaivo account ID"),
    redirect_uri: Optional[str] = Query(None, description="Custom redirect URI (optional)")
):
    """
    Initiate TikTok OAuth flow. Redirects user to TikTok authorization page.
    """
    try:
        app_id = os.getenv("TIKTOK_APP_ID")
        app_secret = os.getenv("TIKTOK_APP_SECRET")
        
        if not app_id or not app_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "TikTok OAuth not configured",
                    "message": "TIKTOK_APP_ID and TIKTOK_APP_SECRET must be set"
                }
            )
        
        # Generate state for CSRF protection and to carry account context
        # We encode the Kaivo account ID into the state payload instead of
        # adding query params to redirect_uri (TikTok does not allow that).
        import json
        import base64

        raw_state = {
            "csrf": uuid.uuid4().hex,
            "account_id": account_id,
        }
        # URL-safe base64 so it can be round-tripped via TikTok unchanged.
        state = base64.urlsafe_b64encode(json.dumps(raw_state).encode("utf-8")).decode("utf-8")
        
        # Build redirect URI
        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com"))
        if not redirect_uri:
            redirect_uri = f"{frontend_url}/integrations/tiktok/oauth/callback"
        
        # TikTok OAuth scopes
        # For Login Kit, only request basic profile info
        scopes = ["user.info.basic"]
        scope_string = ",".join(scopes)
        
        # Build TikTok OAuth URL
        oauth_url = (
            f"https://www.tiktok.com/v2/auth/authorize/"
            f"?client_key={app_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scope_string}"
            f"&state={state}"
            f"&response_type=code"
        )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "oauth_url": oauth_url,
                "state": state,
                "account_id": account_id
            }
        )
        
    except Exception as e:
        logger.error(f"TikTok OAuth initiation error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to initiate OAuth",
                "message": str(e)
            }
        )


@app.get("/platforms/tiktok/oauth/callback")
async def tiktok_oauth_callback(
    code: str = Query(..., description="OAuth authorization code"),
    state: str = Query(..., description="CSRF state token (may contain encoded account context)"),
    account_id: Optional[int] = Query(
        None, description="Kaivo account ID (optional; preferred via state payload)"
    ),
    error: Optional[str] = Query(None, description="OAuth error if any"),
    error_description: Optional[str] = Query(None, description="Error description")
):
    """
    Handle TikTok OAuth callback.
    Exchanges authorization code for access + refresh tokens and stores them
    as platform credentials for the given account.
    """
    try:
        if error:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": error,
                    "error_description": error_description,
                },
            )

        app_id = os.getenv("TIKTOK_APP_ID")
        app_secret = os.getenv("TIKTOK_APP_SECRET")

        if not app_id or not app_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "TikTok OAuth not configured",
                    "message": "TIKTOK_APP_ID and TIKTOK_APP_SECRET must be set",
                },
            )

        # Derive account_id from state if it was not provided explicitly.
        if account_id is None:
            import json
            import base64

            try:
                # Add padding if necessary for base64 decoding
                padding = "=" * (-len(state) % 4)
                decoded = base64.urlsafe_b64decode(state + padding).decode("utf-8")
                state_payload = json.loads(decoded)
                account_id_value = state_payload.get("account_id")
                if account_id_value is None:
                    raise ValueError("account_id missing from state payload")
                account_id = int(account_id_value)
            except Exception as e:
                logger.error(f"Failed to extract account_id from TikTok state: {e}", exc_info=True)
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Invalid OAuth state",
                        "message": "Could not determine account for TikTok connection",
                    },
                )

        # If we already have active TikTok credentials for this account, treat this
        # callback as idempotent success. This avoids "invalid_grant" errors when
        # the callback endpoint is hit multiple times with the same code (e.g. by
        # Next.js double-invocation or user refresh).
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        db = SessionLocal()
        try:
            existing = PlatformCredentialService.get_credentials(
                db=db, client_id=account_id, platform="tiktok"
            )
        finally:
            db.close()

        if existing and existing.get("access_token"):
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "TikTok account connected successfully",
                },
            )

        # Build redirect URI (must match the one used in initiate_tiktok_oauth)
        frontend_url = os.getenv(
            "FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com")
        )
        redirect_uri = f"{frontend_url}/integrations/tiktok/oauth/callback"

        # Exchange authorization code for access + refresh tokens
        token_url = "https://open.tiktokapis.com/v2/oauth/token/"
        token_payload = {
            "client_key": app_id,
            "client_secret": app_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            token_response = await client.post(token_url, data=token_payload)
            token_response.raise_for_status()
            raw_token_data = token_response.json()

        # TikTok v2 token responses usually wrap data in a "data" field:
        # { "data": { access_token, refresh_token, ... }, "error": { code, message } }
        # Be defensive in case the response is not a JSON object.
        if isinstance(raw_token_data, dict):
            token_data = raw_token_data.get("data", raw_token_data) or {}
            error_block = raw_token_data.get("error") or {}
        else:
            token_data = {}
            error_block = {"message": str(raw_token_data)}

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 24 * 3600)  # default 24h
        refresh_expires_in = token_data.get("refresh_expires_in", 365 * 24 * 3600)

        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Failed to get access token",
                    "message": (error_block.get("message") if isinstance(error_block, dict) else str(error_block))
                    or "TikTok API did not return access token",
                },
            )

        # Calculate expiration datetime
        from datetime import datetime, timedelta

        access_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

        # Store credentials in database (encrypted)
        db = SessionLocal()
        try:
            credential = PlatformCredentialService.store_credentials(
                db=db,
                client_id=account_id,
                platform="tiktok",
                access_token=access_token,
                refresh_token=refresh_token,
                app_id=app_id,
                app_secret=app_secret,
                token_expires_at=access_expires_at,
            )

            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "TikTok account connected successfully",
                    "credential_id": credential.id,
                    "access_expires_at": access_expires_at.isoformat(),
                    "access_expires_in_seconds": expires_in,
                    "refresh_expires_in_seconds": refresh_expires_in,
                },
            )
        finally:
            db.close()

    except httpx.HTTPStatusError as e:
        logger.error(f"TikTok OAuth callback HTTP error: {e.response.text}")
        return JSONResponse(
            status_code=e.response.status_code,
            content={
                "success": False,
                "error": "TikTok token exchange failed",
                "message": e.response.text,
            },
        )
    except Exception as e:
        logger.error(f"TikTok OAuth callback error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to complete TikTok OAuth callback",
                "message": str(e),
            },
        )


# --- Microsoft Ads OAuth Endpoints ---
@app.get("/platforms/microsoft/oauth/initiate")
async def initiate_microsoft_oauth(
    account_id: int = Query(..., description="Kaivo account ID"),
    redirect_uri: Optional[str] = Query(None, description="Custom redirect URI (optional)")
):
    """
    Initiate Microsoft Ads OAuth flow. Redirects user to Microsoft Account authorization page.

    Uses login.microsoftonline.com/common with msads.manage scope to support both
    organizational (Azure AD) and personal Microsoft accounts (Outlook, Hotmail, etc).
    This is the recommended approach per Microsoft Advertising API documentation (2024+).
    """
    try:
        client_id = os.getenv("MICROSOFT_ADS_CLIENT_ID", os.getenv("MICROSOFT_CLIENT_ID"))
        client_secret = os.getenv("MICROSOFT_ADS_CLIENT_SECRET", os.getenv("MICROSOFT_CLIENT_SECRET"))
        
        if not client_id or not client_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Microsoft OAuth not configured",
                    "message": "MICROSOFT_ADS_CLIENT_ID and MICROSOFT_ADS_CLIENT_SECRET must be set"
                }
            )
        
        state = f"{uuid.uuid4().hex}|{account_id}"
        
        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com")).rstrip("/")
        if not redirect_uri:
            redirect_uri = os.getenv(
                "MICROSOFT_REDIRECT_URI",
                f"{frontend_url}/integrations/microsoft/oauth/callback"
            )
        
        scope_string = "https://ads.microsoft.com/msads.manage offline_access"
        
        from urllib.parse import quote
        encoded_redirect_uri = quote(redirect_uri, safe="")
        encoded_scope = quote(scope_string, safe="")
        
        encoded_state = quote(state, safe="")
        
        oauth_url = (
            f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
            f"?client_id={client_id}"
            f"&redirect_uri={encoded_redirect_uri}"
            f"&scope={encoded_scope}"
            f"&state={encoded_state}"
            f"&response_type=code"
            f"&response_mode=query"
        )
        
        logger.info(f"Microsoft OAuth initiated: account_id={account_id}, redirect_uri={redirect_uri}")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "oauth_url": oauth_url,
                "state": state,
                "account_id": account_id
            }
        )
        
    except Exception as e:
        logger.error(f"Microsoft OAuth initiation error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to initiate OAuth",
                "message": str(e)
            }
        )


@app.get("/platforms/microsoft/oauth/callback")
async def microsoft_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None, description="OAuth authorization code"),
    state: Optional[str] = Query(None, description="CSRF state token (format: random_hex|account_id)"),
    account_id: Optional[int] = Query(None, description="Kaivo account ID (parsed from state)"),
    error: Optional[str] = Query(None, description="OAuth error if any"),
    error_description: Optional[str] = Query(None, description="Error description")
):
    """
    Handle Microsoft OAuth callback. Exchanges authorization code for access + refresh tokens.

    Microsoft redirects here with `code` and `state` query parameters.
    The `state` encodes the account_id (format: random_hex|account_id).

    Uses login.microsoftonline.com/common token endpoint (matches the initiate step).
    The redirect_uri MUST exactly match what was used in the initiate step.
    """
    try:
        if error:
            logger.warning(f"Microsoft OAuth error: {error} - {error_description}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": error,
                    "error_description": error_description
                }
            )

        if not code or not state:
            logger.error(f"Microsoft OAuth callback missing params: code={bool(code)}, state={bool(state)}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing OAuth parameters",
                    "message": "Microsoft did not return 'code' or 'state'. Ensure the OAuth flow was initiated correctly."
                }
            )

        resolved_account_id = account_id
        if resolved_account_id is None and "|" in state:
            try:
                _, account_id_str = state.rsplit("|", 1)
                resolved_account_id = int(account_id_str)
            except (ValueError, IndexError):
                pass

        if resolved_account_id is None:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing account_id",
                    "message": "Could not parse account_id from state. Ensure you started OAuth from the integrations page."
                }
            )

        client_id = os.getenv("MICROSOFT_ADS_CLIENT_ID", os.getenv("MICROSOFT_CLIENT_ID"))
        client_secret = os.getenv("MICROSOFT_ADS_CLIENT_SECRET", os.getenv("MICROSOFT_CLIENT_SECRET"))

        if not client_id or not client_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Microsoft OAuth not configured",
                    "message": "MICROSOFT_ADS_CLIENT_ID and MICROSOFT_ADS_CLIENT_SECRET must be set"
                }
            )

        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com")).rstrip("/")
        redirect_uri = os.getenv(
            "MICROSOFT_REDIRECT_URI",
            f"{frontend_url}/integrations/microsoft/oauth/callback"
        )

        scope_string = "https://ads.microsoft.com/msads.manage offline_access"

        logger.info(f"Microsoft OAuth callback: account_id={resolved_account_id}, redirect_uri={redirect_uri}")

        token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        token_data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "scope": scope_string,
        }

        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)

        token_json = token_response.json()

        if token_response.status_code != 200:
            error_code = token_json.get("error", "unknown")
            error_desc = token_json.get("error_description", token_response.text)
            logger.error(f"Microsoft token exchange failed: {error_code} - {error_desc}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": f"Token exchange failed: {error_code}",
                    "message": error_desc
                }
            )

        access_token = token_json.get("access_token")
        refresh_token = token_json.get("refresh_token")
        expires_in = token_json.get("expires_in", 3600)

        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "No access token in response",
                    "message": f"Microsoft API response: {token_json}"
                }
            )

        from datetime import datetime, timedelta
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

        db = SessionLocal()
        try:
            credential = PlatformCredentialService.store_credentials(
                db=db,
                client_id=resolved_account_id,
                platform="microsoft_ads",
                access_token=access_token,
                refresh_token=refresh_token,
                app_id=client_id,
                app_secret=client_secret,
                token_expires_at=expires_at
            )

            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Microsoft Ads account connected successfully",
                    "credential_id": credential.id,
                    "has_refresh_token": bool(refresh_token),
                    "expires_at": expires_at.isoformat(),
                    "expires_in_seconds": expires_in
                }
            )
        finally:
            db.close()

    except httpx.HTTPStatusError as e:
        logger.error(f"Microsoft OAuth callback HTTP error: {e.response.text}")
        return JSONResponse(
            status_code=e.response.status_code,
            content={
                "success": False,
                "error": "OAuth exchange failed",
                "message": e.response.text
            }
        )
    except Exception as e:
        logger.error(f"Microsoft OAuth callback error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "OAuth callback failed",
                "message": str(e)
            }
        )


# --- Spotify OAuth Endpoints ---
@app.get("/platforms/spotify/oauth/initiate")
async def initiate_spotify_oauth(
    account_id: int = Query(..., description="Kaivo account ID"),
    redirect_uri: Optional[str] = Query(None, description="Custom redirect URI (optional)")
):
    """
    Initiate Spotify OAuth flow. Redirects user to Spotify authorization page.
    """
    try:
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        
        if not client_id or not client_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Spotify OAuth not configured",
                    "message": "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set"
                }
            )
        
        # Generate state for CSRF protection and to carry account context
        import json
        import base64

        raw_state = {
            "csrf": uuid.uuid4().hex,
            "account_id": account_id,
        }
        state = base64.urlsafe_b64encode(
            json.dumps(raw_state).encode("utf-8")
        ).decode("utf-8")
        
        # Build redirect URI
        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com"))
        if not redirect_uri:
            redirect_uri = f"{frontend_url}/integrations/spotify/oauth/callback"
        
        # Spotify OAuth scopes
        scopes = [
            "user-read-private",
            "user-read-email",
            "playlist-read-private",
            "playlist-read-collaborative"
        ]
        scope_string = ",".join(scopes)
        
        # Build Spotify OAuth URL
        oauth_url = (
            f"https://accounts.spotify.com/authorize"
            f"?client_id={client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scope_string}"
            f"&state={state}"
            f"&response_type=code"
        )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "oauth_url": oauth_url,
                "state": state,
                "account_id": account_id
            }
        )
        
    except Exception as e:
        logger.error(f"Spotify OAuth initiation error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to initiate OAuth",
                "message": str(e)
            }
        )


@app.get("/platforms/spotify/oauth/callback")
async def spotify_oauth_callback(
    code: str = Query(..., description="OAuth authorization code"),
    state: str = Query(..., description="CSRF state token (may contain encoded account context)"),
    account_id: Optional[int] = Query(
        None, description="Kaivo account ID (optional; preferred via state payload)"
    ),
    error: Optional[str] = Query(None, description="OAuth error if any"),
    error_description: Optional[str] = Query(None, description="Error description"),
):
    """
    Handle Spotify OAuth callback.
    Exchanges authorization code for access + refresh tokens and stores them
    as platform credentials for the given account.
    """
    try:
        if error:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": error,
                    "error_description": error_description,
                },
            )

        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

        if not client_id or not client_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Spotify OAuth not configured",
                    "message": "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set",
                },
            )

        # Derive account_id from state if it was not provided explicitly.
        if account_id is None:
            import json
            import base64

            try:
                padding = "=" * (-len(state) % 4)
                decoded = base64.urlsafe_b64decode(state + padding).decode("utf-8")
                state_payload = json.loads(decoded)
                account_id_value = state_payload.get("account_id")
                if account_id_value is None:
                    raise ValueError("account_id missing from state payload")
                account_id = int(account_id_value)
            except Exception as e:
                logger.error(f"Failed to extract account_id from Spotify state: {e}", exc_info=True)
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Invalid OAuth state",
                        "message": "Could not determine account for Spotify connection",
                    },
                )

        # If we already have active Spotify credentials for this account, treat this
        # callback as idempotent success. This avoids "invalid_grant" errors when
        # the callback endpoint is hit multiple times with the same code.
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        db = SessionLocal()
        try:
            existing = PlatformCredentialService.get_credentials(
                db=db, client_id=account_id, platform="spotify"
            )
        finally:
            db.close()

        if existing and existing.get("access_token"):
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Spotify account connected successfully",
                    "account_id": account_id,
                },
            )

        # Build redirect URI (must match the one used in initiate_spotify_oauth)
        frontend_url = os.getenv(
            "FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com")
        )
        redirect_uri = f"{frontend_url}/integrations/spotify/oauth/callback"

        # Exchange authorization code for access + refresh tokens
        token_url = "https://accounts.spotify.com/api/token"
        token_payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            token_response = await client.post(
                token_url,
                data=token_payload,
                auth=(client_id, client_secret),
            )
            token_response.raise_for_status()
            token_data = token_response.json()

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)

        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Failed to get access token",
                    "message": "Spotify API did not return access token",
                },
            )

        # Calculate expiration datetime
        from datetime import datetime, timedelta

        access_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

        # Store credentials in database (encrypted)
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        db = SessionLocal()
        try:
            credential = PlatformCredentialService.store_credentials(
                db=db,
                client_id=account_id,
                platform="spotify",
                access_token=access_token,
                refresh_token=refresh_token,
                app_id=client_id,
                app_secret=client_secret,
                token_expires_at=access_expires_at,
            )

            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Spotify account connected successfully",
                    "account_id": account_id,
                    "credential_id": credential.id,
                    "access_expires_at": access_expires_at.isoformat(),
                    "access_expires_in_seconds": expires_in,
                },
            )
        finally:
            db.close()

    except httpx.HTTPStatusError as e:
        logger.error(f"Spotify OAuth callback HTTP error: {e.response.text}")
        return JSONResponse(
            status_code=e.response.status_code,
            content={
                "success": False,
                "error": "Spotify token exchange failed",
                "message": e.response.text,
            },
        )
    except Exception as e:
        logger.error(f"Spotify OAuth callback error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to complete Spotify OAuth callback",
                "message": str(e),
            },
        )


# --- Spotify Ad Accounts & Campaign Launch Endpoints ---

@app.get("/platforms/spotify/ad-accounts")
async def get_spotify_ad_accounts(request: Request):
    """
    Fetch all Spotify ad accounts for the authenticated user.
    Resolves access token from: query param > stored credentials > env var.
    """
    try:
        access_token = request.query_params.get("access_token")
        account_id_raw = request.query_params.get("account_id")
        account_id: Optional[int] = None
        if account_id_raw:
            try:
                account_id = int(account_id_raw)
            except ValueError:
                account_id = None

        if not access_token:
            # Try explicit account_id first
            stored = resolve_platform_access_token("spotify", account_id)
            if stored:
                access_token = stored
                logger.info(f"Using stored Spotify access token for account_id={account_id}")
            else:
                # Fallback: search for ANY stored Spotify credentials
                # This handles the case where frontend doesn't pass account_id
                try:
                    from packages.db.database import SessionLocal
                    from services.account_service.platform_credentials import PlatformCredentialService
                    
                    db = SessionLocal()
                    try:
                        # Get the most recent Spotify credential
                        from packages.db.models import PlatformCredential
                        cred = db.query(PlatformCredential).filter(
                            PlatformCredential.platform == "spotify"
                        ).order_by(PlatformCredential.updated_at.desc()).first()
                        
                        if cred:
                            creds = PlatformCredentialService.get_credentials(db, cred.account_id, "spotify")
                            if creds and creds.get("access_token"):
                                access_token = creds["access_token"]
                                logger.info(f"Using stored Spotify access token from account_id={cred.account_id}")
                    finally:
                        db.close()
                except Exception as e:
                    logger.warning(f"Failed to lookup any Spotify credentials: {e}")
            
            # Final fallback: env var
            if not access_token:
                access_token = os.getenv("SPOTIFY_ACCESS_TOKEN")

        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing access token",
                    "error_code": "MISSING_TOKEN",
                    "message": "Connect your Spotify account first via the Integrations page.",
                    "ad_accounts": [],
                },
            )

        from services.platform_service.connector_factory import get_connector

        connector = get_connector("spotify", credentials={"access_token": access_token})
        result = connector.fetch_ad_accounts(access_token=access_token)

        status_code = 200 if result.get("success") else 400
        return JSONResponse(status_code=status_code, content=result)

    except Exception as e:
        logger.error(f"Spotify ad-accounts endpoint error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Internal error: {str(e)}",
                "error_code": "INTERNAL_ERROR",
                "ad_accounts": [],
            },
        )


@app.post("/platforms/spotify/campaigns/{campaign_id}/launch")
async def launch_spotify_campaign(campaign_id: str, request: Request):
    """
    Launch a campaign to Spotify Ads platform.
    Body: { ad_account_id (required), campaign_config (optional), access_token (optional) }
    """
    try:
        body = await request.json() if request.headers.get("content-type") == "application/json" else {}
        ad_account_id = body.get("ad_account_id")
        campaign_config = body.get("campaign_config", {})
        access_token = body.get("access_token")

        if not ad_account_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Missing ad_account_id",
                    "error_code": "MISSING_PARAMETER",
                    "message": "Provide ad_account_id in request body",
                },
            )

        from sqlalchemy.orm import Session
        from packages.db.database import get_db
        from packages.db.models import Campaign

        db_gen = get_db()
        db: Session = next(db_gen)
        try:
            campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()

            if not campaign:
                return JSONResponse(
                    status_code=404,
                    content={"success": False, "error": "Campaign not found", "error_code": "NOT_FOUND"},
                )

            if not access_token and campaign.client_id:
                stored = resolve_platform_access_token("spotify", campaign.client_id)
                if stored:
                    access_token = stored

            if not access_token:
                access_token = os.getenv("SPOTIFY_ACCESS_TOKEN")

            if not access_token:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Missing Spotify access token",
                        "error_code": "MISSING_TOKEN",
                        "message": "Connect your Spotify account first.",
                    },
                )

            from services.platform_service.connector_factory import get_connector

            connector = get_connector("spotify", credentials={"access_token": access_token})

            total_budget_cents = campaign.total_budget_cents or 0
            launch_config = {
                "name": campaign.name,
                "goal": campaign.goal or "awareness",
                "total_budget_cents": total_budget_cents,
                "ad_account_id": ad_account_id,
                "access_token": access_token,
                "client_id": campaign.client_id,
                "audience_id": campaign.audience_id,
            }
            launch_config.update(campaign_config)

            result = connector.launch_campaign(launch_config)

            if result.get("success") and result.get("platform_campaign_id"):
                if not campaign.platform_campaign_ids:
                    campaign.platform_campaign_ids = {}
                campaign.platform_campaign_ids["spotify"] = result["platform_campaign_id"]
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(campaign, "platform_campaign_ids")
                db.commit()

            status_code = 200 if result.get("success") else 400
            return JSONResponse(status_code=status_code, content=result)

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Spotify campaign launch error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Internal error: {str(e)}",
                "error_code": "INTERNAL_ERROR",
            },
        )


# --- Google Ads OAuth Endpoints ---
@app.get("/platforms/google/oauth/initiate")
async def initiate_google_ads_oauth(
    account_id: int = Query(..., description="Kaivo account ID"),
    redirect_uri: Optional[str] = Query(None, description="Custom redirect URI (optional)")
):
    """
    Initiate Google Ads OAuth flow. Redirects user to Google authorization page.
    """
    try:
        client_id = os.getenv("GOOGLE_ADS_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_ADS_CLIENT_SECRET")
        
        if not client_id or not client_secret:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": "Google Ads OAuth not configured",
                    "message": "GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET must be set"
                }
            )
        
        # Generate state for CSRF protection
        state = uuid.uuid4().hex
        
        # Build redirect URI
        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_APP_URL", "https://app.getkaivo.com"))
        if not redirect_uri:
            redirect_uri = f"{frontend_url}/integrations/google/oauth/callback"
        
        # Google OAuth scopes for Google Ads
        scopes = [
            "https://www.googleapis.com/auth/adwords"
        ]
        scope_string = ",".join(scopes)
        
        # Build Google OAuth URL
        oauth_url = (
            f"https://accounts.google.com/o/oauth2/v2/auth"
            f"?client_id={client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scope_string}"
            f"&state={state}"
            f"&response_type=code"
            f"&access_type=offline"
            f"&include_granted_scopes=true"
        )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "oauth_url": oauth_url,
                "state": state,
                "account_id": account_id
            }
        )
        
    except Exception as e:
        logger.error(f"Google Ads OAuth initiation error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to initiate OAuth",
                "message": str(e)
            }
        )


@app.post("/platform-credentials/store")
async def store_platform_credentials(request: Request):
    """
    Store platform credentials for an account.
    """
    try:
        # Verify authentication
        _verify_auth_header(request)
        
        # Parse request body and query parameters
        body = await request.json()
        query_params = dict(request.query_params)
        
        client_id = query_params.get('client_id')
        if not client_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "client_id is required",
                    "message": "client_id query parameter must be provided"
                }
            )
        
        # Convert client_id to int
        try:
            account_id = int(client_id)
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Invalid account_id",
                    "message": "account_id must be a valid integer"
                }
            )
        
        platform = body.get('platform')
        if not platform:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "platform is required",
                    "message": "platform field must be provided in request body"
                }
            )
        
        # Use the existing service to store credentials
        from services.account_service.platform_credentials import PlatformCredentialService
        from packages.db.database import SessionLocal
        
        db = SessionLocal()
        try:
            credential = PlatformCredentialService.store_credentials(
                db=db,
                client_id=account_id,
                platform=platform,
                access_token=body.get('access_token'),
                refresh_token=body.get('refresh_token'),
                app_id=body.get('app_id'),
                app_secret=body.get('app_secret'),
            )
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "credential_id": credential.id,
                    "platform": credential.platform
                }
            )
        finally:
            db.close()
            
    except HTTPException:
        # Re-raise HTTP exceptions (like 401 from auth)
        raise
    except Exception as e:
        logger.error(f"Error storing platform credentials: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to store platform credentials",
                "message": str(e)
            }
        )

@app.delete("/platform-credentials/{platform}")
async def revoke_platform_credentials(request: Request, platform: str, client_id: int = None):
    """
    Revoke platform credentials for a client.
    """
    try:
        # Verify authentication
        _verify_auth_header(request)
        
        # Use client_id from query param
        resolved_account_id = client_id
        if not resolved_account_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "client_id is required",
                    "message": "client_id query parameter must be provided"
                }
            )
        
        # Use the existing service to revoke credentials
        from services.account_service.platform_credentials import PlatformCredentialService
        from packages.db.database import SessionLocal
        from packages.db.models import PlatformCredential
        
        internal_platform = normalize_platform_name(platform)
        
        db = SessionLocal()
        try:
            existing_creds = PlatformCredentialService.get_credentials(db, resolved_account_id, internal_platform)
            if not existing_creds:
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "error": "Credentials not found",
                        "message": f"No credentials found for platform {platform} and account {resolved_account_id}"
                    }
                )
            
            credential = db.query(PlatformCredential).filter(
                PlatformCredential.account_id == resolved_account_id,
                PlatformCredential.platform == internal_platform
            ).first()
            
            if credential:
                credential.is_active = False
                db.commit()
                
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Credentials revoked successfully"
                }
            )
        finally:
            db.close()
            
    except HTTPException:
        # Re-raise HTTP exceptions (like 401 from auth)
        raise
    except Exception as e:
        logger.error(f"Error revoking platform credentials: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to revoke platform credentials",
                "message": str(e)
            }
        )


@app.get("/api/env-validation")
async def get_env_validation():
    """
    Check environment validation status.
    Useful for deployment verification and monitoring.
    """
    try:
        errors = validate_environment()
        env = os.getenv("ENVIRONMENT", "development")

        return {
            "environment": env,
            "validation_passed": len(errors) == 0,
            "errors": errors,
            "timestamp": time.time()
        }

    except Exception as e:
        logger.error(f"Error during environment validation: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to validate environment"}
        )



# ---------------------------------------------------------------------------
# TikTok Token Refresh Helper
# ---------------------------------------------------------------------------
async def _refresh_tiktok_token(db, account_id: int, creds: dict) -> bool:
    """Refresh an expired TikTok access token using the stored refresh token."""
    try:
        refresh_token = creds.get("refresh_token")
        app_id = creds.get("app_id") or os.getenv("TIKTOK_APP_ID")
        app_secret = creds.get("app_secret") or os.getenv("TIKTOK_APP_SECRET")

        if not refresh_token or not app_id or not app_secret:
            logger.warning("Cannot refresh TikTok token: missing refresh_token, app_id, or app_secret")
            return False

        token_url = "https://open.tiktokapis.com/v2/oauth/token/"
        payload = {
            "client_key": app_id,
            "client_secret": app_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(token_url, data=payload)

        if resp.status_code != 200:
            logger.error(f"TikTok token refresh HTTP {resp.status_code}: {resp.text}")
            return False

        data = resp.json()
        token_data = data.get("data", data) if isinstance(data, dict) else {}
        new_access = token_data.get("access_token")
        new_refresh = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 86400)

        if not new_access:
            logger.error(f"TikTok token refresh did not return access_token: {data}")
            return False

        from datetime import datetime, timedelta
        from services.account_service.platform_credentials import PlatformCredentialService

        new_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        PlatformCredentialService.store_credentials(
            db=db,
            client_id=account_id,
            platform="tiktok",
            access_token=new_access,
            refresh_token=new_refresh or refresh_token,
            app_id=app_id,
            app_secret=app_secret,
            token_expires_at=new_expires_at,
        )
        logger.info(f"TikTok token refreshed successfully for account {account_id}")
        return True
    except Exception as e:
        logger.error(f"TikTok token refresh error: {e}", exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Select Ad Account Endpoint
# ---------------------------------------------------------------------------
@app.post("/platform-credentials/{platform}/select-account")
async def select_platform_ad_account(request: Request, platform: str, client_id: int = Query(None)):
    """
    Save the user's selected ad account for a given platform.
    Body: { ad_account_id: string, ad_account_name?: string, currency?: string }
    """
    try:
        _verify_auth_header(request)

        if not client_id:
            return JSONResponse(status_code=400, content={
                "success": False, "error": "client_id query parameter is required"
            })

        body = await request.json()
        ad_account_id = body.get("ad_account_id")
        if not ad_account_id:
            return JSONResponse(status_code=400, content={
                "success": False, "error": "ad_account_id is required in the request body"
            })

        internal_platform = normalize_platform_name(platform)

        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService

        db = SessionLocal()
        try:
            success = PlatformCredentialService.set_ad_account(
                db=db,
                client_id=client_id,
                platform=internal_platform,
                ad_account_id=ad_account_id,
                ad_account_name=body.get("ad_account_name"),
                currency=body.get("currency"),
            )
            if not success:
                return JSONResponse(status_code=404, content={
                    "success": False,
                    "error": f"No credentials found for {platform}. Connect the platform first."
                })
            return JSONResponse(content={
                "success": True,
                "message": f"Ad account {ad_account_id} selected for {platform}",
                "ad_account_id": ad_account_id,
            })
        finally:
            db.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error selecting ad account for {platform}: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={
            "success": False, "error": str(e)
        })


@app.get("/platforms/{platform}/ad-accounts")
async def get_platform_ad_accounts_generic(platform: str, request: Request):
    """
    Generic ad accounts fetching for a specific platform (reddit, tiktok, microsoft_ads, etc).
    Normalizes URL-facing platform slugs (e.g. 'microsoft') to internal names (e.g. 'microsoft_ads').
    Attempts token refresh for TikTok when the stored token is expired.
    """
    internal_platform = normalize_platform_name(platform)
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    
    try:
        from packages.db.database import SessionLocal
        from services.account_service.platform_credentials import PlatformCredentialService
        from services.platform_service.connector_factory import get_connector

        account_id_raw = request.query_params.get("account_id")
        account_id = None
        if account_id_raw:
            try:
                account_id = int(account_id_raw)
            except ValueError:
                pass

        db = SessionLocal()
        try:
            creds = PlatformCredentialService.get_credentials(db, account_id, internal_platform)
            if not creds:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": f"Missing credentials for {platform}",
                        "error_code": "MISSING_CREDENTIALS",
                        "ad_accounts": []
                    }
                )

            # Auto-refresh expired TikTok tokens
            if internal_platform == "tiktok" and creds.get("refresh_token"):
                from datetime import datetime
                expires_at = creds.get("token_expires_at")
                if expires_at and isinstance(expires_at, datetime) and expires_at < datetime.utcnow():
                    logger.info(f"TikTok token expired for account {account_id}, attempting refresh")
                    refreshed = await _refresh_tiktok_token(db, account_id, creds)
                    if refreshed:
                        creds = PlatformCredentialService.get_credentials(db, account_id, internal_platform)
                    else:
                        logger.warning("TikTok token refresh failed")
        finally:
            db.close()

        connector = get_connector(internal_platform, credentials=creds)
        
        if hasattr(connector, 'fetch_ad_accounts'):
            result = connector.fetch_ad_accounts(correlation_id=correlation_id)
        else:
            result = {
                "success": False,
                "error": f"fetch_ad_accounts not supported for {platform}",
                "error_code": "NOT_SUPPORTED",
                "ad_accounts": []
            }
            
        if result.get("success"):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=400)

    except Exception as e:
        logger.error(f"{platform} fetch ad accounts error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Failed to fetch ad accounts",
                "error_code": "INTERNAL_ERROR",
                "message": str(e),
                "ad_accounts": []
            }
        )


@app.post("/platforms/reddit/campaigns/{campaign_id}/launch")
async def launch_reddit_campaign(campaign_id: str, request: Request):
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    
    try:
        from sqlalchemy.orm import Session
        from packages.db.database import get_db, SessionLocal
        from packages.db.models import Campaign
        from services.account_service.platform_credentials import PlatformCredentialService
        from services.platform_service.connector_factory import get_connector
        
        db = SessionLocal()
        try:
            campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()
            if not campaign:
                return JSONResponse(status_code=404, content={"success": False, "error": "Campaign not found"})
                
            creds = PlatformCredentialService.get_credentials(db, campaign.account_id, "reddit")
            if not creds:
                return JSONResponse(status_code=400, content={"success": False, "error": "No Reddit credentials found. Connect in Settings."})
                
            connector = get_connector("reddit", credentials=creds)
            
            reddit_config = {
                "name": campaign.name,
                "goal": campaign.goal,
                "total_budget_cents": campaign.total_budget_cents,
                "ad_account_id": creds.get("ad_account_id")
            }
            
            result = connector.launch_campaign(reddit_config)
            
            if result.get("success"):
                platform_ids = campaign.platform_campaign_ids or {}
                platform_ids["reddit"] = result.get("platform_campaign_id")
                campaign.platform_campaign_ids = platform_ids
                db.commit()
                
            return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
        finally:
            db.close()
    except Exception as e:
        import logging
        logging.error(f"Launch Reddit campaign error: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/platforms/spotify/campaigns/{campaign_id}/launch")
async def launch_spotify_campaign(campaign_id: str, request: Request):
    correlation_id = getattr(request.state, 'correlation_id', 'unknown')
    
    try:
        from sqlalchemy.orm import Session
        from packages.db.database import get_db, SessionLocal
        from packages.db.models import Campaign
        from services.account_service.platform_credentials import PlatformCredentialService
        from services.platform_service.connector_factory import get_connector
        
        db = SessionLocal()
        try:
            campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()
            if not campaign:
                return JSONResponse(status_code=404, content={"success": False, "error": "Campaign not found"})
                
            creds = PlatformCredentialService.get_credentials(db, campaign.account_id, "spotify")
            if not creds:
                return JSONResponse(status_code=400, content={"success": False, "error": "No Spotify credentials found. Connect in Settings."})
                
            connector = get_connector("spotify", credentials=creds)
            
            spotify_config = {
                "name": campaign.name,
                "goal": campaign.goal,
                "total_budget_cents": campaign.total_budget_cents,
                "ad_account_id": creds.get("ad_account_id")
            }
            
            result = connector.launch_campaign(spotify_config)
            
            if result.get("success"):
                platform_ids = campaign.platform_campaign_ids or {}
                platform_ids["spotify"] = result.get("platform_campaign_id")
                campaign.platform_campaign_ids = platform_ids
                db.commit()
                
            return JSONResponse(content=result, status_code=200 if result.get("success") else 400)
        finally:
            db.close()
    except Exception as e:
        import logging
        logging.error(f"Launch Spotify campaign error: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
