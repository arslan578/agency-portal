from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import date

class AdapterConfig(BaseModel):
    api_key: str
    api_secret: str
    environment: str = "test" # test or production

class LaunchResult(BaseModel):
    platform_campaign_id: str
    status: str
    metadata: Dict[str, Any]

class EstimationResult(BaseModel):
    estimated_impressions: int
    estimated_reach: int
    estimated_cpm: float # Final CPM after markup
    currency: str = "USD"

class BaseAdapter(ABC):
    def __init__(self, config: AdapterConfig):
        self.config = config

    @abstractmethod
    async def authenticate(self) -> bool:
        """Authenticate with the platform."""
        pass

    @abstractmethod
    async def estimate_plan(self, plan_details: Dict[str, Any]) -> EstimationResult:
        """Get estimates for a plan without launching."""
        pass

    @abstractmethod
    async def launch_campaign(self, campaign_payload: Dict[str, Any]) -> LaunchResult:
        """Launch a campaign on the platform."""
        pass

    @abstractmethod
    async def fetch_reporting(self, campaign_id: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Fetch standardized reporting metrics."""
        pass

    @abstractmethod
    async def validate_creative(self, creative_url: str, creative_type: str) -> bool:
        """Check if creative meets platform specs."""
        pass

    async def check_health(self) -> bool:
        """
        Check if the adapter is healthy and the platform is reachable.
        Default implementation tries to authenticate.
        """
        try:
            return await self.authenticate()
        except Exception:
            return False

import asyncio
import functools
import logging

logger = logging.getLogger(__name__)

def with_timeout(seconds: int = 10):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await asyncio.wait_for(func(*args, **kwargs), timeout=seconds)
            except asyncio.TimeoutError:
                logger.error(f"Timeout executing {func.__name__} after {seconds}s")
                raise
        return wrapper
    return decorator

def with_retry(retries: int = 3, delay: int = 1):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    logger.warning(f"Attempt {attempt + 1}/{retries} failed for {func.__name__}: {e}")
                    await asyncio.sleep(delay * (2 ** attempt)) # Exponential backoff
            logger.error(f"All {retries} attempts failed for {func.__name__}")
            raise last_exception
        return wrapper
    return decorator
