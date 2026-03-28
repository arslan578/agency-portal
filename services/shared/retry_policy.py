"""
Centralized Retry Policy
Single source of truth for retry rules across all connectors and services.
Based on orchestrator/shared/ErrorAdapter.js RETRY_ALLOWLIST.
"""

from typing import Optional, Dict, Any, Callable
import logging
import time
import random
from enum import Enum

logger = logging.getLogger(__name__)


class RetryableErrorType(str, Enum):
    """Types of errors that are safe to retry."""
    RATE_LIMIT = "RATE_LIMIT"  # 429
    SERVER_ERROR = "SERVER_ERROR"  # 5xx
    NETWORK_TIMEOUT = "NETWORK_TIMEOUT"  # ETIMEDOUT, ECONNABORTED
    NETWORK_ERROR = "NETWORK_ERROR"  # ECONNRESET, ENOTFOUND, EAI_AGAIN
    UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT"
    DEADLOCK_DETECTED = "DEADLOCK_DETECTED"


class NonRetryableErrorType(str, Enum):
    """Types of errors that should NOT be retried."""
    AUTH_ERROR = "AUTH_ERROR"  # 401, 403
    INVALID_REQUEST = "INVALID_REQUEST"  # 400 (except rate limit)
    NOT_FOUND = "NOT_FOUND"  # 404
    CONFLICT = "CONFLICT"  # 409
    VALIDATION_ERROR = "VALIDATION_ERROR"  # 422


# Transient error codes that are safe to retry (from ErrorAdapter.js)
RETRY_ALLOWLIST = {
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',  # DNS temporary failure
    'DEADLOCK_DETECTED',
    'UPSTREAM_TIMEOUT',
    'ECONNABORTED',
    'ENOTFOUND'
}

# HTTP status codes that are retryable
RETRYABLE_HTTP_STATUS = {
    429,  # Rate limit
    500,  # Internal server error
    502,  # Bad gateway
    503,  # Service unavailable
    504,  # Gateway timeout
}

# HTTP status codes that are NOT retryable
NON_RETRYABLE_HTTP_STATUS = {
    400,  # Bad request (except 429 which is handled separately)
    401,  # Unauthorized
    403,  # Forbidden
    404,  # Not found
    409,  # Conflict
    422,  # Unprocessable entity
}


def is_retryable(
    error: Optional[Exception] = None,
    http_status: Optional[int] = None,
    error_code: Optional[str] = None,
    explicit_retryable: Optional[bool] = None
) -> bool:
    """
    Determine if an error is retryable based on strict rules.
    
    Args:
        error: Exception object (optional)
        http_status: HTTP status code (optional)
        error_code: Error code string (optional)
        explicit_retryable: Explicit override flag (optional)
    
    Returns:
        True if error is retryable, False otherwise
    
    Rules:
        1. If explicit_retryable is True, always retry
        2. If http_status is 429 or 5xx, retry
        3. If error_code is in RETRY_ALLOWLIST, retry
        4. If error has code attribute in RETRY_ALLOWLIST, retry
        5. Otherwise, do not retry
    """
    # Rule 1: Explicit override
    if explicit_retryable is True:
        return True
    
    # Rule 2: HTTP status codes
    if http_status is not None:
        if http_status in RETRYABLE_HTTP_STATUS:
            return True
        if http_status in NON_RETRYABLE_HTTP_STATUS:
            return False
    
    # Rule 3: Error code string
    if error_code and error_code in RETRY_ALLOWLIST:
        return True
    
    # Rule 4: Exception code attribute
    if error and hasattr(error, 'code'):
        if error.code in RETRY_ALLOWLIST:
            return True
    
    # Rule 5: Exception message patterns (timeout, network errors)
    if error and hasattr(error, 'message'):
        msg_lower = str(error.message).lower()
        if any(pattern in msg_lower for pattern in ['timeout', 'timed out', 'socket hang up', 'connection reset']):
            return True
    
    # Default: do not retry
    return False


def calculate_backoff_delay(
    attempt: int,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    backoff_factor: float = 2.0,
    jitter: bool = True
) -> float:
    """
    Calculate exponential backoff delay with optional jitter.
    
    Args:
        attempt: Current attempt number (0-indexed)
        base_delay: Base delay in seconds
        max_delay: Maximum delay in seconds
        backoff_factor: Exponential multiplier
        jitter: Whether to add random jitter (50-100% of calculated delay)
    
    Returns:
        Delay in seconds
    """
    delay = min(base_delay * (backoff_factor ** attempt), max_delay)
    
    if jitter:
        # Add jitter: 50-100% of calculated delay
        delay = delay * (0.5 + random.random() * 0.5)
    
    return delay


def retry_with_exponential_backoff(
    func: Callable,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    backoff_factor: float = 2.0,
    jitter: bool = True,
    is_retryable_func: Optional[Callable[[Exception], bool]] = None,
    correlation_id: Optional[str] = None,
    operation_name: Optional[str] = None
) -> Any:
    """
    Retry a function with exponential backoff using strict retry rules.
    
    Args:
        func: Function to retry (must be callable with no args, or use lambda)
        max_retries: Maximum number of retry attempts (default: 3)
        base_delay: Base delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 60.0)
        backoff_factor: Exponential multiplier (default: 2.0)
        jitter: Whether to add random jitter (default: True)
        is_retryable_func: Custom function to determine if error is retryable
        correlation_id: Optional correlation ID for logging
        operation_name: Optional operation name for logging
    
    Returns:
        Function result
    
    Raises:
        Last exception if all retries fail
    """
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_exception = e
            
            # Determine if error is retryable
            should_retry = False
            if is_retryable_func:
                should_retry = is_retryable_func(e)
            else:
                # Extract HTTP status if available
                http_status = None
                if hasattr(e, 'response') and hasattr(e.response, 'status_code'):
                    http_status = e.response.status_code
                elif hasattr(e, 'status_code'):
                    http_status = e.status_code
                
                # Extract error code if available
                error_code = None
                if hasattr(e, 'code'):
                    error_code = str(e.code)
                
                should_retry = is_retryable(
                    error=e,
                    http_status=http_status,
                    error_code=error_code
                )
            
            # If not retryable or max retries reached, raise
            if not should_retry or attempt >= max_retries:
                log_data = {
                    "operation": operation_name or "retry_operation",
                    "attempt": attempt + 1,
                    "max_retries": max_retries + 1,
                    "error": str(e),
                    "retryable": should_retry
                }
                if correlation_id:
                    log_data["correlation_id"] = correlation_id
                
                if not should_retry:
                    logger.warning(f"Non-retryable error on attempt {attempt + 1}", extra=log_data)
                else:
                    logger.error(f"Max retries reached on attempt {attempt + 1}", extra=log_data)
                raise e
            
            # Calculate backoff delay
            delay = calculate_backoff_delay(
                attempt=attempt,
                base_delay=base_delay,
                max_delay=max_delay,
                backoff_factor=backoff_factor,
                jitter=jitter
            )
            
            log_data = {
                "operation": operation_name or "retry_operation",
                "attempt": attempt + 1,
                "max_retries": max_retries + 1,
                "retry_delay": delay,
                "error": str(e)
            }
            if correlation_id:
                log_data["correlation_id"] = correlation_id
            
            logger.warning(f"Retry attempt {attempt + 1}/{max_retries + 1} after {delay:.2f}s", extra=log_data)
            time.sleep(delay)
    
    # Should never reach here, but just in case
    if last_exception:
        raise last_exception
    raise RuntimeError("Retry loop completed without result or exception")

