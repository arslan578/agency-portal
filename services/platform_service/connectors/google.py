"""
Kaivo Google Ads Platform Connector
Production implementation for Google Ads advertising platform.
"""

import os
import time
import random
from typing import Dict, Any, List, Optional, Callable, Tuple
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
            c = self.credentials
            if not GOOGLE_ADS_SDK_AVAILABLE:
                self.status = PlatformStatus.STUB
            elif (
                c.get("developer_token")
                and c.get("client_id")
                and c.get("client_secret")
                and c.get("refresh_token")
            ):
                self.status = PlatformStatus.AVAILABLE
            else:
                self.status = PlatformStatus.STUB
    
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
    
    def _get_google_ads_client(
        self,
        require_customer_id: bool = True,
        login_customer_id_override: Optional[str] = None,
    ):
        """Initialize and return Google Ads API client."""
        if self.status != PlatformStatus.AVAILABLE:
            raise RuntimeError("Google Ads connector not available. Configure credentials.")
        if require_customer_id:
            cid = self.credentials.get("customer_id")
            norm = str(cid).replace("-", "").strip() if cid else ""
            if not norm.isdigit() or len(norm) != 10:
                raise RuntimeError("Google Ads customer_id required for this operation.")

        config = {
            "developer_token": self.credentials["developer_token"],
            "client_id": self.credentials["client_id"],
            "client_secret": self.credentials["client_secret"],
            "refresh_token": self.credentials["refresh_token"],
            "use_proto_plus": True,
            "version": "v22"
        }

        if login_customer_id_override is not None:
            lid = str(login_customer_id_override).replace("-", "").strip()
            if lid.isdigit() and len(lid) == 10:
                config["login_customer_id"] = lid
        else:
            login_customer_id = self.credentials.get("login_customer_id")
            if login_customer_id:
                lid = str(login_customer_id).replace("-", "").strip()
                if lid.isdigit() and len(lid) == 10:
                    config["login_customer_id"] = lid

        return GoogleAdsClient.load_from_dict(config)

    def _fetch_customer_descriptive_row(self, client: Any, customer_id: str):
        """Best-effort customer descriptive_name and currency for a accessible customer ID."""
        ga_service = client.get_service("GoogleAdsService")
        query = """
            SELECT customer.id, customer.descriptive_name, customer.currency_code
            FROM customer
            LIMIT 1
        """
        try:
            stream = ga_service.search(customer_id=customer_id, query=query)
            for row in stream:
                return row.customer.descriptive_name, row.customer.currency_code
        except Exception:
            logger.debug("Could not load customer row for %s", customer_id, exc_info=True)
        return None, None

    def _parse_customer_resource_id(self, resource_name: str) -> Optional[str]:
        """Extract 10-digit customer id from resource name ``customers/1234567890``."""
        if not resource_name:
            return None
        s = str(resource_name).strip()
        parts = s.split("/")
        if len(parts) < 2:
            return None
        cid = parts[-1].replace("-", "")
        return cid if cid.isdigit() and len(cid) == 10 else None

    def _customer_client_status_is_listable(self, cc: Any) -> bool:
        """CustomerClient.status uses CustomerStatus (ENABLED, SUSPENDED, …) — not REMOVED."""
        st = getattr(cc, "status", None)
        name = ""
        if st is not None:
            name = getattr(st, "name", None) or ""
            if not name and hasattr(st, "value"):
                name = str(st.value)
        name_u = str(name).upper()
        if name_u in ("CANCELED", "CLOSED", "UNSPECIFIED"):
            return False
        return True

    def _fetch_customer_client_children(
        self,
        manager_customer_id: str,
        login_customer_id_for_header: str,
    ) -> List[Dict[str, Any]]:
        """
        Direct linked accounts under a manager (official sample uses ``level <= 1``, skips level 0).

        ``login_customer_id_for_header`` must be the manager account to send as login-customer-id
        (typically the root MCC for that branch, not necessarily ``manager_customer_id`` for sub-MCCs).
        """
        mgr = str(manager_customer_id).replace("-", "").strip()
        login = str(login_customer_id_for_header).replace("-", "").strip()
        if not mgr.isdigit() or len(mgr) != 10:
            return []
        if not login.isdigit() or len(login) != 10:
            login = mgr
        try:
            gac = self._get_google_ads_client(
                require_customer_id=False,
                login_customer_id_override=login,
            )
            ga_service = gac.get_service("GoogleAdsService")
            # Match Google "get_account_hierarchy" sample — do not use REMOVED (invalid for CustomerStatus).
            query = """
                SELECT
                    customer_client.client_customer,
                    customer_client.id,
                    customer_client.level,
                    customer_client.manager,
                    customer_client.descriptive_name,
                    customer_client.currency_code,
                    customer_client.hidden,
                    customer_client.status
                FROM customer_client
                WHERE customer_client.level <= 1
            """
            out: List[Dict[str, Any]] = []
            stream = ga_service.search(customer_id=mgr, query=query)
            for row in stream:
                cc = row.customer_client
                level = int(getattr(cc, "level", -1) or -1)
                if level == 0:
                    continue
                raw_id = getattr(cc, "id", None)
                cid = str(int(raw_id)) if raw_id is not None else None
                if not cid:
                    raw_name = getattr(cc, "client_customer", None) or ""
                    cid = self._parse_customer_resource_id(str(raw_name))
                if not cid or cid == mgr:
                    continue
                if not self._customer_client_status_is_listable(cc):
                    continue
                is_mgr = bool(getattr(cc, "manager", False))
                name = (getattr(cc, "descriptive_name", None) or "").strip() or f"Account {cid}"
                currency = (getattr(cc, "currency_code", None) or "USD").strip() or "USD"
                out.append(
                    {
                        "account_id": cid,
                        "name": name,
                        "account_name": name,
                        "currency": currency,
                        "is_manager": is_mgr,
                        "level": level,
                    }
                )
            return out
        except GoogleAdsException as e:
            msgs = [err.message for err in e.failure.errors]
            err_txt = "; ".join(msgs) if msgs else str(e)
            logger.warning(
                "Google Ads customer_client query failed (manager=%s login_header=%s): %s",
                mgr,
                login,
                err_txt,
            )
            return []
        except Exception as e:
            logger.warning(
                "Google Ads customer_client query failed (manager=%s): %s",
                mgr,
                e,
                exc_info=True,
            )
            return []

    def _expand_accessible_accounts_with_mcc_children(
        self,
        seed_accounts: List[Dict[str, Any]],
        max_total: int = 500,
    ) -> List[Dict[str, Any]]:
        """
        BFS over manager accounts. Queue carries (manager_id, login_customer_id_header) so
        sub-MCC expansion still sends the root MCC as login-customer-id when appropriate.
        """
        by_id: Dict[str, Dict[str, Any]] = {}
        for acc in seed_accounts:
            aid = acc.get("account_id")
            if not aid:
                continue
            norm = str(aid).replace("-", "").strip()
            if norm not in by_id:
                row = dict(acc)
                row["account_id"] = norm
                row.setdefault("parent_account_id", None)
                row.setdefault("is_manager", False)
                by_id[norm] = row

        configured_login = self.credentials.get("login_customer_id")
        cfg_norm = None
        if configured_login:
            s = str(configured_login).replace("-", "").strip()
            if s.isdigit() and len(s) == 10:
                cfg_norm = s

        queue: List[Tuple[str, str]] = []
        for norm in list(by_id.keys()):
            login_h = cfg_norm or norm
            queue.append((norm, login_h))

        expanded: set[str] = set()

        while queue and len(by_id) < max_total:
            mgr, login_h = queue.pop(0)
            if mgr in expanded:
                continue
            expanded.add(mgr)
            children = self._fetch_customer_client_children(mgr, login_h)
            if children:
                by_id[mgr]["is_manager"] = True
            for ch in children:
                cid = ch["account_id"]
                if len(by_id) >= max_total:
                    break
                if ch.get("level") != 1:
                    continue
                if cid not in by_id:
                    by_id[cid] = {
                        "account_id": cid,
                        "name": ch["name"],
                        "account_name": ch["account_name"],
                        "currency": ch.get("currency") or "USD",
                        "timezone": "",
                        "status": "ACTIVE",
                        "spend": 0,
                        "parent_account_id": mgr,
                        "is_manager": ch.get("is_manager", False),
                    }
                    if ch.get("is_manager"):
                        queue.append((cid, login_h))
                else:
                    existing = by_id[cid]
                    if not existing.get("parent_account_id"):
                        existing["parent_account_id"] = mgr
                    if ch.get("is_manager"):
                        existing["is_manager"] = True
                        if cid not in expanded:
                            queue.append((cid, login_h))

        def sort_key(item: Dict[str, Any]) -> tuple:
            parent = item.get("parent_account_id")
            is_root = parent is None
            return (0 if is_root else 1, parent or "", item.get("account_name") or item.get("name") or "")

        return sorted(by_id.values(), key=sort_key)

    def fetch_accessible_ad_accounts(self) -> Dict[str, Any]:
        """
        List Google Ads customers accessible with the current refresh token
        (CustomerService.list_accessible_customers). Does not require customer_id in credentials.
        """
        if not GOOGLE_ADS_SDK_AVAILABLE:
            return {
                "success": False,
                "error": "google-ads-python SDK not installed",
                "error_code": "NO_SDK",
                "ad_accounts": [],
            }
        if self.status != PlatformStatus.AVAILABLE:
            return {
                "success": False,
                "error": "Google Ads connector not available",
                "error_code": "NOT_AVAILABLE",
                "ad_accounts": [],
            }
        try:
            gac = self._get_google_ads_client(require_customer_id=False)
            csvc = gac.get_service("CustomerService")
            resp = csvc.list_accessible_customers()
            ad_accounts: List[Dict[str, Any]] = []
            for resource_name in resp.resource_names:
                parts = str(resource_name).split("/")
                if len(parts) < 2:
                    continue
                cid = parts[-1].replace("-", "")
                if not cid.isdigit() or len(cid) != 10:
                    continue
                name, currency = self._fetch_customer_descriptive_row(gac, cid)
                ad_accounts.append(
                    {
                        "account_id": cid,
                        "name": name or f"Account {cid}",
                        "account_name": name or f"Account {cid}",
                        "currency": currency or "USD",
                        "timezone": "",
                        "status": "ACTIVE",
                        "spend": 0,
                        "parent_account_id": None,
                        "is_manager": False,
                    }
                )
            ad_accounts = self._expand_accessible_accounts_with_mcc_children(ad_accounts)
            return {"success": True, "ad_accounts": ad_accounts}
        except GoogleAdsException as e:
            msgs = [err.message for err in e.failure.errors]
            err_txt = "; ".join(msgs) if msgs else str(e)
            logger.warning("Google Ads list_accessible_customers failed: %s", err_txt)
            return {
                "success": False,
                "error": err_txt,
                "error_code": "GOOGLE_ADS_ERROR",
                "ad_accounts": [],
            }
        except Exception as e:
            logger.warning("Google Ads fetch_accessible_ad_accounts failed: %s", e, exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "error_code": "FETCH_ERROR",
                "ad_accounts": [],
            }

    def fetch_campaigns_for_customer(self, customer_id: str) -> Dict[str, Any]:
        """Run a GAQL search for non-removed campaigns under a customer ID."""
        if not GOOGLE_ADS_SDK_AVAILABLE:
            return {"success": False, "error": "SDK not installed", "campaigns": []}
        if self.status != PlatformStatus.AVAILABLE:
            return {"success": False, "error": "Connector not available", "campaigns": []}
        cid = str(customer_id).replace("-", "").strip()
        if not cid.isdigit() or len(cid) != 10:
            return {"success": False, "error": "Invalid customer_id", "campaigns": []}
        try:
            gac = self._get_google_ads_client(require_customer_id=False)
            ga_service = gac.get_service("GoogleAdsService")
            query = """
                SELECT campaign.id, campaign.name, campaign.status
                FROM campaign
                WHERE campaign.status != REMOVED
                ORDER BY campaign.id
                LIMIT 200
            """
            campaigns: List[Dict[str, Any]] = []
            stream = ga_service.search(customer_id=cid, query=query)
            for row in stream:
                st = row.campaign.status.name if row.campaign.status else "UNKNOWN"
                cid_str = str(row.campaign.id)
                campaigns.append(
                    {
                        "campaign_id": cid_str,
                        "id": cid_str,
                        "name": row.campaign.name or f"Campaign {cid_str}",
                        "status": st,
                        "ad_account_id": cid,
                    }
                )
            return {"success": True, "campaigns": campaigns}
        except GoogleAdsException as e:
            msgs = [err.message for err in e.failure.errors]
            err_txt = "; ".join(msgs) if msgs else str(e)
            return {"success": False, "error": err_txt, "campaigns": []}
        except Exception as e:
            return {"success": False, "error": str(e), "campaigns": []}
    
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
            client = self._get_google_ads_client(require_customer_id=True)
            customer_id = str(self.credentials["customer_id"]).replace("-", "")
            
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
            client = self._get_google_ads_client(require_customer_id=True)
            customer_id = str(self.credentials["customer_id"]).replace("-", "")
            
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
            client = self._get_google_ads_client(require_customer_id=True)
            customer_id = str(self.credentials["customer_id"]).replace("-", "")
            
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
