import structlog
import logging
import sys
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Request, Response
import time

# Configure Structlog
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

# Setup standard logging to use structlog
logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=logging.INFO,
)

logger = structlog.get_logger()

# Prometheus Metrics
REQUEST_COUNT = Counter(
    "http_requests_total", 
    "Total HTTP requests", 
    ["method", "endpoint", "status"]
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds", 
    "HTTP request latency", 
    ["method", "endpoint"]
)
ADAPTER_LATENCY = Histogram(
    "adapter_latency_seconds",
    "Latency of adapter calls",
    ["platform", "operation"]
)
ADAPTER_ERRORS = Counter(
    "adapter_errors_total",
    "Total adapter errors",
    ["platform", "operation", "error_type"]
)

# Connector-specific metrics (required for Milestone 3)
CONNECTOR_SUCCESS_RATE = Histogram(
    "connector_success_rate",
    "Connector operation success rate (0-1)",
    ["platform", "operation"]
)

CONNECTOR_RETRIES_TOTAL = Counter(
    "connector_retries_total",
    "Total connector retry attempts",
    ["platform", "operation", "retry_reason"]
)

CONNECTOR_REQUESTS_TOTAL = Counter(
    "connector_requests_total",
    "Total connector requests",
    ["platform", "operation", "status"]
)

RECONCILIATION_OUTCOMES = Counter(
    "reconciliation_outcomes_total",
    "Reconciliation operation outcomes",
    ["platform", "outcome_type"]
)

# Integration verifier metrics (per-check outcomes)
INTEGRATION_CHECKS_TOTAL = Counter(
    "integration_checks_total",
    "Total integration health check outcomes by check and outcome",
    ["check", "outcome"]  # outcome: ok | warning | error
)

async def observability_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Add request context to logs
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request.headers.get("X-Request-ID", "unknown"),
        method=request.method,
        path=request.url.path
    )
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    
    # Record metrics
    REQUEST_COUNT.labels(
        method=request.method, 
        endpoint=request.url.path, 
        status=response.status_code
    ).inc()
    
    REQUEST_LATENCY.labels(
        method=request.method, 
        endpoint=request.url.path
    ).observe(process_time)
    
    logger.info(
        "http_request_processed",
        status=response.status_code,
        latency=process_time
    )
    
    return response

async def metrics_endpoint():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
