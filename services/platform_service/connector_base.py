"""
Kaivo Universal Platform Connector - Base Interface
All 13 advertising platforms implement this standard interface.
"""

from typing import Dict, Any, List, Optional
from enum import Enum
from abc import ABC, abstractmethod


class PlatformStatus(Enum):
    """Platform connector status."""
    AVAILABLE = "available"          # Fully functional with credentials
    STUB = "stub"                     # Interface implemented, awaiting credentials
    UNAVAILABLE = "unavailable"       # Error or misconfiguration


class PlatformConnector(ABC):
    """
    Universal interface for all Kaivo advertising platforms.
    Each platform (Meta, Google, TikTok, etc.) implements this interface.
    """
    
    def __init__(self, credentials: Optional[Dict[str, Any]] = None):
        """
        Initialize platform connector.
        
        Args:
            credentials: Platform-specific credentials (API keys, tokens, etc.)
        """
        self.credentials = credentials
        self.status = PlatformStatus.STUB
        self._validate_credentials()
    
    @abstractmethod
    def _validate_credentials(self) -> None:
        """
        Validate credentials and set status.
        Should set self.status to AVAILABLE if valid, UNAVAILABLE if invalid.
        """
        pass
    
    @property
    @abstractmethod
    def platform_name(self) -> str:
        """Return platform name (e.g., 'meta', 'google_ads')."""
        pass
    
    @abstractmethod
    def estimate_reach(
        self,
        budget: float,
        geography: Optional[str] = None,
        demographics: Optional[Dict[str, Any]] = None,
        interests: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Estimate audience reach for given targeting parameters.
        
        Returns:
            {
                "estimated_impressions": int,
                "estimated_reach": int,
                "estimated_cpm": float,
                "confidence": float  # 0.0-1.0
            }
        """
        pass
    
    @abstractmethod
    def get_creative_specs(self) -> Dict[str, Any]:
        """
        Get platform-specific creative specifications.
        
        Returns:
            {
                "image": {"min_width": 1080, "min_height": 1080, ...},
                "video": {"min_duration": 3, "max_duration": 60, ...},
                "text": {"max_headline": 40, "max_description": 125, ...}
            }
        """
        pass
    
    @abstractmethod
    def launch_campaign(
        self,
        campaign_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Launch a new campaign on the platform.
        
        Args:
            campaign_config: Campaign configuration (budget, targeting, creatives, etc.)
        
        Returns:
            {
                "platform_campaign_id": str,
                "status": str,
                "created_at": str
            }
        """
        pass
    
    @abstractmethod
    def fetch_reports(
        self,
        platform_campaign_id: str,
        date_range: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Fetch campaign performance metrics.
        
        Returns:
            {
                "impressions": int,
                "clicks": int,
                "spend": float,
                "cpm": float,
                "ctr": float,
                "conversions": int
            }
        """
        pass
    
    @abstractmethod
    def pause_campaign(self, platform_campaign_id: str) -> bool:
        """
        Pause an active campaign.
        
        Returns:
            True if successful, False otherwise
        """
        pass
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get connector status information.
        
        Returns:
            {
                "platform": str,
                "status": str,
                "message": str
            }
        """
        return {
            "platform": self.platform_name,
            "status": self.status.value,
            "message": self._get_status_message()
        }
    
    def _get_status_message(self) -> str:
        """Get human-readable status message."""
        if self.status == PlatformStatus.AVAILABLE:
            return f"{self.platform_name} connector is fully operational"
        elif self.status == PlatformStatus.STUB:
            return f"{self.platform_name} connector awaiting credentials"
        else:
            return f"{self.platform_name} connector unavailable"
