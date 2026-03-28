"""Integration Verifier for Agent Service

Ensures AI agent execution is gated on critical integration health,
per Milestone 3 requirements.

Responsibilities:
- Check OpenAI API key presence.
- Check database connectivity.
- Check Redis availability.
- Check API Gateway health.
- Check Meta connector credentials via test-connection.

Behavior by environment (ENVIRONMENT):
- staging/production: any failed check -> overall status "blocked".
- development: failures downgraded to warnings; agent may proceed.

Result shape (dict returned by verify_integrations):
{
  "environment": str,
  "status": "ok" | "warning" | "blocked",
  "errors": [str],
  "warnings": [str],
  "checks": {
      "openai": {"ok": bool, "error": Optional[str]},
      "database": {...},
      "redis": {...},
      "api_gateway": {...},
      "meta_connector": {...}
  }
}

This dict is passed through OrchestratorOutput.integration_status so the
frontend can surface detailed safety context.
"""

from typing import Dict, Any, List, Tuple, Optional
import logging
import os
import time

import httpx
from sqlalchemy import text
from redis import Redis
from services.shared.observability import INTEGRATION_CHECKS_TOTAL

logger = logging.getLogger(__name__)

# Simple in-memory cache to avoid hammering dependencies on every request
_CACHE_TTL_SECONDS = int(os.getenv("AGENT_INTEGRATION_CHECK_TTL", "30"))
_last_result: Optional[Dict[str, Any]] = None
_last_result_ts: Optional[float] = None

def _get_cache_ttl_seconds() -> int:
    """Get cache TTL dynamically to support testing."""
    return int(os.getenv("AGENT_INTEGRATION_CHECK_TTL", "30"))


