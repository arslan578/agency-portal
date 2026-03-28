"""
Kaivo Platform Service - Connector Management
Registry and factory for production advertising platform connectors.
"""

from typing import Dict, Any, Optional
from .connector_base import PlatformConnector
from .connectors.meta import MetaAdsConnector
from .connectors.google import GoogleAdsConnector
from .connectors.tiktok import TikTokAdsConnector
from .connectors.reddit import RedditAdsConnector
from .connectors.microsoft_ads import MicrosoftAdsConnector
from .connectors.spotify import SpotifyAdsConnector
import logging

logger = logging.getLogger(__name__)


PLATFORM_REGISTRY = {
    "meta": MetaAdsConnector,
    "facebook": MetaAdsConnector,
    "instagram": MetaAdsConnector,
    "google_ads": GoogleAdsConnector,
    "tiktok": TikTokAdsConnector,
    "reddit": RedditAdsConnector,
    "microsoft_ads": MicrosoftAdsConnector,
    "spotify": SpotifyAdsConnector,
}


def get_connector(platform_name: str, credentials: Optional[Dict[str, Any]] = None) -> PlatformConnector:
    """
    Factory function to get platform connector instance.
    
    Args:
        platform_name: Platform identifier (e.g., 'meta', 'google_ads')
        credentials: Optional credentials dict
    
    Returns:
        PlatformConnector instance
    
    Raises:
        ValueError: If platform_name is not recognized
    """
    if platform_name not in PLATFORM_REGISTRY:
        raise ValueError(f"Unknown platform: {platform_name}. Supported: {list(PLATFORM_REGISTRY.keys())}")
    
    connector_class = PLATFORM_REGISTRY[platform_name]
    return connector_class(credentials=credentials)
