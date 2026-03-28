from typing import Dict, Any, List
from datetime import date
from ..base import BaseAdapter, EstimationResult, LaunchResult
from ..registry import AdapterRegistry

class XAdapter(BaseAdapter):
    async def authenticate(self) -> bool:
        return bool(self.config.api_key)

    async def estimate_plan(self, plan_details: Dict[str, Any]) -> EstimationResult:
        budget = plan_details.get("budget", 0)
        cpm = 6.50 
        markup = 1.5
        final_cpm = cpm * markup
        impressions = (budget / final_cpm) * 1000
        
        return EstimationResult(
            estimated_impressions=int(impressions),
            estimated_reach=int(impressions * 0.5),
            estimated_cpm=final_cpm
        )

    async def launch_campaign(self, campaign_payload: Dict[str, Any]) -> LaunchResult:
        return LaunchResult(
            platform_campaign_id="x_camp_11111",
            status="active",
            metadata={}
        )

    async def fetch_reporting(self, campaign_id: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        return [{
            "date": str(start_date),
            "impressions": 4000,
            "clicks": 100,
            "spend": 26.00
        }]

    async def validate_creative(self, creative_url: str, creative_type: str) -> bool:
        return True

AdapterRegistry.register("x", XAdapter)
