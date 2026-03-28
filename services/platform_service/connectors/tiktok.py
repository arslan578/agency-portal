"""
Kaivo TikTok Ads Platform Connector
Production implementation for TikTok advertising platform.
"""

import os
import time
import random
from typing import Dict, Any, List, Optional, Callable
from ..connector_base import PlatformConnector, PlatformStatus
import logging
import httpx
from datetime import datetime

from services.shared.correlation_context import (
    get_or_create_correlation_id,
    add_correlation_to_headers,
    add_correlation_to_log_context,
    set_correlation_id
)
from services.shared.observability import (
    CONNECTOR_REQUESTS_TOTAL,
    CONNECTOR_RETRIES_TOTAL,
    ADAPTER_LATENCY,
    ADAPTER_ERRORS
)

logger = logging.getLogger(__name__)

def _retry_with_exponential_backoff(
    func: Callable,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    backoff_factor: float = 2.0,
    jitter: bool = True,
    correlation_id: Optional[str] = None
):
    """
    Retry a function with exponential backoff for TikTok API calls.
    Uses centralized retry policy from services/shared/retry_policy.
    """
    from services.shared.retry_policy import retry_with_exponential_backoff as centralized_retry, is_retryable
    
    def is_tiktok_error_retryable(e: Exception) -> bool:
        """Check if TikTok API error is retryable."""
        if isinstance(e, httpx.TimeoutException):
            return True
        
        if isinstance(e, httpx.HTTPStatusError):
            status = e.response.status_code
            return is_retryable(http_status=status)
        
        if isinstance(e, Exception):
            error_str = str(e).lower()
            if "rate" in error_str or "quota" in error_str or "429" in error_str:
                return True
            if "500" in error_str or "503" in error_str:
                return True
        
        return is_retryable(error=e)
    
    retry_count = [0]
    
    def wrapped_func():
        try:
            return func()
        except Exception as e:
            if is_tiktok_error_retryable(e):
                retry_count[0] += 1
                retry_reason = "timeout" if isinstance(e, httpx.TimeoutException) else (
                    "rate_limit" if (isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429) else
                    "server_error" if (isinstance(e, httpx.HTTPStatusError) and e.response.status_code >= 500) else
                    "network_error"
                )
                CONNECTOR_RETRIES_TOTAL.labels(platform="tiktok", operation="api_call", retry_reason=retry_reason).inc()
            raise
    
    return centralized_retry(
        func=wrapped_func,
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        backoff_factor=backoff_factor,
        jitter=jitter,
        is_retryable_func=is_tiktok_error_retryable,
        correlation_id=correlation_id,
        operation_name="tiktok_api_call"
    )


