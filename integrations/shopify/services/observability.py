"""
Shopify Integration Observability
Structured logging, metrics, and tracing for Shopify integration actions.
"""
import structlog
import os
from typing import Optional, Dict, Any
from prometheus_client import Counter, Histogram
# Get logger
logger = structlog.get_logger()

# Shopify-specific metrics
SHOPIFY_INSTALL_TOTAL = Counter(
    "shopify_install_total",
    "Total Shopify app installations",
    ["shop_domain"]
)

SHOPIFY_CONNECT_TOTAL = Counter(
    "shopify_connect_total",
    "Total Shopify store connections",
    ["shop_domain", "workspace_id"]
)

SHOPIFY_PROMOTE_TOTAL = Counter(
    "shopify_promote_total",
    "Total product promotions",
    ["shop_domain", "workspace_id", "status"]
)

SHOPIFY_ERROR_TOTAL = Counter(
    "shopify_error_total",
    "Total Shopify integration errors",
    ["shop_domain", "error_code", "retryable"]
)

SHOPIFY_UNINSTALL_TOTAL = Counter(
    "shopify_uninstall_total",
    "Total Shopify app uninstalls",
    ["shop_domain"]
)

SHOPIFY_ACTION_LATENCY = Histogram(
    "shopify_action_duration_seconds",
    "Shopify action execution latency",
    ["action", "shop_domain"]
)

# Tracer for distributed tracing (optional)
try:
    from opentelemetry import trace
    tracer = trace.get_tracer(__name__)
except ImportError:
    # Fallback if OpenTelemetry not available
    class MockTracer:
        def start_span(self, name):
            return MockSpan()
    class MockSpan:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def set_attribute(self, key, value):
            pass
    tracer = MockTracer()


def log_shopify_action(
    action: str,
    shop_domain: str,
    workspace_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    execution_id: Optional[str] = None,
    **kwargs
):
    """
    Log a Shopify integration action with structured fields.
    All logs must include shop_domain, workspace_id, correlation_id.
    """
    log_data = {
        "event": f"shopify_{action}",
        "shop_domain": shop_domain,
        "workspace_id": workspace_id,
        "correlation_id": correlation_id,
        "execution_id": execution_id,
    }
    
    # Add any additional context
    log_data.update(kwargs)
    
    # Redact sensitive data
    redacted_data = _redact_sensitive_data(log_data)
    
    logger.info(**redacted_data)


def _redact_sensitive_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Redact tokens and sensitive data from logs."""
    redacted = data.copy()
    sensitive_keys = ["access_token", "token", "secret", "password", "api_key", "api_secret"]
    
    for key in sensitive_keys:
        if key in redacted:
            redacted[key] = "[REDACTED]"
    
    return redacted


def record_metric(metric_name: str, labels: Dict[str, str], value: float = 1.0):
    """Record a metric with labels."""
    if metric_name == "shopify_install_total":
        SHOPIFY_INSTALL_TOTAL.labels(**labels).inc()
    elif metric_name == "shopify_connect_total":
        SHOPIFY_CONNECT_TOTAL.labels(**labels).inc()
    elif metric_name == "shopify_promote_total":
        SHOPIFY_PROMOTE_TOTAL.labels(**labels).inc(value)
    elif metric_name == "shopify_error_total":
        SHOPIFY_ERROR_TOTAL.labels(**labels).inc()
    elif metric_name == "shopify_uninstall_total":
        SHOPIFY_UNINSTALL_TOTAL.labels(**labels).inc()


def create_trace_span(action: str, shop_domain: str, workspace_id: Optional[str] = None):
    """Create a trace span for a Shopify action."""
    span = tracer.start_span(f"shopify.{action}")
    span.set_attribute("shop_domain", shop_domain)
    if workspace_id:
        span.set_attribute("workspace_id", workspace_id)
    return span
