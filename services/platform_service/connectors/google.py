"""
Kaivo Google Ads Platform Connector
Production implementation for Google Ads advertising platform.
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
    Retry a function with exponential backoff for Google Ads API calls.
    Uses centralized retry policy from services/shared/retry_policy.
    """
    from services.shared.retry_policy import retry_with_exponential_backoff as centralized_retry, is_retryable
    
    def is_google_error_retryable(e: Exception) -> bool:
        """Check if Google Ads API error is retryable."""
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
            if is_google_error_retryable(e):
                retry_count[0] += 1
                retry_reason = "timeout" if isinstance(e, httpx.TimeoutException) else (
                    "rate_limit" if (isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429) else
                    "server_error" if (isinstance(e, httpx.HTTPStatusError) and e.response.status_code >= 500) else
                    "network_error"
                )
                CONNECTOR_RETRIES_TOTAL.labels(platform="google_ads", operation="api_call", retry_reason=retry_reason).inc()
            raise
    
    return centralized_retry(
        func=wrapped_func,
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        backoff_factor=backoff_factor,
        jitter=jitter,
        is_retryable_func=is_google_error_retryable,
        correlation_id=correlation_id,
        operation_name="google_ads_api_call"
    )

try:
    from google.ads.googleads.client import GoogleAdsClient
    from google.ads.googleads.errors import GoogleAdsException
    GOOGLE_ADS_SDK_AVAILABLE = True
except ImportError:
    GOOGLE_ADS_SDK_AVAILABLE = False
    logger.warning("google-ads-python SDK not installed. Google Ads connector will run in stub mode.")


