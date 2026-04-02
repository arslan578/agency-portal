"""
Kaivo Microsoft Ads Platform Connector
Production implementation using the official bingads Python SDK (SOAP).

The SDK communicates with two services:
 - CustomerManagementService  -> fetch ad accounts (GetUser + GetAccountsInfo)
 - CampaignManagementService  -> create/pause campaigns (AddCampaigns, UpdateCampaigns)

Authentication uses the Microsoft Identity Platform (login.microsoftonline.com/common) with
msads.manage scope to support both organizational and personal Microsoft accounts.
"""

import os
from typing import Any, Dict, List, Optional

from ..connector_base import PlatformConnector, PlatformStatus
import logging

logger = logging.getLogger(__name__)


def _oauth_redirection_uri_for_web_app() -> str:
    """
    Must match the redirect_uri used in the authorize + token exchange steps exactly.
    If this differs from the URI used to obtain the access token, Bing Ads SOAP calls
    often fail with 'Invalid client data'.

    Prefer MICROSOFT_ADS_SOAP_REDIRECT_URI when set (same URL the agency portal uses
    in the OAuth authorize step), so it can differ from MICROSOFT_REDIRECT_URI used
    elsewhere (e.g. commercial / ngrok).
    """
    soap = os.getenv("MICROSOFT_ADS_SOAP_REDIRECT_URI", "").strip()
    if soap:
        return soap
    explicit = os.getenv("MICROSOFT_REDIRECT_URI", "").strip()
    if explicit:
        return explicit
    base = os.getenv(
        "FRONTEND_URL",
        os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    ).rstrip("/")
    return f"{base}/integrations/microsoft/oauth/callback"


try:
    from bingads.authorization import (
        AuthorizationData,
        OAuthWebAuthCodeGrant,
        OAuthTokens,
    )
    from bingads.service_client import ServiceClient
    BINGADS_SDK_AVAILABLE = True
except ImportError:
    BINGADS_SDK_AVAILABLE = False
    AuthorizationData = None
    OAuthWebAuthCodeGrant = None
    OAuthTokens = None
    ServiceClient = None
    logger.warning("bingads SDK not installed. Microsoft Ads connector will run in stub mode.")


