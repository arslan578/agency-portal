from typing import Dict, Any, List, Optional
from datetime import date

import httpx

from ..base import (
    BaseAdapter,
    EstimationResult,
    LaunchResult,
    with_retry,
    with_timeout,
)
from ..registry import AdapterRegistry
from packages.db.database import SessionLocal
from services.account_service.platform_credentials import PlatformCredentialService


SPOTIFY_ADS_API_BASE = "https://api-partner.spotify.com/ads/v3"


class SpotifyAdapter(BaseAdapter):
    """
    Real Spotify Ads adapter.

    This adapter:
    - Loads OAuth credentials per Kaivo client from PlatformCredentialService.
    - Uses those tokens to call Spotify Ads APIs to create campaigns/ad sets/ads.
    - Still keeps a light estimation implementation for planning.

    Expected campaign_payload (minimum):
    - client_id: int (Kaivo client/brand id, used to look up Spotify credentials)
    - name: str
    - budget: float (in USD)
    - start_date, end_date: date or ISO strings
    - spotify: dict with any Spotify-specific overrides (objective, placement, etc.)
    """

    def __init__(self, config):
        super().__init__(config)
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.app_id: Optional[str] = None
        self.app_secret: Optional[str] = None

    async def _load_credentials_for_client(self, client_id: int) -> bool:
        """
        Load and cache decrypted Spotify credentials for a given Kaivo client.
        """
        db = SessionLocal()
        try:
            creds = PlatformCredentialService.get_credentials(db, client_id, "spotify")
        finally:
            db.close()

        if not creds or not creds.get("access_token"):
            return False

        self.access_token = creds.get("access_token")
        self.refresh_token = creds.get("refresh_token")
        self.app_id = creds.get("app_id")
        self.app_secret = creds.get("app_secret")
        return True

    async def authenticate(self) -> bool:
        """
        Backwards-compatible health check.

        We still use AdapterConfig.api_key as a coarse toggle, but real auth is
        now done per-client via _load_credentials_for_client.
        """
        return bool(self.config.api_key)

    async def estimate_plan(self, plan_details: Dict[str, Any]) -> EstimationResult:
        """
        Simple CPM-based estimate. You can later replace this with Spotify's
        estimate endpoints if desired.
        """
        budget = float(plan_details.get("budget", 0) or 0)
        cpm = 12.00
        markup = 1.5
        final_cpm = cpm * markup
        impressions = (budget / final_cpm) * 1000 if final_cpm > 0 else 0

        return EstimationResult(
            estimated_impressions=int(impressions),
            estimated_reach=int(impressions * 0.75),
            estimated_cpm=final_cpm,
        )

    @with_retry(retries=3, delay=1)
    @with_timeout(seconds=20)
    async def launch_campaign(self, campaign_payload: Dict[str, Any]) -> LaunchResult:
        """
        Create a Spotify campaign, ad set, and ad for a given Kaivo client.

        campaign_payload must include:
        - client_id: Kaivo client id (required)

        It may also include:
        - budget, start_date, end_date
        - targeting and creative info under keys like "targeting", "creative", or "spotify".
        """
        client_id = campaign_payload.get("client_id")
        if client_id is None:
            raise ValueError(
                "SpotifyAdapter.launch_campaign requires campaign_payload['client_id']"
            )

        if not await self._load_credentials_for_client(int(client_id)):
            raise RuntimeError("No active Spotify credentials found for this client")

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        ad_account_id = campaign_payload.get("ad_account_id") or self.app_id
        if not ad_account_id:
            raise RuntimeError("Spotify campaign requires an ad_account_id. Select one in the campaign wizard.")

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1) Create Campaign
            campaign_body = self._build_spotify_campaign_body(campaign_payload)
            camp_res = await client.post(
                f"{SPOTIFY_ADS_API_BASE}/ad_accounts/{ad_account_id}/campaigns",
                json=campaign_body,
                headers=headers,
            )
            camp_res.raise_for_status()
            camp_data = camp_res.json()
            campaign_id = camp_data.get("id")

            # 2) Create Ad Set
            adset_body = self._build_spotify_adset_body(
                campaign_payload, campaign_id=campaign_id, ad_account_id=ad_account_id
            )
            adset_res = await client.post(
                f"{SPOTIFY_ADS_API_BASE}/ad_accounts/{ad_account_id}/ad_sets",
                json=adset_body,
                headers=headers,
            )
            adset_res.raise_for_status()
            adset_data = adset_res.json()
            adset_id = adset_data.get("id")

            # 3) Create Ad (assumes assets already exist or are referenced in payload)
            ad_body = self._build_spotify_ad_body(
                campaign_payload, adset_id=adset_id, ad_account_id=ad_account_id
            )
            ad_res = await client.post(
                f"{SPOTIFY_ADS_API_BASE}/ad_accounts/{ad_account_id}/ads",
                json=ad_body,
                headers=headers,
            )
            ad_res.raise_for_status()
            ad_data = ad_res.json()
            ad_id = ad_data.get("id")

        return LaunchResult(
            platform_campaign_id=str(campaign_id),
            status="active",
            metadata={
                "adset_id": adset_id,
                "ad_id": ad_id,
                "raw_campaign": camp_data,
                "raw_adset": adset_data,
                "raw_ad": ad_data,
            },
        )

    def _build_spotify_campaign_body(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map Kaivo's internal payload to Spotify's campaign schema.

        Align this with:
        - https://developer.spotify.com/documentation/ads-api/reference
        """
        name = payload.get("name") or "Kaivo Spotify Campaign"
        spotify_overrides = payload.get("spotify", {}) or {}

        body: Dict[str, Any] = {
            "name": name,
            # Spotify Ads supports objectives like AWARENESS, REACH, TRAFFIC, etc.
            "objective": spotify_overrides.get("objective", "AWARENESS"),
        }

        # You can enrich this with additional fields as you standardize your model:
        # - "brand": ...
        # - "purchase_order": ...
        return body

    def _build_spotify_adset_body(
        self,
        payload: Dict[str, Any],
        campaign_id: str,
        ad_account_id: str,
    ) -> Dict[str, Any]:
        """
        Build Spotify ad set (budget, schedule, targeting) from Kaivo payload.

        Relevant Spotify reference:
        - POST /ad_accounts/{ad_account_id}/ad_sets
        """
        spotify_overrides = payload.get("spotify", {}) or {}
        budget = float(payload.get("budget", spotify_overrides.get("budget", 0)) or 0)
        start_date = spotify_overrides.get("start_date") or payload.get("start_date")
        end_date = spotify_overrides.get("end_date") or payload.get("end_date")

        body: Dict[str, Any] = {
            "name": f"{payload.get('name', 'Kaivo')}-AdSet",
            "campaign_id": campaign_id,
            "daily_budget": spotify_overrides.get("daily_budget"),
            "lifetime_budget": budget if budget > 0 else None,
            "start_date": str(start_date) if start_date else None,
            "end_date": str(end_date) if end_date else None,
            "delivery_goal": spotify_overrides.get("delivery_goal", "IMPRESSIONS"),
            "pacing": spotify_overrides.get("pacing", "PACING_EVEN"),
        }

        # Targeting (geos, ages, etc.) can be mapped from your audience/plan model:
        targeting = spotify_overrides.get("targeting") or payload.get("targeting")
        if targeting:
            body["targeting_spec"] = targeting

        # Prune None values to keep request clean
        return {k: v for k, v in body.items() if v is not None}

    def _build_spotify_ad_body(
        self,
        payload: Dict[str, Any],
        adset_id: str,
        ad_account_id: str,
    ) -> Dict[str, Any]:
        """
        Build Spotify ad object – references audio/image assets.

        You can either:
        - Upload assets separately and pass asset IDs here, or
        - Store asset IDs in your own system and surface them via payload["spotify"].
        """
        spotify_overrides = payload.get("spotify", {}) or {}
        creative = spotify_overrides.get("creative") or payload.get("creative") or {}

        body: Dict[str, Any] = {
            "name": f"{payload.get('name', 'Kaivo')}-Ad",
            "ad_set_id": adset_id,
            # For real integration, map these to Spotify's asset/creative fields.
            "creative": {
                "headline": creative.get("headline"),
                "call_to_action": creative.get("call_to_action"),
                "clickthrough_url": creative.get("landing_page"),
                "audio_asset_id": creative.get("audio_asset_id"),
                "image_asset_id": creative.get("image_asset_id"),
            },
        }

        return {k: v for k, v in body.items() if v is not None}

    async def fetch_reporting(
        self, campaign_id: str, start_date: date, end_date: date
    ) -> List[Dict[str, Any]]:
        """
        Placeholder reporting implementation.

        To make this real, call Spotify's reporting endpoints and normalize
        metrics into the shape below.
        """
        return [
            {
                "date": str(start_date),
                "impressions": 2500,
                "clicks": 50,
                "spend": 30.00,
            }
        ]

    async def validate_creative(self, creative_url: str, creative_type: str) -> bool:
        """
        Basic creative validation. Extend with duration/bitrate checks as needed.
        """
        return creative_type == "audio"


AdapterRegistry.register("spotify", SpotifyAdapter)