def _record_result(
    env: str,
    checks: Dict[str, Dict[str, Any]],
    errors: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    """Compute overall status and build final result dict."""
    has_errors = len(errors) > 0
    has_warnings = len(warnings) > 0

    if env in ["staging", "production"]:
        if has_errors:
            status = "blocked"
        elif has_warnings:
            status = "warning"
        else:
            status = "ok"
    else:
        # In development, errors are treated as warnings for execution gating,
        # but still surfaced to the frontend for visibility.
        if has_errors or has_warnings:
            status = "warning"
        else:
            status = "ok"

    result: Dict[str, Any] = {
        "environment": env,
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
    }

    global _last_result, _last_result_ts
    _last_result = result
    _last_result_ts = time.time()

    return result


def verify_integrations(force: bool = False, correlation_id: Optional[str] = None) -> Dict[str, Any]:
    """Run all integration checks and return structured status.

    This function is intentionally synchronous so it can be called from FastAPI
    endpoints without requiring async/await at call sites.
    """
    global _last_result, _last_result_ts

    now = time.time()
    if (
        not force
        and _last_result is not None
        and _last_result_ts is not None
        and now - _last_result_ts < _get_cache_ttl_seconds()
    ):
        return _last_result

    env = os.getenv("ENVIRONMENT", "development")
    checks: Dict[str, Dict[str, Any]] = {}
    errors: List[str] = []
    warnings: List[str] = []

    # Optional correlation-aware headers for downstream HTTP checks
    http_headers = {"x-correlation-id": correlation_id} if correlation_id else None

    # --- OpenAI API Key ---
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        msg = "OPENAI_API_KEY is missing"
        if env in ["staging", "production"]:
            errors.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="openai", outcome="error").inc()
        else:
            warnings.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="openai", outcome="warning").inc()
        checks["openai"] = {"ok": False, "error": msg}
    else:
        checks["openai"] = {"ok": True}
        INTEGRATION_CHECKS_TOTAL.labels(check="openai", outcome="ok").inc()

    # --- Database connectivity ---
    try:
        from packages.db.database import engine  # type: ignore

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = {"ok": True}
        INTEGRATION_CHECKS_TOTAL.labels(check="database", outcome="ok").inc()
    except Exception as e:  # pragma: no cover - environment dependent
        msg = f"Database connectivity failed: {e}"
        logger.error(msg)
        if env in ["staging", "production"]:
            errors.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="database", outcome="error").inc()
        else:
            warnings.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="database", outcome="warning").inc()
        checks["database"] = {"ok": False, "error": msg}

    # --- Redis connectivity ---
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        try:
            r = Redis.from_url(redis_url)
            r.ping()
            checks["redis"] = {"ok": True}
            INTEGRATION_CHECKS_TOTAL.labels(check="redis", outcome="ok").inc()
        except Exception as e:  # pragma: no cover - environment dependent
            msg = f"Redis connectivity failed: {e}"
            logger.error(msg)
            if env in ["staging", "production"]:
                errors.append(msg)
                INTEGRATION_CHECKS_TOTAL.labels(check="redis", outcome="error").inc()
            else:
                warnings.append(msg)
                INTEGRATION_CHECKS_TOTAL.labels(check="redis", outcome="warning").inc()
            checks["redis"] = {"ok": False, "error": msg}
    else:
        msg = "REDIS_URL is not configured"
        # In staging/production we expect Redis to be available.
        if env in ["staging", "production"]:
            errors.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="redis", outcome="error").inc()
        else:
            warnings.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="redis", outcome="warning").inc()
        checks["redis"] = {"ok": False, "error": msg}

    # --- API Gateway health ---
    # Try API_GATEWAY_URL first, then fallback
    gateway_url = os.getenv("API_GATEWAY_URL")
    if not gateway_url:
        if os.getenv("KUBERNETES_SERVICE_HOST"):  # Running in K8s
            gateway_url = "http://api-gateway"
        else:
            public_api_url = os.getenv("NEXT_PUBLIC_API_URL", "")
            if public_api_url:
                gateway_url = public_api_url.replace("/api", "").rstrip("/")
            else:
                gateway_url = "http://localhost:8000"
    
    # In development, make API Gateway check non-blocking if it's not available
    gateway_available = True
    if env == "development" and gateway_url == "http://localhost:8000":
        # Quick check to see if API Gateway is reachable
        try:
            with httpx.Client(timeout=1.0) as client:
                resp = client.get(f"{gateway_url}/healthz", headers=http_headers)
                gateway_available = resp.status_code == 200
        except Exception:
            # In development, if API Gateway isn't reachable, just log a warning and continue
            logger.warning(f"API Gateway at {gateway_url} not reachable in development - marking as unavailable")
            gateway_available = False
    
    if gateway_available:
        try:
            with httpx.Client(timeout=2.0) as client:
                resp = client.get(f"{gateway_url}/healthz", headers=http_headers)
            if resp.status_code == 200:
                body: Dict[str, Any] = {}
                try:
                    body = resp.json()  # type: ignore[assignment]
                except Exception:
                    body = {}
                if isinstance(body, dict) and body.get("status") == "ok":
                    checks["api_gateway"] = {"ok": True}
                    INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="ok").inc()
                else:
                    msg = f"API Gateway /healthz returned non-ok body: {body!r}"
                    if env in ["staging", "production"]:
                        errors.append(msg)
                        INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="error").inc()
                    else:
                        warnings.append(msg)
                        INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="warning").inc()
                    checks["api_gateway"] = {"ok": False, "error": msg}
            else:
                msg = f"API Gateway /healthz returned status {resp.status_code}"
                if env in ["staging", "production"]:
                    errors.append(msg)
                    INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="error").inc()
                else:
                    warnings.append(msg)
                    INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="warning").inc()
                checks["api_gateway"] = {"ok": False, "error": msg}
        except Exception as e:  # pragma: no cover - network/env dependent
            msg = f"API Gateway unreachable at {gateway_url}: {e}"
            logger.error(msg)
            if env in ["staging", "production"]:
                errors.append(msg)
                INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="error").inc()
            else:
                warnings.append(msg)
                INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="warning").inc()
            checks["api_gateway"] = {"ok": False, "error": msg}
    else:
        # API Gateway not available - mark as warning in dev, error in prod
        msg = "API Gateway not available (non-blocking in development)"
        if env in ["staging", "production"]:
            errors.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="error").inc()
        else:
            warnings.append(msg)
            INTEGRATION_CHECKS_TOTAL.labels(check="api_gateway", outcome="warning").inc()
        checks["api_gateway"] = {"ok": False, "error": msg}

    # --- Connector / credentials (platform-agnostic) ---
    # Uses the API Gateway's /platforms/{connector}/test-connection endpoint.
    connectors_raw = os.getenv("REQUIRED_CONNECTORS", "meta")
    connectors = [c.strip() for c in connectors_raw.split(",") if c.strip()]

    # Only check connectors if API Gateway is available
    if not gateway_available:
        logger.warning("Skipping connector checks - API Gateway not available")
        for connector in connectors:
            check_key = f"connector_{connector}"
            checks[check_key] = {"ok": False, "error": "API Gateway not available"}
            if connector == "meta":
                checks["meta_connector"] = {"ok": False, "error": "API Gateway not available"}
    else:
        for connector in connectors:
            check_key = f"connector_{connector}"
            try:
                with httpx.Client(timeout=3.0) as client:
                    resp = client.post(
                        f"{gateway_url}/platforms/{connector}/test-connection",
                        json={},
                        headers=http_headers,
                    )
                body = resp.json()
                if resp.status_code == 200 and isinstance(body, dict) and body.get("success"):
                    checks[check_key] = {"ok": True}
                    INTEGRATION_CHECKS_TOTAL.labels(check=check_key, outcome="ok").inc()
                    # Backwards-compatible alias for Meta-specific key
                    if connector == "meta":
                        checks["meta_connector"] = {"ok": True}
                else:
                    error_msg = None
                    if isinstance(body, dict):
                        error_msg = body.get("error") or body.get("message")
                    msg = (
                        f"{connector} connector test-connection failed: "
                        f"status={resp.status_code}, error={error_msg or body!r}"
                    )
                    if env in ["staging", "production"]:
                        errors.append(msg)
                        INTEGRATION_CHECKS_TOTAL.labels(check=check_key, outcome="error").inc()
                    else:
                        warnings.append(msg)
                        INTEGRATION_CHECKS_TOTAL.labels(check=check_key, outcome="warning").inc()
                    checks[check_key] = {"ok": False, "error": msg}
                    if connector == "meta":
                        checks["meta_connector"] = {"ok": False, "error": msg}
            except Exception as e:  # pragma: no cover - network/env dependent
                msg = f"{connector} connector test-connection unreachable: {e}"
                logger.error(msg)
                if env in ["staging", "production"]:
                    errors.append(msg)
                    INTEGRATION_CHECKS_TOTAL.labels(check=check_key, outcome="error").inc()
                else:
                    warnings.append(msg)
                    INTEGRATION_CHECKS_TOTAL.labels(check=check_key, outcome="warning").inc()
                checks[check_key] = {"ok": False, "error": msg}
                if connector == "meta":
                    checks["meta_connector"] = {"ok": False, "error": msg}

    return _record_result(env, checks, errors, warnings)
