from typing import Dict, Any, List
from datetime import date
from ..base import BaseAdapter, EstimationResult, LaunchResult
from ..registry import AdapterRegistry

class TikTokAdapter(BaseAdapter):
    async def authenticate(self) -> bool:
        return bool(self.config.api_key)

    async def estimate_plan(self, plan_details: Dict[str, Any]) -> EstimationResult:
        budget = plan_details.get("budget", 0)
        cpm = 8.00 
        markup = 1.5
        final_cpm = cpm * markup
        impressions = (budget / final_cpm) * 1000
        
        return EstimationResult(
            estimated_impressions=int(impressions),
            estimated_reach=int(impressions * 0.85),
            estimated_cpm=final_cpm
        )

    async def launch_campaign(self, campaign_payload: Dict[str, Any]) -> LaunchResult:
        return LaunchResult(
            platform_campaign_id="tt_camp_98765",
            status="active",
            metadata={"objective": "TRAFFIC"}
        )

    async def fetch_reporting(self, campaign_id: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        return [{
            "date": str(start_date),
            "impressions": 8000,
            "clicks": 200,
            "spend": 40.00
        }]

    async def validate_creative(self, creative_url: str, creative_type: str) -> bool:
        return creative_type == "video"

AdapterRegistry.register("tiktok", TikTokAdapter)
