from services.shared.celery_app import celery_app
import time
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def launch_campaign_task(self, campaign_id: str, user_id: str, plan_data: dict):
    """
    Async task to launch a campaign.
    Orchestrates calls to platform adapters.
    """
    logger.info(f"Starting launch for campaign {campaign_id} (User: {user_id})")
    
    try:
        # Simulate processing steps
        logger.info(f"Validating plan for campaign {campaign_id}...")
        time.sleep(1) # Simulate validation
        
        platforms = plan_data.get("platforms", [])
        results = {}
        
        from .adapters.adapter_g import GoogleAdsAdapter
        from .adapters.adapter_m import MetaAdsAdapter
        
        # Map platform names to adapter classes
        adapter_map = {
            "google": GoogleAdsAdapter,
            "meta": MetaAdsAdapter
        }
        
        for platform in platforms:
            logger.info(f"Provisioning on {platform}...")
            
            adapter_class = adapter_map.get(platform.lower())
            if adapter_class:
                # Initialize adapter with config (mock config for now)
                adapter = adapter_class(config={"sandbox_mode": True})
                result = adapter.create_campaign(plan_data)
                results[platform] = result
            else:
                logger.warning(f"No adapter found for {platform}")
                results[platform] = "skipped_no_adapter"
            
        logger.info(f"Campaign {campaign_id} launched successfully on {len(platforms)} platforms.")
        return {"status": "launched", "results": results}
        
    except Exception as e:
        logger.error(f"Failed to launch campaign {campaign_id}: {str(e)}")
        # Retry logic could go here
        raise self.retry(exc=e)
