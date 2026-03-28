from abc import ABC, abstractmethod
from typing import Dict, Any
import time
import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

class AdapterError(Exception):
    """Base class for adapter exceptions."""
    pass

class NetworkError(AdapterError):
    """Network related errors."""
    pass

class AuthError(AdapterError):
    """Authentication errors."""
    pass

class BaseAdapter(ABC):
    """
    Abstract Base Class for all Platform Adapters.
    Includes hardening features: Retries, Logging, Error Handling.
    """
    
    def __init__(self, platform_name: str, config: Dict[str, Any]):
        self.platform_name = platform_name
        self.config = config
        self.is_sandbox = config.get("sandbox_mode", False)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(NetworkError)
    )
    def create_campaign(self, plan_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Creates a campaign on the platform.
        Wrapped with retry logic for network resilience.
        """
        logger.info(f"[{self.platform_name}] Creating campaign (Sandbox: {self.is_sandbox})")
        try:
            if self.is_sandbox:
                return self._create_campaign_sandbox(plan_data)
            return self._create_campaign_real(plan_data)
        except Exception as e:
            logger.error(f"[{self.platform_name}] Create campaign failed: {str(e)}")
            # Map exceptions to AdapterError types if needed
            raise NetworkError(str(e))

    @abstractmethod
    def _create_campaign_real(self, plan_data: Dict[str, Any]) -> Dict[str, Any]:
        """Actual implementation for the platform API."""
        pass

    def _create_campaign_sandbox(self, plan_data: Dict[str, Any]) -> Dict[str, Any]:
        """Sandbox implementation for testing/dev."""
        time.sleep(0.5) # Simulate latency
        return {
            "id": f"mock_{self.platform_name}_{int(time.time())}",
            "status": "created",
            "platform": self.platform_name,
            "sandbox": True
        }

    @abstractmethod
    def fetch_reporting(self, campaign_id: str, date_range: tuple) -> Dict[str, Any]:
        """Fetches reporting data."""
        pass