class MicrosoftAdsConnector(PlatformConnector):
    """
    Microsoft Ads (Bing) platform connector.

    Required env vars:
        MICROSOFT_ADS_CLIENT_ID
        MICROSOFT_ADS_CLIENT_SECRET
        MICROSOFT_ADS_DEVELOPER_TOKEN
    Credentials from OAuth (stored per-user):
        access_token, refresh_token, ad_account_id, customer_id
    """

    ENVIRONMENT = "production"

    @property
    def platform_name(self) -> str:
        return "microsoft_ads"

    # ------------------------------------------------------------------
    # Auth helpers
    # ------------------------------------------------------------------

    def _build_authorization_data(
        self,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        account_id: Optional[str] = None,
        customer_id: Optional[str] = None,
    ) -> Any:
        """Build an AuthorizationData object from stored credentials + env vars."""
        if not BINGADS_SDK_AVAILABLE:
            raise RuntimeError("bingads SDK is not installed")

        token = access_token or (
            self.credentials.get("access_token") if isinstance(self.credentials, dict) else None
        )
        r_token = refresh_token or (
            self.credentials.get("refresh_token") if isinstance(self.credentials, dict) else None
        )

        if not token:
            raise ValueError("Missing Microsoft Ads access_token")

        client_id = os.getenv("MICROSOFT_ADS_CLIENT_ID", os.getenv("MICROSOFT_CLIENT_ID", ""))
        client_secret = os.getenv("MICROSOFT_ADS_CLIENT_SECRET", os.getenv("MICROSOFT_CLIENT_SECRET", ""))
        developer_token = (os.getenv("MICROSOFT_ADS_DEVELOPER_TOKEN", "") or "").strip()
        if not developer_token:
            raise ValueError(
                "MICROSOFT_ADS_DEVELOPER_TOKEN is required for Microsoft Advertising API (SOAP) calls"
            )
        redirect_uri = _oauth_redirection_uri_for_web_app()

        oauth_tokens = OAuthTokens(
            access_token=token,
            access_token_expires_in_seconds=3600,
            refresh_token=r_token,
        )

        oauth_scope = os.getenv("MICROSOFT_ADS_BINGADS_OAUTH_SCOPE", "msads.manage").strip() or "msads.manage"

        authentication = OAuthWebAuthCodeGrant(
            client_id=client_id,
            client_secret=client_secret,
            redirection_uri=redirect_uri,
            oauth_tokens=oauth_tokens,
            env=self.ENVIRONMENT,
            oauth_scope=oauth_scope,
        )

        acct = account_id or (
            self.credentials.get("ad_account_id") if isinstance(self.credentials, dict) else None
        )
        cust = customer_id or (
            self.credentials.get("customer_id") if isinstance(self.credentials, dict) else None
        )

        def _int_or_none(v: Any) -> Any:
            if v is None or v == "":
                return None
            try:
                return int(v)
            except (TypeError, ValueError):
                return None

        authorization_data = AuthorizationData(
            account_id=_int_or_none(acct),
            customer_id=_int_or_none(cust),
            developer_token=developer_token,
            authentication=authentication,
        )
        return authorization_data

    def _get_customer_service(self, authorization_data: Any) -> Any:
        return ServiceClient(
            service="CustomerManagementService",
            version=13,
            authorization_data=authorization_data,
            environment=self.ENVIRONMENT,
        )

    def _get_campaign_service(self, authorization_data: Any) -> Any:
        return ServiceClient(
            service="CampaignManagementService",
            version=13,
            authorization_data=authorization_data,
            environment=self.ENVIRONMENT,
        )

    # ------------------------------------------------------------------
    # Connector interface
    # ------------------------------------------------------------------

    def _validate_credentials(self) -> None:
        if not BINGADS_SDK_AVAILABLE:
            self.status = PlatformStatus.STUB
            return

        developer_token = os.getenv("MICROSOFT_ADS_DEVELOPER_TOKEN")
        client_id = os.getenv("MICROSOFT_ADS_CLIENT_ID", os.getenv("MICROSOFT_CLIENT_ID"))

        has_token = (
            isinstance(self.credentials, dict)
            and self.credentials.get("access_token")
        )

        if developer_token and client_id and has_token:
            self.status = PlatformStatus.AVAILABLE
        elif developer_token and client_id:
            self.status = PlatformStatus.STUB
            logger.info("Microsoft Ads connector: env vars present but no user access_token yet (stub mode)")
        else:
            self.status = PlatformStatus.STUB
            logger.info(
                "Microsoft Ads connector: Missing MICROSOFT_ADS_DEVELOPER_TOKEN or CLIENT_ID; stub mode"
            )

    def estimate_reach(
        self,
        budget: float,
        geography: Optional[str] = None,
        demographics: Optional[Dict[str, Any]] = None,
        interests: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        base_cpm = 7.5
        geo_multiplier = 1.0
        if geography:
            geo_lower = geography.lower()
            if any(city in geo_lower for city in ["new york", "seattle", "london"]):
                geo_multiplier = 1.25
            elif any(city in geo_lower for city in ["dallas", "berlin", "paris"]):
                geo_multiplier = 1.1

        effective_cpm = base_cpm * geo_multiplier
        impressions = int((budget / effective_cpm) * 1000)
        reach = int(impressions * 0.65)

        return {
            "estimated_impressions": impressions,
            "estimated_reach": reach,
            "estimated_cpm": effective_cpm,
            "confidence": 0.7,
        }

    def get_creative_specs(self) -> Dict[str, Any]:
        return {
            "image": {
                "recommended_resolution": "1200x628",
                "min_width": 600,
                "min_height": 335,
                "max_file_size_mb": 5,
                "formats": ["jpg", "png"],
            },
            "text": {
                "max_headline_length": 60,
                "max_description_length": 90,
            },
            "placements": ["search", "audience_network"],
        }

    # ------------------------------------------------------------------
    # launch_campaign — real API via bingads SDK
    # ------------------------------------------------------------------

    def launch_campaign(self, campaign_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a campaign on Microsoft Advertising via the CampaignManagementService.AddCampaigns SOAP operation.
        """
        ad_account_id = (
            campaign_config.get("ad_account_id")
            or (self.credentials.get("ad_account_id") if isinstance(self.credentials, dict) else None)
            or os.getenv("MICROSOFT_ADS_ACCOUNT_ID")
        )

        if not BINGADS_SDK_AVAILABLE or self.status != PlatformStatus.AVAILABLE:
            logger.warning("Microsoft Ads connector not available; returning stub response")
            simulated_id = f"msads_stub_{ad_account_id or 'unknown'}_{campaign_config.get('name', 'campaign')}"
            return {
                "success": True,
                "platform_campaign_id": simulated_id,
                "status": "stub",
                "ad_account_id": ad_account_id,
                "message": "SDK unavailable or missing credentials — stub response",
            }

        try:
            customer_id = (
                campaign_config.get("customer_id")
                or (self.credentials.get("customer_id") if isinstance(self.credentials, dict) else None)
            )

            auth_data = self._build_authorization_data(
                account_id=ad_account_id,
                customer_id=customer_id,
            )
            campaign_service = self._get_campaign_service(auth_data)

            goal = str(campaign_config.get("goal", "traffic")).lower()
            goal_map = {
                "awareness": "Audience",
                "traffic": "Search",
                "conversion": "Search",
                "conversions": "Search",
                "engagement": "Audience",
                "leads": "Search",
                "sales": "Shopping",
            }
            campaign_type = goal_map.get(goal, "Search")

            budget_amount = campaign_config.get("daily_budget")
            if not budget_amount:
                total_cents = campaign_config.get("total_budget_cents", 0)
                budget_amount = round(total_cents / 100 / 30, 2) if total_cents else 50.0

            campaign_obj = campaign_service.factory.create("Campaign")
            campaign_obj.Name = campaign_config.get("name", "Kaivo Campaign")
            campaign_obj.BudgetType = "DailyBudgetStandard"
            campaign_obj.DailyBudget = budget_amount
            campaign_obj.TimeZone = "PacificTimeUSCanadaTijuana"
            campaign_obj.Status = "Paused"
            campaign_obj.CampaignType = campaign_type
            campaign_obj.Languages = campaign_service.factory.create("ns3:ArrayOfstring")
            campaign_obj.Languages.string.append("All")

            campaigns = campaign_service.factory.create("ArrayOfCampaign")
            campaigns.Campaign.append(campaign_obj)

            response = campaign_service.AddCampaigns(
                AccountId=int(ad_account_id),
                Campaigns=campaigns,
            )

            campaign_ids = response.CampaignIds
            if campaign_ids and hasattr(campaign_ids, "long") and len(campaign_ids["long"]) > 0:
                ms_campaign_id = str(campaign_ids["long"][0])
            else:
                ms_campaign_id = str(campaign_ids) if campaign_ids else None

            partial_errors = getattr(response, "PartialErrors", None)
            if partial_errors and hasattr(partial_errors, "BatchError"):
                errors = partial_errors.BatchError
                if errors:
                    error_msgs = [f"[{e.Code}] {e.Message}" for e in errors]
                    logger.warning(f"Microsoft Ads partial errors: {error_msgs}")
                    if not ms_campaign_id:
                        return {
                            "success": False,
                            "error": "; ".join(error_msgs),
                            "error_code": "PARTIAL_ERROR",
                            "ad_account_id": ad_account_id,
                        }

            logger.info(f"Microsoft Ads campaign created: {ms_campaign_id}")
            return {
                "success": True,
                "platform_campaign_id": ms_campaign_id,
                "status": "paused",
                "ad_account_id": ad_account_id,
            }

        except Exception as e:
            logger.error(f"Microsoft Ads launch_campaign error: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "error_code": "LAUNCH_ERROR",
                "ad_account_id": ad_account_id,
            }

    # ------------------------------------------------------------------
    # fetch_reports — stub (reporting API is separate and complex)
    # ------------------------------------------------------------------

    def fetch_reports(
        self,
        platform_campaign_id: str,
        date_range: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        logger.info(f"Microsoft Ads fetch_reports stub for {platform_campaign_id}")
        return {
            "impressions": 0,
            "clicks": 0,
            "spend": 0.0,
            "cpm": 0.0,
            "ctr": 0.0,
            "conversions": 0,
            "message": "Reporting pending full integration",
        }

    # ------------------------------------------------------------------
    # pause_campaign — real API
    # ------------------------------------------------------------------

    def pause_campaign(self, platform_campaign_id: str) -> bool:
        if self.status != PlatformStatus.AVAILABLE or not BINGADS_SDK_AVAILABLE:
            logger.warning("Microsoft Ads pause_campaign called in stub mode")
            return False

        try:
            ad_account_id = (
                self.credentials.get("ad_account_id") if isinstance(self.credentials, dict) else None
            ) or os.getenv("MICROSOFT_ADS_ACCOUNT_ID")

            auth_data = self._build_authorization_data(account_id=ad_account_id)
            campaign_service = self._get_campaign_service(auth_data)

            campaign_obj = campaign_service.factory.create("Campaign")
            campaign_obj.Id = int(platform_campaign_id)
            campaign_obj.Status = "Paused"

            campaigns = campaign_service.factory.create("ArrayOfCampaign")
            campaigns.Campaign.append(campaign_obj)

            campaign_service.UpdateCampaigns(
                AccountId=int(ad_account_id),
                Campaigns=campaigns,
            )
            logger.info(f"Microsoft Ads campaign paused: {platform_campaign_id}")
            return True
        except Exception as e:
            logger.error(f"Microsoft Ads pause_campaign error: {e}", exc_info=True)
            return False

    # ------------------------------------------------------------------
    # fetch_ad_accounts — real API via CustomerManagementService
    # ------------------------------------------------------------------

    def fetch_ad_accounts(self, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch the authenticated user's advertising accounts via the
        CustomerManagementService.GetUser + GetAccountsInfo SOAP operations.
        """
        if not isinstance(self.credentials, dict) or not self.credentials.get("access_token"):
            return {
                "success": False,
                "error": "Missing access token",
                "error_code": "MISSING_CREDENTIALS",
                "ad_accounts": [],
            }

        if not BINGADS_SDK_AVAILABLE:
            return self._fetch_ad_accounts_stub()

        try:
            try:
                auth_data = self._build_authorization_data()
            except ValueError as ve:
                logger.warning("Microsoft Ads auth setup failed: %s", ve)
                return {
                    "success": False,
                    "error": str(ve),
                    "error_code": "AUTH_CONFIG",
                    "ad_accounts": [],
                }

            customer_service = self._get_customer_service(auth_data)

            user_response = customer_service.GetUser(UserId=None)
            user = user_response.User
            customer_roles = user_response.CustomerRoles

            customer_ids = set()
            if customer_roles and hasattr(customer_roles, "CustomerRole"):
                for role in customer_roles.CustomerRole:
                    cid = getattr(role, "CustomerId", None)
                    if cid:
                        customer_ids.add(int(cid))

            if not customer_ids:
                return {
                    "success": True,
                    "ad_accounts": [],
                    "message": "No customer IDs found for this user",
                }

            ad_accounts: List[Dict[str, Any]] = []
            for cust_id in customer_ids:
                try:
                    acct_response = customer_service.GetAccountsInfo(CustomerId=cust_id)
                    if acct_response and hasattr(acct_response, "AccountInfo"):
                        infos = acct_response.AccountInfo
                        if not isinstance(infos, list):
                            infos = [infos] if infos else []
                        for info in infos:
                            acct_id = getattr(info, "Id", None)
                            acct_name = getattr(info, "Name", None)
                            acct_number = getattr(info, "Number", None)
                            acct_status = getattr(info, "AccountLifeCycleStatus", "Unknown")
                            ad_accounts.append({
                                "id": str(acct_id),
                                "name": acct_name or f"Account {acct_id}",
                                "account_id": str(acct_id),
                                "account_number": acct_number,
                                "customer_id": str(cust_id),
                                "currency": "USD",
                                "status": str(acct_status).lower(),
                            })
                except Exception as e:
                    logger.warning(f"Failed to fetch accounts for customer {cust_id}: {e}")

            logger.info(f"Microsoft Ads accounts fetched: {len(ad_accounts)} across {len(customer_ids)} customers")
            return {
                "success": True,
                "ad_accounts": ad_accounts,
            }

        except Exception as e:
            err_text = str(e)
            if hasattr(e, "fault") and e.fault is not None:
                err_text = str(e.fault)
            logger.error("Microsoft Ads fetch_ad_accounts error: %s", err_text, exc_info=True)
            return {
                "success": False,
                "error": err_text,
                "error_code": "FETCH_ERROR",
                "ad_accounts": [],
            }

    def _fetch_ad_accounts_stub(self) -> Dict[str, Any]:
        """Fallback when bingads SDK is not installed."""
        stored_id = self.credentials.get("ad_account_id") if isinstance(self.credentials, dict) else None
        stored_name = self.credentials.get("ad_account_name") if isinstance(self.credentials, dict) else None

        if not stored_id:
            stored_id = os.getenv("MICROSOFT_ADS_ACCOUNT_ID", "187084224")
            stored_name = "Microsoft Ads Account (stub)"

        return {
            "success": True,
            "ad_accounts": [
                {
                    "id": str(stored_id),
                    "name": stored_name or f"Account {stored_id}",
                    "account_id": str(stored_id),
                    "currency": "USD",
                    "status": "active",
                }
            ],
            "message": "bingads SDK not available — returning stored/env account only",
        }