class GoogleAdsConnector(PlatformConnector):
    """
    Google Ads platform connector.
    Requires: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
              GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID
    """
    
    @property
    def platform_name(self) -> str:
        return "google_ads"
    
    def _validate_credentials(self) -> None:
        """Validate Google Ads API credentials."""
        if not self.credentials:
            developer_token = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
            client_id = os.getenv("GOOGLE_ADS_CLIENT_ID")
            client_secret = os.getenv("GOOGLE_ADS_CLIENT_SECRET")
            refresh_token = os.getenv("GOOGLE_ADS_REFRESH_TOKEN")
            customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID")
            
            if developer_token and client_id and client_secret and refresh_token and customer_id and GOOGLE_ADS_SDK_AVAILABLE:
                login_customer_id = os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
                if login_customer_id and login_customer_id.isdigit() and len(login_customer_id) == 10 and not login_customer_id.startswith("CHANGE_ME"):
                    login_customer_id_value = login_customer_id
                else:
                    login_customer_id_value = None
                
                self.credentials = {
                    "developer_token": developer_token,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "customer_id": customer_id,
                    "login_customer_id": login_customer_id_value
                }
                self.status = PlatformStatus.AVAILABLE
                logger.info("Google Ads connector: Credentials validated")
            else:
                self.status = PlatformStatus.STUB
                if not GOOGLE_ADS_SDK_AVAILABLE:
                    logger.warning("Google Ads connector: SDK not available (stub mode)")
                else:
                    logger.warning("Google Ads connector: Missing credentials (stub mode)")
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
        Estimate audience reach using Google Ads benchmarks.
        """
        if self.status != PlatformStatus.AVAILABLE:
            return self._fallback_reach_estimate(budget, geography)
        
        try:
            base_cpm = 2.5
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
            reach = int(impressions * 0.75)
            
            return {
                "estimated_impressions": impressions,
                "estimated_reach": reach,
                "estimated_cpm": adjusted_cpm,
                "confidence": 0.85
            }
            
        except Exception as e:
            logger.error(f"Google Ads reach estimation failed: {e}")
            return self._fallback_reach_estimate(budget, geography)
    
    def _fallback_reach_estimate(self, budget: float, geography: Optional[str]) -> Dict[str, Any]:
        """Fallback estimation using Kaivo Intelligence models."""
        base_cpm = 2.5 * 1.5
        impressions = int((budget / base_cpm) * 1000)
        reach = int(impressions * 0.75)
        
        return {
            "estimated_impressions": impressions,
            "estimated_reach": reach,
            "estimated_cpm": base_cpm,
            "confidence": 0.75
        }
    
    def get_creative_specs(self) -> Dict[str, Any]:
        """Google Ads-specific creative specifications."""
        return {
            "image": {
                "recommended_resolution": "1200x628",
                "min_width": 600,
                "min_height": 314,
                "max_file_size_mb": 5,
                "formats": ["jpg", "png", "gif"]
            },
            "video": {
                "recommended_resolution": "1920x1080",
                "min_duration_seconds": 6,
                "max_duration_seconds": 60,
                "max_file_size_mb": 100,
                "formats": ["mp4", "mov", "avi"]
            },
            "text": {
                "max_headline_length": 30,
                "max_description_length": 90,
                "max_link_description_length": 30
            },
            "ad_types": [
                "search",
                "display",
                "video",
                "shopping",
                "performance_max"
            ],
            "responsive_search_ads": {
                "headlines": {"min": 3, "max": 15},
                "descriptions": {"min": 2, "max": 4}
            }
        }
    
    def _get_google_ads_client(self):
        """Initialize and return Google Ads API client."""
        if self.status != PlatformStatus.AVAILABLE:
            raise RuntimeError("Google Ads connector not available. Configure credentials.")
        
        config = {
            "developer_token": self.credentials["developer_token"],
            "client_id": self.credentials["client_id"],
            "client_secret": self.credentials["client_secret"],
            "refresh_token": self.credentials["refresh_token"],
            "use_proto_plus": True,
            "version": "v22"
        }
        
        login_customer_id = self.credentials.get("login_customer_id")
        if login_customer_id and login_customer_id.isdigit() and len(login_customer_id) == 10:
            config["login_customer_id"] = login_customer_id
        
        return GoogleAdsClient.load_from_dict(config)
    
    def launch_campaign(
        self, 
        campaign_config: Dict[str, Any],
        correlation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Launch campaign on Google Ads platform.
        Creates a Campaign object via Google Ads API.
        
        Args:
            campaign_config: Campaign configuration dict
            correlation_id: Optional correlation ID for request tracking
        """
        corr_id = get_or_create_correlation_id(correlation_id)
        set_correlation_id(corr_id)
        
        log_data = add_correlation_to_log_context({
            "operation": "launch_campaign",
            "platform": "google_ads",
            "campaign_name": campaign_config.get('name', 'unknown')
        }, corr_id)
        logger.info("Google Ads campaign launch started", extra=log_data)
        
        if self.status != PlatformStatus.AVAILABLE:
            logger.error("Google Ads connector not available", extra=log_data)
            raise RuntimeError("Google Ads connector not available. Configure credentials.")
        
        try:
            client = self._get_google_ads_client()
            customer_id = self.credentials["customer_id"]
            
            goal_to_campaign_type = {
                'awareness': client.enums.AdvertisingChannelTypeEnum.DISPLAY,
                'traffic': client.enums.AdvertisingChannelTypeEnum.SEARCH,
                'conversion': client.enums.AdvertisingChannelTypeEnum.SEARCH,
                'conversions': client.enums.AdvertisingChannelTypeEnum.SEARCH,
                'engagement': client.enums.AdvertisingChannelTypeEnum.DISPLAY,
                'leads': client.enums.AdvertisingChannelTypeEnum.SEARCH,
                'sales': client.enums.AdvertisingChannelTypeEnum.PERFORMANCE_MAX,
                'app_installs': client.enums.AdvertisingChannelTypeEnum.MULTI_CHANNEL,
            }
            
            kaivo_goal = campaign_config.get('goal', 'traffic').lower()
            campaign_type = goal_to_campaign_type.get(kaivo_goal, client.enums.AdvertisingChannelTypeEnum.SEARCH)
            
            budget_micros = int((campaign_config.get('total_budget_cents', 0) / 100.0) * 1_000_000)
            daily_budget_micros = int(budget_micros / 30)
            
            daily_budget_micros = max(daily_budget_micros, 10_000)
            daily_budget_micros = (daily_budget_micros // 10_000) * 10_000
            
            campaign_operation = client.get_type("CampaignOperation")
            campaign = campaign_operation.create
            
            campaign.name = campaign_config.get('name', 'Kaivo Campaign')
            campaign.advertising_channel_type = campaign_type
            campaign.status = client.enums.CampaignStatusEnum.PAUSED
            
            campaign.contains_eu_political_advertising = (
                client.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
            )
            
            campaign.manual_cpc = client.get_type("ManualCpc")
            
            if campaign_type == client.enums.AdvertisingChannelTypeEnum.SEARCH:
                campaign.network_settings.target_google_search = True
                campaign.network_settings.target_search_network = True
            
            budget_operation = client.get_type("CampaignBudgetOperation")
            budget = budget_operation.create
            
            import time
            budget_name = f"{campaign.name} Budget {int(time.time())}"
            budget.name = budget_name
            budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
            budget.amount_micros = daily_budget_micros
            
            budget_service = client.get_service("CampaignBudgetService")
            budget_response = budget_service.mutate_campaign_budgets(
                customer_id=customer_id,
                operations=[budget_operation]
            )
            
            budget_resource_name = budget_response.results[0].resource_name
            campaign.campaign_budget = budget_resource_name
            
            logger.info(f"Creating Google Ads campaign with details:", extra={
                **log_data,
                "campaign_name": campaign.name,
                "campaign_type": str(campaign.advertising_channel_type),
                "budget": budget_resource_name,
                "customer_id": customer_id,
                "daily_budget_micros": daily_budget_micros
            })
            
            campaign_service = client.get_service("CampaignService")
            campaign_response = campaign_service.mutate_campaigns(
                customer_id=customer_id,
                operations=[campaign_operation]
            )
            
            google_campaign_id = campaign_response.results[0].resource_name.split('/')[-1]
            
            CONNECTOR_REQUESTS_TOTAL.labels(platform="google_ads", operation="launch_campaign", status="success").inc()
            
            log_data = add_correlation_to_log_context({
                "operation": "launch_campaign",
                "platform": "google_ads",
                "google_campaign_id": google_campaign_id,
                "campaign_name": campaign_config.get('name')
            }, corr_id)
            logger.info("Google Ads campaign created successfully", extra=log_data)
            
            return {
                "success": True,
                "platform_campaign_id": google_campaign_id,
                "status": "paused",
                "created_at": datetime.utcnow().isoformat(),
                "campaign_type": campaign_type.name,
                "message": f"Campaign created successfully on Google Ads with ID: {google_campaign_id}",
                "correlation_id": corr_id
            }
            
        except GoogleAdsException as e:
            error_messages = []
            for error in e.failure.errors:
                error_messages.append(f"{error.message} (Location: {error.location})")
            
            error_message = "Google Ads API error: " + "; ".join(error_messages)
            
            CONNECTOR_REQUESTS_TOTAL.labels(platform="google_ads", operation="launch_campaign", status="error").inc()
            ADAPTER_ERRORS.labels(platform="google_ads", operation="launch_campaign", error_type="GoogleAdsException").inc()
            
            log_data = add_correlation_to_log_context({
                "operation": "launch_campaign",
                "platform": "google_ads",
                "error": error_message,
                "error_code": str(e.request_id) if hasattr(e, 'request_id') else "UNKNOWN"
            }, corr_id)
            logger.error("Google Ads campaign launch failed", extra=log_data)
            raise RuntimeError(error_message)
        except Exception as e:
            CONNECTOR_REQUESTS_TOTAL.labels(platform="google_ads", operation="launch_campaign", status="error").inc()
            ADAPTER_ERRORS.labels(platform="google_ads", operation="launch_campaign", error_type=type(e).__name__).inc()
            
            log_data = add_correlation_to_log_context({
                "operation": "launch_campaign",
                "platform": "google_ads",
                "error": str(e)
            }, corr_id)
            logger.error("Google Ads campaign launch failed", extra=log_data, exc_info=True)
            raise

    def update_campaign(
        self,
        platform_campaign_id: str,
        campaign_config: Dict[str, Any],
        access_token: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update an existing Google Ads campaign.
        
        Args:
            platform_campaign_id: Google Ads campaign ID
            campaign_config: Update configuration
            access_token: Not used (Google Ads uses service account credentials)
            correlation_id: Optional correlation ID for request tracking
        """
        corr_id = get_or_create_correlation_id(correlation_id)
        set_correlation_id(corr_id)
        
        log_data = add_correlation_to_log_context({
            "operation": "update_campaign",
            "platform": "google_ads",
            "platform_campaign_id": platform_campaign_id
        }, corr_id)
        logger.info("Google Ads campaign update started", extra=log_data)
        
        if self.status != PlatformStatus.AVAILABLE:
            logger.error("Google Ads connector not available", extra=log_data)
            raise RuntimeError("Google Ads connector not available. Configure credentials.")

        try:
            client = self._get_google_ads_client()
            customer_id = self.credentials["customer_id"]
            
            campaign_operation = client.get_type("CampaignOperation")
            campaign = campaign_operation.update
            campaign.resource_name = f"customers/{customer_id}/campaigns/{platform_campaign_id}"
            
            update_fields = []
            if "name" in campaign_config:
                campaign.name = campaign_config["name"]
                update_fields.append("name")
            if "status" in campaign_config:
                status_map = {
                    "PAUSED": client.enums.CampaignStatusEnum.PAUSED,
                    "ENABLED": client.enums.CampaignStatusEnum.ENABLED,
                    "REMOVED": client.enums.CampaignStatusEnum.REMOVED
                }
                campaign.status = status_map.get(campaign_config["status"], client.enums.CampaignStatusEnum.PAUSED)
                update_fields.append("status")
            
            if not update_fields:
                return {
                    "success": False,
                    "error": "No valid fields to update",
                    "error_code": "NO_UPDATE_FIELDS"
                }
            
            campaign_operation.update_mask.CopyFrom(
                client.get_type("FieldMask")(paths=update_fields)
            )
            
            campaign_service = client.get_service("CampaignService")
            campaign_response = campaign_service.mutate_campaigns(
                customer_id=customer_id,
                operations=[campaign_operation]
            )
            
            CONNECTOR_REQUESTS_TOTAL.labels(platform="google_ads", operation="update_campaign", status="success").inc()
            
            log_data = add_correlation_to_log_context({
                "operation": "update_campaign",
                "platform": "google_ads",
                "platform_campaign_id": platform_campaign_id,
                "status": "success"
            }, corr_id)
            logger.info("Google Ads campaign updated successfully", extra=log_data)
            
            return {
                "success": True,
                "platform_campaign_id": platform_campaign_id,
                "updated_fields": update_fields,
                "correlation_id": corr_id
            }
            
        except GoogleAdsException as e:
            error_messages = []
            for error in e.failure.errors:
                error_messages.append(f"{error.message}")
            
            logger.error(f"Google Ads campaign update failed: {'; '.join(error_messages)}")
            return {
                "success": False,
                "error": "; ".join(error_messages),
                "error_code": "GOOGLE_ADS_ERROR",
                "platform_campaign_id": platform_campaign_id
            }
        except Exception as e:
            logger.error(f"Google Ads campaign update failed: {e}")
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
        Fetch Google Ads campaign performance metrics.
        """
        if self.status != PlatformStatus.AVAILABLE:
            raise RuntimeError("Google Ads connector not available. Configure credentials.")
        
        try:
            logger.info(f"Would fetch Google Ads reports for campaign: {platform_campaign_id}")
            
            return {
                "impressions": 0,
                "clicks": 0,
                "spend": 0.0,
                "cpm": 0.0,
                "ctr": 0.0,
                "conversions": 0,
                "message": "Reporting pending Google Ads API integration"
            }
            
        except Exception as e:
            logger.error(f"Google Ads reporting failed: {e}")
            raise
    
    def pause_campaign(self, platform_campaign_id: str) -> bool:
        """
        Pause Google Ads campaign.
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
            logger.error(f"Google Ads campaign pause failed: {e}")
            return False
    
    def test_connection(self, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Test Google Ads API connection.
        
        Returns:
            Dict with connection status and customer account info
        """
        corr_id = get_or_create_correlation_id(correlation_id)
        set_correlation_id(corr_id)
        
        if self.status != PlatformStatus.AVAILABLE:
            return {
                "success": False,
                "error": "Google Ads connector not available",
                "error_code": "NOT_AVAILABLE"
            }
        
        try:
            client = self._get_google_ads_client()
            customer_id = self.credentials["customer_id"]
            
            query = f"""
                SELECT
                    customer.id,
                    customer.descriptive_name,
                    customer.currency_code,
                    customer.time_zone
                FROM customer
                WHERE customer.id = {customer_id}
            """
            
            ga_service = client.get_service("GoogleAdsService")
            response = ga_service.search(customer_id=customer_id, query=query)
            
            customer_info = None
            for row in response:
                customer_info = {
                    "id": row.customer.id,
                    "name": row.customer.descriptive_name,
                    "currency": row.customer.currency_code,
                    "timezone": row.customer.time_zone
                }
                break
            
            return {
                "success": True,
                "customer_info": customer_info,
                "correlation_id": corr_id
            }
            
        except GoogleAdsException as e:
            error_messages = []
            for error in e.failure.errors:
                error_messages.append(f"{error.message}")
            
            return {
                "success": False,
                "error": "; ".join(error_messages),
                "error_code": "GOOGLE_ADS_ERROR"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_code": "CONNECTION_ERROR"
            }