class TikTokAdsConnector(PlatformConnector):
    """
    TikTok Ads platform connector.
    Requires: TIKTOK_APP_ID, TIKTOK_APP_SECRET, TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_ID
    """
    
    @property
    def platform_name(self) -> str:
        return "tiktok"
    
    def _validate_credentials(self) -> None:
        """Validate TikTok API credentials."""
        if not self.credentials:
            app_id = os.getenv("TIKTOK_APP_ID")
            app_secret = os.getenv("TIKTOK_APP_SECRET")
            access_token = os.getenv("TIKTOK_ACCESS_TOKEN")
            advertiser_id = os.getenv("TIKTOK_ADVERTISER_ID")
            
            if app_id and app_secret and access_token and advertiser_id:
                self.credentials = {
                    "app_id": app_id,
                    "app_secret": app_secret,
                    "access_token": access_token,
                    "advertiser_id": advertiser_id
                }
                self.status = PlatformStatus.AVAILABLE
                logger.info("TikTok Ads connector: Credentials validated")
            else:
                self.status = PlatformStatus.STUB
                logger.warning("TikTok Ads connector: Missing credentials (stub mode)")
        else:
            self.status = PlatformStatus.AVAILABLE
    
    def estimate_reach(
        self,
        budget: float,
        geography: Optional[str] = None,
        demographics: Optional[Dict[str, Any]] = None,
        interests: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Estimate audience reach using TikTok CPM benchmarks.
        """
        if self.status != PlatformStatus.AVAILABLE:
            return self._fallback_reach_estimate(budget, geography)
        
        try:
            base_cpm = 12.0
            kaivo_markup = 1.5
            effective_cpm = base_cpm * kaivo_markup
            
            geo_multiplier = 1.0
            if geography:
                geo_lower = geography.lower()
                if "new york" in geo_lower or "los angeles" in geo_lower:
                    geo_multiplier = 1.4
                elif "dallas" in geo_lower or "austin" in geo_lower:
                    geo_multiplier = 1.2
            
            adjusted_cpm = effective_cpm * geo_multiplier
            impressions = int((budget / adjusted_cpm) * 1000)
            reach = int(impressions * 0.7)
            
            return {
                "estimated_impressions": impressions,
                "estimated_reach": reach,
                "estimated_cpm": adjusted_cpm,
                "confidence": 0.85
            }
            
        except Exception as e:
            logger.error(f"TikTok reach estimation failed: {e}")
            return self._fallback_reach_estimate(budget, geography)
    
    def _fallback_reach_estimate(self, budget: float, geography: Optional[str]) -> Dict[str, Any]:
        """Fallback estimation using Kaivo Intelligence models."""
        base_cpm = 12.0 * 1.5
        impressions = int((budget / base_cpm) * 1000)
        reach = int(impressions * 0.7)
        
        return {
            "estimated_impressions": impressions,
            "estimated_reach": reach,
            "estimated_cpm": base_cpm,
            "confidence": 0.75
        }
    
    def get_creative_specs(self) -> Dict[str, Any]:
        """TikTok-specific creative specifications."""
        return {
            "image": {
                "recommended_resolution": "1080x1080",
                "min_width": 720,
                "min_height": 720,
                "max_file_size_mb": 10,
                "formats": ["jpg", "png"]
            },
            "video": {
                "recommended_resolution": "720x1280",
                "min_width": 720,
                "min_height": 1280,
                "aspect_ratio": "9:16",
                "min_duration_seconds": 5,
                "max_duration_seconds": 60,
                "max_file_size_mb": 500,
                "formats": ["mp4", "mov"]
            },
            "text": {
                "max_ad_text_length": 100,
                "max_headline_length": 40
            },
            "ad_types": [
                "in_feed_video",
                "spark_ads",
                "brand_takeover",
                "top_view"
            ]
        }
    
    def _get_api_headers(self, correlation_id: Optional[str] = None) -> Dict[str, str]:
        """Get headers for TikTok API requests."""
        headers = {
            "Content-Type": "application/json",
            "Access-Token": self.credentials["access_token"]
        }
        if correlation_id:
            headers = add_correlation_to_headers(headers, correlation_id)
        return headers
    
    def launch_campaign(
        self, 
        campaign_config: Dict[str, Any],
        correlation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Launch campaign on TikTok Ads platform.
        Creates a Campaign object via TikTok Marketing API.
        
        Args:
            campaign_config: Campaign configuration dict
            correlation_id: Optional correlation ID for request tracking
        """
        corr_id = get_or_create_correlation_id(correlation_id)
        set_correlation_id(corr_id)
        
        log_data = add_correlation_to_log_context({
            "operation": "launch_campaign",
            "platform": "tiktok",
            "campaign_name": campaign_config.get('name', 'unknown')
        }, corr_id)
        logger.info("TikTok campaign launch started", extra=log_data)
        
        if self.status != PlatformStatus.AVAILABLE:
            logger.error("TikTok Ads connector not available", extra=log_data)
            raise RuntimeError("TikTok Ads connector not available. Configure credentials.")
        
        try:
            # First try from request, then credentials, then fallback to old advertiser_id
            advertiser_id = campaign_config.get("ad_account_id") or campaign_config.get("advertiser_id")
            if not advertiser_id:
                advertiser_id = self.credentials.get("ad_account_id") or self.credentials.get("advertiser_id")
                
            if not advertiser_id:
                logger.error("Missing ad_account_id in credentials and campaign config", extra=log_data)
                return {
                    "success": False,
                    "error": "Missing TikTok ad account ID. Please select an ad account in integrations.",
                    "error_code": "MISSING_ADVERTISER_ID"
                }
                
            access_token = self.credentials.get("access_token")
            
            goal_to_objective = {
                'awareness': 'REACH',
                'traffic': 'TRAFFIC',
                'conversion': 'CONVERSIONS',
                'conversions': 'CONVERSIONS',
                'video_views': 'VIDEO_VIEWS',
                'app_installs': 'APP_INSTALLS',
            }
            
            kaivo_goal = campaign_config.get('goal', 'traffic').lower()
            tiktok_objective = goal_to_objective.get(kaivo_goal, 'TRAFFIC')
            
            budget_dollars = campaign_config.get('total_budget_cents', 0) / 100.0
            daily_budget_dollars = budget_dollars / 30.0
            daily_budget_cents = int(daily_budget_dollars * 100)
            
            daily_budget_cents = max(daily_budget_cents, 2000)
            
            campaign_name = campaign_config.get('name', 'Kaivo Campaign')
            
            url = f"https://business-api.tiktok.com/open_api/v1.3/campaign/create/"
            
            payload = {
                "advertiser_id": advertiser_id,
                "campaign_name": campaign_name,
                "budget_mode": "BUDGET_MODE_DAY",
                "budget": daily_budget_cents,
                "objective_type": tiktok_objective,
                "operation_status": "ENABLE"
            }
            
            headers = self._get_api_headers(corr_id)
            
            def _make_request():
                with httpx.Client(timeout=60.0) as client:
                    response = client.post(url, json=payload, headers=headers)
                    return response
            
            response = _retry_with_exponential_backoff(_make_request, correlation_id=corr_id)
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get("code") == 0:
                    campaign_data = result.get("data", {})
                    tiktok_campaign_id = str(campaign_data.get("campaign_id", ""))
                    
                    CONNECTOR_REQUESTS_TOTAL.labels(platform="tiktok", operation="launch_campaign", status="success").inc()
                    
                    log_data = add_correlation_to_log_context({
                        "operation": "launch_campaign",
                        "platform": "tiktok",
                        "tiktok_campaign_id": tiktok_campaign_id,
                        "campaign_name": campaign_name
                    }, corr_id)
                    logger.info("TikTok campaign created successfully", extra=log_data)
                    
                    return {
                        "success": True,
                        "platform_campaign_id": tiktok_campaign_id,
                        "status": "enabled",
                        "created_at": datetime.utcnow().isoformat(),
                        "objective": tiktok_objective,
                        "message": f"Campaign created successfully on TikTok with ID: {tiktok_campaign_id}",
                        "correlation_id": corr_id
                    }
                else:
                    error_message = result.get("message", "Unknown TikTok API error")
                    error_code = result.get("code", "UNKNOWN_ERROR")
                    
                    CONNECTOR_REQUESTS_TOTAL.labels(platform="tiktok", operation="launch_campaign", status="error").inc()
                    ADAPTER_ERRORS.labels(platform="tiktok", operation="launch_campaign", error_type=str(error_code)).inc()
                    
                    log_data = add_correlation_to_log_context({
                        "operation": "launch_campaign",
                        "platform": "tiktok",
                        "error": error_message,
                        "error_code": error_code
                    }, corr_id)
                    logger.error("TikTok campaign launch failed", extra=log_data)
                    raise RuntimeError(f"TikTok API error: {error_message}")
            else:
                error_message = f"HTTP {response.status_code}"
                try:
                    error_data = response.json()
                    error_message = error_data.get("message", error_message)
                except:
                    pass
                
                CONNECTOR_REQUESTS_TOTAL.labels(platform="tiktok", operation="launch_campaign", status="error").inc()
                ADAPTER_ERRORS.labels(platform="tiktok", operation="launch_campaign", error_type=f"HTTP_{response.status_code}").inc()
                
                log_data = add_correlation_to_log_context({
                    "operation": "launch_campaign",
                    "platform": "tiktok",
                    "error": error_message,
                    "status_code": response.status_code
                }, corr_id)
                logger.error("TikTok campaign launch failed", extra=log_data)
                raise RuntimeError(f"TikTok API error: {error_message}")
            
        except RuntimeError:
            # Re-raise RuntimeError as-is (from API error handling above)
            raise
        except Exception as e:
            # Check if it's a timeout exception (handle both real and mocked httpx)
            is_timeout = False
            if hasattr(httpx, 'TimeoutException'):
                try:
                    if isinstance(e, httpx.TimeoutException):
                        is_timeout = True
                except (TypeError, AttributeError):
                    # httpx.TimeoutException might be mocked, check by name
                    is_timeout = type(e).__name__ == 'TimeoutException' or 'timeout' in str(e).lower()
            else:
                is_timeout = 'timeout' in str(e).lower() or type(e).__name__ == 'TimeoutException'
            
            if is_timeout:
                CONNECTOR_REQUESTS_TOTAL.labels(platform="tiktok", operation="launch_campaign", status="error").inc()
                ADAPTER_ERRORS.labels(platform="tiktok", operation="launch_campaign", error_type="TimeoutException").inc()
                
                log_data = add_correlation_to_log_context({
                    "operation": "launch_campaign",
                    "platform": "tiktok",
                    "error": "Request timeout"
                }, corr_id)
                logger.error("TikTok campaign launch failed: timeout", extra=log_data)
                raise RuntimeError("TikTok API request timeout")
            
            CONNECTOR_REQUESTS_TOTAL.labels(platform="tiktok", operation="launch_campaign", status="error").inc()
            ADAPTER_ERRORS.labels(platform="tiktok", operation="launch_campaign", error_type=type(e).__name__).inc()
            
            log_data = add_correlation_to_log_context({
                "operation": "launch_campaign",
                "platform": "tiktok",
                "error": str(e)
            }, corr_id)
            logger.error("TikTok campaign launch failed", extra=log_data, exc_info=True)
            raise

    def update_campaign(
        self,
        platform_campaign_id: str,
        campaign_config: Dict[str, Any],
        access_token: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update an existing TikTok Ads campaign.
        
        Args:
            platform_campaign_id: TikTok campaign ID
            campaign_config: Update configuration
            access_token: Optional access token override
            correlation_id: Optional correlation ID for request tracking
        """
        corr_id = get_or_create_correlation_id(correlation_id)
        set_correlation_id(corr_id)
        
        log_data = add_correlation_to_log_context({
            "operation": "update_campaign",
            "platform": "tiktok",
            "platform_campaign_id": platform_campaign_id
        }, corr_id)
        logger.info("TikTok campaign update started", extra=log_data)
        
        if self.status != PlatformStatus.AVAILABLE:
            logger.error("TikTok Ads connector not available", extra=log_data)
            raise RuntimeError("TikTok Ads connector not available. Configure credentials.")

        token = access_token or self.credentials.get("access_token")
        if not token:
            return {
                "success": False,
                "error": "Missing access token",
                "error_code": "MISSING_TOKEN"
            }

        try:
            advertiser_id = self.credentials["advertiser_id"]
            url = f"https://business-api.tiktok.com/open_api/v1.3/campaign/update/"
            
            payload = {
                "advertiser_id": advertiser_id,
                "campaign_id": platform_campaign_id
            }
            
            update_fields = {}
            if "name" in campaign_config:
                update_fields["campaign_name"] = campaign_config["name"]
            if "status" in campaign_config:
                status_map = {
                    "PAUSED": "DISABLE",
                    "ENABLED": "ENABLE",
                    "ACTIVE": "ENABLE"
                }
                update_fields["operation_status"] = status_map.get(campaign_config["status"], "ENABLE")
            if "daily_budget" in campaign_config:
                update_fields["budget"] = int(campaign_config["daily_budget"] * 100)
            
            if not update_fields:
                return {
                    "success": False,
                    "error": "No valid fields to update",
                    "error_code": "NO_UPDATE_FIELDS"
                }
            
            payload.update(update_fields)
            
            headers = {
                "Content-Type": "application/json",
                "Access-Token": token
            }
            headers = add_correlation_to_headers(headers, corr_id)
            
            def _make_request():
                with httpx.Client(timeout=30.0) as client:
                    response = client.post(url, json=payload, headers=headers)
                    return response
            
            response = _retry_with_exponential_backoff(_make_request, correlation_id=corr_id)
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get("code") == 0:
                    CONNECTOR_REQUESTS_TOTAL.labels(platform="tiktok", operation="update_campaign", status="success").inc()
                    
                    log_data = add_correlation_to_log_context({
                        "operation": "update_campaign",
                        "platform": "tiktok",
                        "platform_campaign_id": platform_campaign_id,
                        "status": "success"
                    }, corr_id)
                    logger.info("TikTok campaign updated successfully", extra=log_data)
                    return {
                        "success": True,
                        "platform_campaign_id": platform_campaign_id,
                        "updated_fields": list(update_fields.keys()),
                        "correlation_id": corr_id
                    }
                else:
                    error_message = result.get("message", "Unknown TikTok API error")
                    error_code = result.get("code", "UNKNOWN_ERROR")
                    
                    logger.error(f"TikTok campaign update failed: {error_message}")
                    return {
                        "success": False,
                        "error": error_message,
                        "error_code": f"TIKTOK_{error_code}",
                        "platform_campaign_id": platform_campaign_id
                    }
            else:
                error_data = response.json() if response.content else {}
                error_message = error_data.get("message", f"HTTP {response.status_code}") if isinstance(error_data, dict) else f"HTTP {response.status_code}"
                
                logger.error(f"TikTok campaign update failed: {error_message}")
                return {
                    "success": False,
                    "error": error_message,
                    "error_code": f"HTTP_{response.status_code}",
                    "platform_campaign_id": platform_campaign_id
                }

        except httpx.TimeoutException:
            logger.error("TikTok API update request timeout")
            return {
                "success": False,
                "error": "Request timeout - TikTok API did not respond",
                "error_code": "TIMEOUT",
                "platform_campaign_id": platform_campaign_id
            }
        except Exception as e:
            logger.error(f"TikTok campaign update failed: {e}")
            return {
                "success": False,
                "error": f"Update failed: {str(e)}",
                "error_code": "UPDATE_ERROR",
                "platform_campaign_id": platform_campaign_id
            }

    def fetch_reports(
        self,
        platform_campaign_id: str,
        date_range: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Fetch TikTok campaign performance metrics.
        """
        if self.status != PlatformStatus.AVAILABLE:
            raise RuntimeError("TikTok Ads connector not available. Configure credentials.")
        
        try:
            logger.info(f"Would fetch TikTok reports for campaign: {platform_campaign_id}")
            
            return {
                "impressions": 0,
                "clicks": 0,
                "spend": 0.0,
                "cpm": 0.0,
                "ctr": 0.0,
                "conversions": 0,
                "message": "Reporting pending TikTok API integration"
            }
            
        except Exception as e:
            logger.error(f"TikTok reporting failed: {e}")
            raise
    
    def pause_campaign(self, platform_campaign_id: str) -> bool:
        """
        Pause TikTok campaign.
        """
        if self.status != PlatformStatus.AVAILABLE:
            return False
        
        try:
            result = self.update_campaign(
                platform_campaign_id=platform_campaign_id,
                campaign_config={"status": "PAUSED"}
            )
            return result.get("success", False)
            
        except Exception as e:
            logger.error(f"TikTok campaign pause failed: {e}")
            return False

    def test_connection(self, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Test TikTok API connection.
        
        Returns:
            Dict with connection status and advertiser account info
        """
        corr_id = get_or_create_correlation_id(correlation_id)
        set_correlation_id(corr_id)
        
        if self.status != PlatformStatus.AVAILABLE:
            return {
                "success": False,
                "error": "TikTok Ads connector not available",
                "error_code": "NOT_AVAILABLE"
            }
        
        try:
            advertiser_id = self.credentials.get("ad_account_id") or self.credentials.get("advertiser_id")
            access_token = self.credentials["access_token"]
            
            if not advertiser_id:
                return {
                    "success": False,
                    "error": "Missing advertiser_id. Please select an ad account.",
                    "error_code": "MISSING_ADVERTISER_ID"
                }
            
            url = f"https://business-api.tiktok.com/open_api/v1.3/advertiser/info/"
            
            payload = {
                "advertiser_ids": [advertiser_id]
            }
            
            headers = self._get_api_headers(corr_id)
            
            def _make_request():
                with httpx.Client(timeout=10.0) as client:
                    response = client.get(url, params=payload, headers=headers)
                    return response
            
            response = _retry_with_exponential_backoff(_make_request, correlation_id=corr_id)
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get("code") == 0:
                    advertiser_data = result.get("data", {}).get("list", [])
                    advertiser_info = advertiser_data[0] if advertiser_data else None
                    
                    return {
                        "success": True,
                        "advertiser_info": advertiser_info,
                        "correlation_id": corr_id
                    }
                else:
                    error_message = result.get("message", "Unknown TikTok API error")
                    return {
                        "success": False,
                        "error": error_message,
                        "error_code": f"TIKTOK_{result.get('code', 'UNKNOWN')}"
                    }
            else:
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}",
                    "error_code": f"HTTP_{response.status_code}"
                }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_code": "CONNECTION_ERROR"
            }

    def fetch_ad_accounts(self, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch all advertiser accounts associated with the authenticated user via TikTok Business API.
        Endpoint: /open_api/v1.3/oauth2/advertiser/get/
        """
        corr_id = get_or_create_correlation_id(correlation_id)
        set_correlation_id(corr_id)
        
        log_data = add_correlation_to_log_context({
            "operation": "fetch_ad_accounts",
            "platform": "tiktok"
        }, corr_id)
        logger.info("Fetching TikTok ad accounts", extra=log_data)
        
        if self.status != PlatformStatus.AVAILABLE:
            return {
                "success": False,
                "error": "TikTok Ads connector not available",
                "error_code": "NOT_AVAILABLE",
                "ad_accounts": []
            }
        
        try:
            app_id = self.credentials.get("app_id") or os.getenv("TIKTOK_APP_ID")
            secret = self.credentials.get("app_secret") or os.getenv("TIKTOK_APP_SECRET")
            access_token = self.credentials.get("access_token")
            
            if not access_token or not app_id or not secret:
                return {
                    "success": False,
                    "error": "Missing credentials (access_token, app_id, or secret)",
                    "error_code": "MISSING_CREDENTIALS",
                    "ad_accounts": []
                }
            
            url = "https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/"
            
            # For TikTok, secret is usually passed for oauth2/advertiser/get/
            params = {
                "app_id": app_id,
                "secret": secret
            }
            
            headers = self._get_api_headers(corr_id)
            
            def _make_request():
                with httpx.Client(timeout=10.0) as client:
                    return client.get(url, params=params, headers=headers)
            
            response = _retry_with_exponential_backoff(_make_request, correlation_id=corr_id)
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get("code") == 0:
                    advertiser_data = result.get("data", {}).get("list", [])
                    
                    # Normalize format to be consistent with frontend expectations
                    ad_accounts = [
                        {
                            "id": str(account.get("advertiser_id")),
                            "name": account.get("advertiser_name", f"Account {account.get('advertiser_id')}"),
                            "account_id": str(account.get("advertiser_id")),
                            "currency": "USD",  # TikTok doesn't always return currency here
                            "status": "active"
                        }
                        for account in advertiser_data
                    ]
                    
                    CONNECTOR_REQUESTS_TOTAL.labels(platform="tiktok", operation="fetch_ad_accounts", status="success").inc()
                    logger.info(f"TikTok ad accounts fetched successfully: {len(ad_accounts)}", extra=log_data)
                    return {
                        "success": True,
                        "ad_accounts": ad_accounts,
                        "correlation_id": corr_id
                    }
                else:
                    error_message = result.get("message", "Unknown TikTok API error")
                    return {
                        "success": False,
                        "error": error_message,
                        "error_code": f"TIKTOK_{result.get('code', 'UNKNOWN')}",
                        "ad_accounts": []
                    }
            else:
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}",
                    "error_code": f"HTTP_{response.status_code}",
                    "ad_accounts": []
                }
            
        except Exception as e:
            logger.error(f"TikTok fetch ad accounts failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "error_code": "CONNECTION_ERROR",
                "ad_accounts": []
            }

