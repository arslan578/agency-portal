"""
Kaivo Reddit Ads Platform Connector
Production implementation scaffold for Reddit advertising platform.
"""

import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

import httpx

from ..connector_base import PlatformConnector, PlatformStatus
import logging

logger = logging.getLogger(__name__)


class RedditAdsConnector(PlatformConnector):
    """
    Reddit Ads platform connector.
    Uses OAuth2 access tokens issued via Kaivo's Reddit OAuth flow.

    Env vars:
        REDDIT_CLIENT_ID
        REDDIT_CLIENT_SECRET
        (optional) REDDIT_USER_AGENT
        (optional) REDDIT_ACCESS_TOKEN  # fallback if no stored credentials
    """

    @property
    def platform_name(self) -> str:
        return "reddit"

    def _validate_credentials(self) -> None:
        """
        Validate Reddit credentials and set connector status.
        We expect either:
          - runtime credentials dict with 'access_token', or
          - static app credentials from env (stub mode for now).
        """
        # Prefer runtime credentials (from PlatformCredentialService)
        if isinstance(self.credentials, dict) and self.credentials.get("access_token"):
            self.status = PlatformStatus.AVAILABLE
            return

        client_id = os.getenv("REDDIT_CLIENT_ID")
        client_secret = os.getenv("REDDIT_CLIENT_SECRET")

        if client_id and client_secret:
            # We have app creds but no user token yet – treat as stub.
            self.status = PlatformStatus.STUB
            logger.info("Reddit Ads connector: App credentials present, awaiting user token (stub mode)")
        else:
            self.status = PlatformStatus.STUB
            logger.warning("Reddit Ads connector: Missing REDDIT_CLIENT_ID/SECRET (stub mode)")

    def estimate_reach(
        self,
        budget: float,
        geography: Optional[str] = None,
        demographics: Optional[Dict[str, Any]] = None,
        interests: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Rough reach estimation using generic Reddit CPM benchmarks.
        This is intentionally simple and does not call Reddit APIs.
        """
        # Use a conservative CPM benchmark and simple geo multiplier
        base_cpm = 8.0  # USD
        geo_multiplier = 1.0

        if geography:
            geo_lower = geography.lower()
            if any(city in geo_lower for city in ["new york", "los angeles", "san francisco", "london"]):
                geo_multiplier = 1.3
            elif any(city in geo_lower for city in ["dallas", "austin", "chicago", "berlin"]):
                geo_multiplier = 1.15

        effective_cpm = base_cpm * geo_multiplier
        impressions = int((budget / effective_cpm) * 1000)
        reach = int(impressions * 0.6)

        return {
            "estimated_impressions": impressions,
            "estimated_reach": reach,
            "estimated_cpm": effective_cpm,
            "confidence": 0.7,
        }

    def get_creative_specs(self) -> Dict[str, Any]:
        """
        Reddit-specific creative specifications (simplified).
        """
        return {
            "image": {
                "recommended_resolution": "1200x628",
                "min_width": 600,
                "min_height": 335,
                "max_file_size_mb": 5,
                "formats": ["jpg", "png"],
            },
            "video": {
                "recommended_resolution": "1200x628",
                "min_duration_seconds": 5,
                "max_duration_seconds": 30,
                "max_file_size_mb": 100,
                "formats": ["mp4", "mov"],
            },
            "text": {
                "max_headline_length": 300,
                "max_body_length": 1000,
            },
            "placements": [
                "feed",
                "conversation",
            ],
        }

    def launch_campaign(
        self,
        campaign_config: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Launch a new campaign on Reddit via the Reddit Ads API v3.

        Expected campaign_config keys (some optional, depending on your setup):
            - name: str
            - goal: str (e.g., 'traffic', 'conversions')
            - advertiser_id: str (required – Reddit advertiser / account id)
            - daily_budget: float (optional; in account currency units)
            - total_budget: float (optional; in account currency units)
            - total_budget_cents: int (optional; used to derive budgets if others missing)
            - start_time: ISO8601 string (optional; defaults to now)
            - end_time: ISO8601 string (optional)
        """
        # Require an access token either from runtime credentials or env
        access_token = None
        if isinstance(self.credentials, dict):
            access_token = self.credentials.get("access_token")
        if not access_token:
            access_token = os.getenv("REDDIT_ACCESS_TOKEN")

        if not access_token:
            logger.warning("Reddit Ads connector not configured with access token")
            return {
                "success": False,
                "error": "Reddit Ads connector not configured with access token",
                "error_code": "CONNECTOR_UNAVAILABLE",
            }

        advertiser_id = campaign_config.get("advertiser_id")
        if not advertiser_id and isinstance(self.credentials, dict):
            advertiser_id = self.credentials.get("ad_account_id")
            
        if not advertiser_id:
            logger.warning("Missing advertiser_id: not provided in config and not selected in credentials")
            return {
                "success": False,
                "error": "Missing advertiser_id for Reddit campaign. "
                         "Please select an ad account in your integration settings.",
                "error_code": "MISSING_ADVERTISER_ID",
            }

        # Map generic goal to Reddit objective string
        goal = (campaign_config.get("goal") or "traffic").lower()
        objective_mapping = {
            "traffic": "TRAFFIC",
            "conversions": "CONVERSIONS",
            "conversion": "CONVERSIONS",
            "awareness": "AWARENESS",
            "engagement": "ENGAGEMENT",
            "video_views": "VIDEO_VIEWS",
        }
        objective = objective_mapping.get(goal, "TRAFFIC")

        # Budget handling – Reddit expects currency units; we derive from cents if needed
        daily_budget = campaign_config.get("daily_budget")
        total_budget = campaign_config.get("total_budget")
        total_budget_cents = campaign_config.get("total_budget_cents")

        if total_budget is None and isinstance(total_budget_cents, (int, float)):
            total_budget = float(total_budget_cents) / 100.0

        if daily_budget is None and total_budget:
            # Simple heuristic: spread over 30 days
            daily_budget = total_budget / 30.0

        if daily_budget is None or total_budget is None:
            logger.warning("Missing budget information for Reddit campaign")
            return {
                "success": False,
                "error": "Missing budget fields for Reddit campaign (daily_budget/total_budget)",
                "error_code": "MISSING_BUDGET",
            }

        name = campaign_config.get("name") or "Kaivo Reddit Campaign"

        start_time = campaign_config.get("start_time")
        if not start_time:
            start_time = datetime.utcnow().isoformat() + "Z"
        end_time = campaign_config.get("end_time")
        if not end_time and campaign_config.get("duration_days"):
            try:
                days = int(campaign_config["duration_days"])
                end_time = (datetime.utcnow() + timedelta(days=days)).isoformat() + "Z"
            except Exception:
                end_time = None

        payload: Dict[str, Any] = {
            "name": name,
            "objective": objective,
            "advertiser_id": advertiser_id,
            "daily_budget": daily_budget,
            "total_budget": total_budget,
            "start_time": start_time,
        }
        if end_time:
            payload["end_time"] = end_time

        user_agent = os.getenv("REDDIT_USER_AGENT", "KaivoAds/1.0 (https://getkaivo.com)")
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "User-Agent": user_agent,
        }

        base_url = os.getenv("REDDIT_ADS_API_BASE_URL", "https://ads-api.reddit.com")
        url = f"{base_url.rstrip('/')}/api/v3/campaigns"

        try:
            logger.info("Creating Reddit campaign", extra={"payload": payload, "advertiser_id": advertiser_id})
            response = httpx.post(url, headers=headers, json=payload, timeout=30.0)
            response.raise_for_status()
            data = response.json()

            # The exact shape can vary; try common patterns
            campaign_id = (
                data.get("id")
                or data.get("campaign", {}).get("id")
                or data.get("data", {}).get("id")
            )

            if not campaign_id:
                logger.error(f"Reddit API did not return campaign id: {data}")
                return {
                    "success": False,
                    "error": "Reddit API did not return campaign id",
                    "error_code": "MISSING_CAMPAIGN_ID",
                    "raw_response": data,
                }

            logger.info(f"Reddit campaign created successfully: {campaign_id}")
            return {
                "success": True,
                "platform_campaign_id": campaign_id,
                "status": "launched",
                "raw_response": data,
            }
        except httpx.HTTPStatusError as e:
            body = None
            try:
                body = e.response.json()
            except Exception:
                body = e.response.text
            logger.error(f"Reddit campaign launch HTTP error: {body}")
            return {
                "success": False,
                "error": "Reddit API error",
                "error_code": "HTTP_ERROR",
                "status_code": e.response.status_code,
                "details": body,
            }
        except Exception as e:
            logger.error(f"Reddit campaign launch failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Reddit campaign launch failed: {e}",
                "error_code": "INTERNAL_ERROR",
            }

    def fetch_reports(
        self,
        platform_campaign_id: str,
        date_range: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Fetch basic performance metrics.
        Currently returns a stubbed response suitable for dashboards.
        """
        logger.info(f"Reddit Ads connector fetch_reports stub for {platform_campaign_id}")
        return {
            "impressions": 10000,
            "clicks": 250,
            "spend": 150.0,
            "cpm": 15.0,
            "ctr": 2.5,
            "conversions": 12,
        }

    def pause_campaign(self, platform_campaign_id: str) -> bool:
        """
        Pause an active campaign.
        Stubbed to always succeed when connector is available.
        """
        if self.status != PlatformStatus.AVAILABLE:
            logger.warning("Reddit Ads connector pause_campaign called in stub mode")
            return False

        logger.info(f"Reddit campaign paused: {platform_campaign_id}")
        return True

    def fetch_ad_accounts(self, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch all advertiser accounts associated with the authenticated user via Reddit Ads API v3.

        Reddit v3 flow:
          1. GET /api/v3/me              → profile_id
          2. GET /api/v3/profiles/{id}   → business_id(s)
          3. GET /api/v3/businesses/{id}/ad_accounts → ad accounts list
        """
        access_token = None
        if isinstance(self.credentials, dict):
            access_token = self.credentials.get("access_token")

        if not access_token:
            return {
                "success": False,
                "error": "Missing access token",
                "error_code": "MISSING_CREDENTIALS",
                "ad_accounts": []
            }

        base_url = os.getenv("REDDIT_ADS_API_BASE_URL", "https://ads-api.reddit.com")
        user_agent = os.getenv("REDDIT_USER_AGENT", "KaivoCore/2.0")
        headers = {
            "Authorization": f"Bearer {access_token}",
            "User-Agent": user_agent,
        }

        try:
            with httpx.Client(timeout=15.0, headers=headers) as client:
                # Step 1: Get current user profile
                me_resp = client.get(f"{base_url}/api/v3/me")
                if me_resp.status_code != 200:
                    return {
                        "success": False,
                        "error": f"Reddit /me returned HTTP {me_resp.status_code}",
                        "error_code": f"HTTP_{me_resp.status_code}",
                        "ad_accounts": [],
                    }

                me_data = me_resp.json()
                profile_id = me_data.get("id") or me_data.get("profile_id")
                if not profile_id:
                    logger.warning(f"Reddit /me response missing profile id: {me_data}")
                    return {
                        "success": False,
                        "error": "Could not determine Reddit profile ID",
                        "error_code": "MISSING_PROFILE_ID",
                        "ad_accounts": [],
                    }

                # Step 2: Get business IDs from profile
                profile_resp = client.get(f"{base_url}/api/v3/profiles/{profile_id}")
                if profile_resp.status_code != 200:
                    return {
                        "success": False,
                        "error": f"Reddit profiles endpoint returned HTTP {profile_resp.status_code}",
                        "error_code": f"HTTP_{profile_resp.status_code}",
                        "ad_accounts": [],
                    }

                profile_data = profile_resp.json()
                businesses = profile_data.get("businesses", [])
                if not businesses:
                    business_id = profile_data.get("business_id")
                    if business_id:
                        businesses = [{"id": business_id}]

                if not businesses:
                    return {
                        "success": True,
                        "ad_accounts": [],
                        "message": "No Reddit business accounts found for this profile.",
                    }

                # Step 3: Fetch ad accounts from each business
                ad_accounts = []
                for biz in businesses:
                    biz_id = biz if isinstance(biz, str) else biz.get("id")
                    if not biz_id:
                        continue
                    acct_resp = client.get(f"{base_url}/api/v3/businesses/{biz_id}/ad_accounts")
                    if acct_resp.status_code != 200:
                        logger.warning(f"Reddit ad_accounts for business {biz_id}: HTTP {acct_resp.status_code}")
                        continue

                    acct_data = acct_resp.json()
                    accounts_list = acct_data if isinstance(acct_data, list) else acct_data.get("data", acct_data.get("ad_accounts", []))
                    if not isinstance(accounts_list, list):
                        accounts_list = []

                    for account in accounts_list:
                        acct_id = str(account.get("id", account.get("ad_account_id", "")))
                        ad_accounts.append({
                            "id": acct_id,
                            "name": account.get("name", f"Reddit Account {acct_id}"),
                            "account_id": acct_id,
                            "currency": account.get("currency", "USD"),
                            "status": str(account.get("status", "active")).lower(),
                        })

            logger.info(f"Reddit ad accounts fetched successfully: {len(ad_accounts)}")
            return {
                "success": True,
                "ad_accounts": ad_accounts,
            }

        except Exception as e:
            logger.error(f"Reddit fetch ad accounts failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "error_code": "CONNECTION_ERROR",
                "ad_accounts": [],
            }
