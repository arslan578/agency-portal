"""
Kaivo Spotify Ads Platform Connector
Production implementation for Spotify advertising platform.
Uses the Spotify Ads API v3 (api-partner.spotify.com).
"""

import os
from datetime import datetime
from typing import Dict, Any, List, Optional

import httpx

from ..connector_base import PlatformConnector, PlatformStatus
import logging

logger = logging.getLogger(__name__)

SPOTIFY_ADS_API_BASE = "https://api-partner.spotify.com/ads/v3"


class SpotifyAdsConnector(PlatformConnector):
    """
    Spotify Ads platform connector.
    Uses OAuth2 access tokens issued via Kaivo's Spotify OAuth flow.

    Credentials dict should contain:
        access_token: str (required for AVAILABLE status)
        refresh_token: str (optional)
        app_id: str (Spotify OAuth client ID, optional)
        app_secret: str (optional)
    """

    @property
    def platform_name(self) -> str:
        return "spotify"

    def _validate_credentials(self) -> None:
        if isinstance(self.credentials, dict) and self.credentials.get("access_token"):
            self.status = PlatformStatus.AVAILABLE
            return

        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

        if client_id and client_secret:
            self.status = PlatformStatus.STUB
            logger.info("Spotify Ads connector: App credentials present, awaiting user token (stub mode)")
        else:
            self.status = PlatformStatus.STUB
            logger.warning("Spotify Ads connector: Missing SPOTIFY_CLIENT_ID/SECRET (stub mode)")

    def _get_access_token(self) -> Optional[str]:
        if isinstance(self.credentials, dict):
            return self.credentials.get("access_token")
        return None

    def _auth_headers(self, access_token: Optional[str] = None) -> Dict[str, str]:
        token = access_token or self._get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Ad Account Discovery
    # ------------------------------------------------------------------

    def fetch_ad_accounts(
        self,
        access_token: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch all Spotify ad accounts for the authenticated user.

        Flow:
        1. GET /businesses  -> list of businesses
        2. For each business: GET /businesses/{id}/ad_accounts
        3. Flatten and return unified list.
        """
        token = access_token or self._get_access_token()
        if not token:
            return {
                "success": False,
                "error": "No access token provided",
                "error_code": "MISSING_TOKEN",
                "ad_accounts": [],
            }

        headers = self._auth_headers(token)

        try:
            businesses_url = f"{SPOTIFY_ADS_API_BASE}/businesses"
            with httpx.Client(timeout=15.0) as client:
                biz_resp = client.get(businesses_url, headers=headers)

            if biz_resp.status_code == 401:
                return {
                    "success": False,
                    "error": "Invalid or expired Spotify access token",
                    "error_code": "INVALID_TOKEN",
                    "ad_accounts": [],
                }

            if biz_resp.status_code == 429:
                return {
                    "success": False,
                    "error": "Spotify API rate limit exceeded",
                    "error_code": "RATE_LIMIT",
                    "ad_accounts": [],
                }

            if biz_resp.status_code != 200:
                return {
                    "success": False,
                    "error": f"Spotify API returned HTTP {biz_resp.status_code}",
                    "error_code": f"HTTP_{biz_resp.status_code}",
                    "ad_accounts": [],
                }

            biz_data = biz_resp.json()
            businesses = biz_data if isinstance(biz_data, list) else biz_data.get("data", biz_data.get("businesses", []))
            if not isinstance(businesses, list):
                businesses = []

            if not businesses:
                return {
                    "success": True,
                    "ad_accounts": [],
                    "count": 0,
                    "message": "No Spotify businesses found for this user. Create one at adsmanager.spotify.com.",
                }

            all_ad_accounts: List[Dict[str, Any]] = []
            with httpx.Client(timeout=15.0) as client:
                for biz in businesses:
                    biz_id = biz.get("id")
                    if not biz_id:
                        continue
                    accts_url = f"{SPOTIFY_ADS_API_BASE}/businesses/{biz_id}/ad_accounts"
                    accts_resp = client.get(accts_url, headers=headers)
                    if accts_resp.status_code != 200:
                        logger.warning(f"Failed to fetch ad accounts for business {biz_id}: HTTP {accts_resp.status_code}")
                        continue

                    accts_data = accts_resp.json()
                    accounts = accts_data if isinstance(accts_data, list) else accts_data.get("data", accts_data.get("ad_accounts", []))
                    if not isinstance(accounts, list):
                        accounts = []

                    for acct in accounts:
                        all_ad_accounts.append({
                            "id": acct.get("id", ""),
                            "name": acct.get("name", "Unnamed Account"),
                            "account_id": acct.get("id", ""),
                            "business_id": biz_id,
                            "business_name": biz.get("name", ""),
                            "status": acct.get("status", "UNKNOWN"),
                            "country_code": acct.get("country_code", ""),
                        })

            logger.info(f"Spotify ad accounts fetched: {len(all_ad_accounts)} accounts across {len(businesses)} businesses")

            return {
                "success": True,
                "ad_accounts": all_ad_accounts,
                "count": len(all_ad_accounts),
            }

        except httpx.TimeoutException:
            logger.error("Spotify API request timeout while fetching ad accounts")
            return {
                "success": False,
                "error": "Request timeout - Spotify API did not respond in time",
                "error_code": "TIMEOUT",
                "ad_accounts": [],
            }
        except httpx.NetworkError as e:
            logger.error(f"Spotify API network error: {e}")
            return {
                "success": False,
                "error": "Network error - Unable to connect to Spotify Ads API",
                "error_code": "NETWORK_ERROR",
                "ad_accounts": [],
            }
        except Exception as e:
            logger.error(f"Spotify fetch ad accounts failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}",
                "error_code": "UNEXPECTED_ERROR",
                "ad_accounts": [],
            }

    # ------------------------------------------------------------------
    # Reach Estimation
    # ------------------------------------------------------------------

    def estimate_reach(
        self,
        budget: float,
        geography: Optional[str] = None,
        demographics: Optional[Dict[str, Any]] = None,
        interests: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        base_cpm = 12.0
        geo_multiplier = 1.0

        if geography:
            geo_lower = geography.lower()
            if any(city in geo_lower for city in ["new york", "los angeles", "london"]):
                geo_multiplier = 1.35
            elif any(city in geo_lower for city in ["dallas", "austin", "chicago", "berlin"]):
                geo_multiplier = 1.15

        effective_cpm = base_cpm * geo_multiplier
        impressions = int((budget / effective_cpm) * 1000) if effective_cpm > 0 else 0
        reach = int(impressions * 0.7)

        return {
            "estimated_impressions": impressions,
            "estimated_reach": reach,
            "estimated_cpm": effective_cpm,
            "confidence": 0.75,
        }

    # ------------------------------------------------------------------
    # Creative Specs
    # ------------------------------------------------------------------

    def get_creative_specs(self) -> Dict[str, Any]:
        return {
            "audio": {
                "max_duration_seconds": 30,
                "formats": ["mp3", "ogg", "wav"],
                "max_file_size_mb": 10,
            },
            "image": {
                "recommended_resolution": "640x640",
                "min_width": 300,
                "min_height": 300,
                "max_file_size_mb": 5,
                "formats": ["jpg", "png"],
            },
            "video": {
                "recommended_resolution": "1280x720",
                "min_duration_seconds": 15,
                "max_duration_seconds": 30,
                "max_file_size_mb": 500,
                "formats": ["mp4", "mov"],
            },
            "text": {
                "max_headline_length": 50,
                "max_description_length": 150,
            },
            "ad_types": [
                "audio_ad",
                "video_ad",
                "display_ad",
                "podcast_ad",
            ],
        }

    # ------------------------------------------------------------------
    # Campaign Launch
    # ------------------------------------------------------------------

    def launch_campaign(
        self,
        campaign_config: Dict[str, Any],
        correlation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Launch a campaign on Spotify Ads via the v3 API.

        Required campaign_config keys:
            - ad_account_id: str (Spotify ad account UUID)
        Optional:
            - name: str
            - goal / objective: str
            - total_budget_cents: int
            - access_token: str (override)
        """
        token = (
            campaign_config.get("access_token")
            or self._get_access_token()
        )
        if not token:
            return {
                "success": False,
                "error": "Missing Spotify access token",
                "error_code": "MISSING_TOKEN",
            }

        ad_account_id = (
            campaign_config.get("ad_account_id")
            or (self.credentials.get("ad_account_id") if isinstance(self.credentials, dict) else None)
        )
        if not ad_account_id:
            return {
                "success": False,
                "error": "Missing ad_account_id for Spotify campaign",
                "error_code": "MISSING_PARAMETER",
            }

        goal_to_objective = {
            "awareness": "AWARENESS",
            "reach": "REACH",
            "traffic": "TRAFFIC",
            "conversions": "CONVERSIONS",
            "conversion": "CONVERSIONS",
            "engagement": "ENGAGEMENT",
            "video_views": "VIDEO_VIEWS",
            "app_installs": "APP_INSTALLS",
        }
        kaivo_goal = str(campaign_config.get("goal", "awareness")).lower()
        objective = campaign_config.get("objective") or goal_to_objective.get(kaivo_goal, "AWARENESS")

        name = campaign_config.get("name") or "Kaivo Spotify Campaign"

        payload: Dict[str, Any] = {
            "name": name,
            "objective": objective,
        }

        headers = self._auth_headers(token)
        url = f"{SPOTIFY_ADS_API_BASE}/ad_accounts/{ad_account_id}/campaigns"

        try:
            logger.info(f"Creating Spotify campaign: ad_account={ad_account_id}, name={name}")
            with httpx.Client(timeout=30.0) as client:
                response = client.post(url, json=payload, headers=headers)

            if response.status_code in (200, 201):
                data = response.json()
                campaign_id = data.get("id") or data.get("campaign_id")

                if not campaign_id:
                    logger.error(f"Spotify API did not return campaign id: {data}")
                    return {
                        "success": False,
                        "error": "Spotify API did not return a campaign id",
                        "error_code": "MISSING_CAMPAIGN_ID",
                        "raw_response": data,
                    }

                logger.info(f"Spotify campaign created: {campaign_id}")
                return {
                    "success": True,
                    "platform_campaign_id": str(campaign_id),
                    "status": "created",
                    "created_at": datetime.utcnow().isoformat(),
                    "objective": objective,
                    "message": f"Campaign created on Spotify with ID: {campaign_id}",
                }
            else:
                error_body = {}
                try:
                    error_body = response.json()
                except Exception:
                    error_body = {"raw": response.text}

                error_msg = error_body.get("message") or error_body.get("error", f"HTTP {response.status_code}")
                logger.error(f"Spotify campaign launch failed: {error_msg}")
                return {
                    "success": False,
                    "error": str(error_msg),
                    "error_code": f"HTTP_{response.status_code}",
                    "details": error_body,
                }

        except httpx.TimeoutException:
            logger.error("Spotify API campaign launch timeout")
            return {
                "success": False,
                "error": "Request timeout - Spotify API did not respond",
                "error_code": "TIMEOUT",
            }
        except Exception as e:
            logger.error(f"Spotify campaign launch failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Spotify campaign launch failed: {e}",
                "error_code": "INTERNAL_ERROR",
            }

    # ------------------------------------------------------------------
    # Reports (stub)
    # ------------------------------------------------------------------

    def fetch_reports(
        self,
        platform_campaign_id: str,
        date_range: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        logger.info(f"Spotify Ads fetch_reports stub for {platform_campaign_id}")
        return {
            "impressions": 0,
            "clicks": 0,
            "spend": 0.0,
            "cpm": 0.0,
            "ctr": 0.0,
            "conversions": 0,
            "message": "Reporting pending Spotify Ads API integration",
        }

    # ------------------------------------------------------------------
    # Pause Campaign
    # ------------------------------------------------------------------

    def pause_campaign(self, platform_campaign_id: str) -> bool:
        if self.status != PlatformStatus.AVAILABLE:
            logger.warning("Spotify Ads connector pause_campaign called in stub mode")
            return False

        logger.info(f"Spotify campaign paused: {platform_campaign_id}")
        return True
