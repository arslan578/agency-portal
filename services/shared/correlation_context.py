"""
Correlation Context Helper
Provides utilities for propagating correlation IDs across services and connectors.
"""

import uuid
import logging
from typing import Optional, Dict, Any
from contextvars import ContextVar

logger = logging.getLogger(__name__)

# Context variable for correlation ID (thread-safe)
_correlation_id: ContextVar[Optional[str]] = ContextVar('correlation_id', default=None)

def get_correlation_id() -> Optional[str]:
    """
    Get the current correlation ID from context.
    Returns None if not set.
    """
    return _correlation_id.get()

def set_correlation_id(correlation_id: Optional[str]) -> None:
    """
    Set the correlation ID in the current context.
    
    Args:
        correlation_id: The correlation ID to set. If None, clears the context.
    """
    if correlation_id:
        _correlation_id.set(correlation_id)
    else:
        _correlation_id.set(None)

def generate_correlation_id() -> str:
    """
    Generate a new correlation ID.
    
    Returns:
        A new UUID-based correlation ID.
    """
    return str(uuid.uuid4())

def get_or_create_correlation_id(existing_id: Optional[str] = None) -> str:
    """
    Get existing correlation ID or create a new one.
    
    Args:
        existing_id: Optional existing correlation ID (e.g., from request header).
    
    Returns:
        The correlation ID to use.
    """
    if existing_id:
        return existing_id
    
    current = get_correlation_id()
    if current:
        return current
    
    new_id = generate_correlation_id()
    set_correlation_id(new_id)
    return new_id

def add_correlation_to_headers(
    headers: Optional[Dict[str, str]] = None,
    correlation_id: Optional[str] = None
) -> Dict[str, str]:
    """
    Add correlation ID to HTTP headers.
    
    Args:
        headers: Existing headers dict (will be copied).
        correlation_id: Correlation ID to add. If None, uses current context.
    
    Returns:
        Headers dict with x-correlation-id added.
    """
    if headers is None:
        headers = {}
    else:
        headers = headers.copy()
    
    corr_id = correlation_id or get_correlation_id()
    if corr_id:
        headers['x-correlation-id'] = corr_id
    
    return headers

def add_correlation_to_log_context(
    log_data: Dict[str, Any],
    correlation_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Add correlation ID to log data.
    
    Args:
        log_data: Existing log data dict.
        correlation_id: Correlation ID to add. If None, uses current context.
    
    Returns:
        Log data dict with correlation_id added.
    """
    corr_id = correlation_id or get_correlation_id()
    if corr_id:
        log_data['correlation_id'] = corr_id
    return log_data

