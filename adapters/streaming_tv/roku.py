from typing import Dict, Any, List
from datetime import date
import asyncio
from ..base import BaseAdapter, EstimationResult, LaunchResult, with_timeout, with_retry
from ..registry import AdapterRegistry

class RokuAdapter(BaseAdapter):
    async def authenticate(self) -> bool:
        # Stub: Check if API key is present
        if self.config.environment == "sandbox":
            return True
        return bool(self.config.api_key)

    async def check_health(self) -> bool:
        if self.config.environment == "sandbox":
            return True
        # Real health check would ping an endpoint
        return await self.authenticate()

    async def estimate_plan(self, plan_details: Dict[str, Any]) -> EstimationResult:
        # Stub: Return estimates based on budget
        budget = plan_details.get("budget", 0)
        cpm = 25.00 # Base CPM
        markup = 1.5 # 50% markup
        final_cpm = cpm * markup
        
        impressions = (budget / final_cpm) * 1000
        
        return EstimationResult(
            estimated_impressions=int(impressions),
            estimated_reach=int(impressions * 0.8), # Mock reach ratio
            estimated_cpm=final_cpm
        )

    @with_timeout(seconds=15)
    @with_retry(retries=3)
    async def launch_campaign(self, campaign_payload: Dict[str, Any]) -> LaunchResult:
        if self.config.environment == "sandbox":
            # Simulate latency
            await asyncio.sleep(1)
            return LaunchResult(
                platform_campaign_id="sandbox_roku_123",
                status="active",
                metadata={"env": "sandbox"}
            )

        # Real implementation would go here
        # For now, we simulate a successful launch
        return LaunchResult(
            platform_campaign_id="roku_camp_12345",
            status="active",
            metadata={"flight_dates": "2023-01-01_2023-01-31"}
        )

    @with_timeout(seconds=10)
    @with_retry(retries=3)
    async def fetch_reporting(self, campaign_id: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        if self.config.environment == "sandbox":
            return [{
                "date": str(start_date),
                "impressions": 5000,
                "clicks": 100,
                "spend": 125.00
            }]

        # Stub: Return mock reporting data
        return [{
            "date": str(start_date),
            "impressions": 1000,
            "clicks": 50,
            "spend": 25.00
        }]

    async def validate_creative(self, creative_url: str, creative_type: str) -> bool:
        # Stub: Check if video
        return creative_type == "video"

# Register the adapter
AdapterRegistry.register("roku", RokuAdapter)
