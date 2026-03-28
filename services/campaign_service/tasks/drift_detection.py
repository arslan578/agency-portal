from services.shared.celery_app import celery_app
from sqlalchemy.orm import Session
from packages.db.database import SessionLocal
from . import models
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True)
def check_platform_campaign_state_task(self):
    """
    Periodic task to check for state drift between Kaivo and external platforms.
    """
    db: Session = SessionLocal()
    try:
        # Get all active campaigns
        campaigns = db.query(models.Campaign).filter(
            models.Campaign.status == models.CampaignStatus.ACTIVE
        ).all()
        
        for campaign in campaigns:
            if not campaign.platform_campaign_ids_json:
                continue
                
            platform_ids = campaign.platform_campaign_ids_json
            
            for platform, ext_id in platform_ids.items():
                # Stub: In a real implementation, we would call the adapter here
                # adapter = get_adapter(platform)
                # remote_status = adapter.get_campaign_status(ext_id)
                
                # Simulated Drift Detection (Mock)
                # For demonstration, we assume no drift unless specifically tested
                remote_status = "active" 
                
                # Check 1: Status Drift
                if remote_status != "active":
                    logger.warning(f"Drift detected for Campaign {campaign.id} on {platform}. Kaivo: ACTIVE, Remote: {remote_status}")
                    
                    drift = models.CampaignStateDrift(
                        campaign_id=campaign.id,
                        platform=platform,
                        kaivo_status="active",
                        platform_status=remote_status,
                        detected_at=datetime.utcnow().isoformat(),
                        severity="high",
                        explanation="Campaign is paused on platform but active in Kaivo."
                    )
                    db.add(drift)
                    db.commit()
                    
                # Check 2: Budget Drift (Mock)
                # In real app, compare campaign.total_budget with remote_budget
                
                # Check 3: Pacing (Mock)
                # In real app, compare spend vs expected_spend
                
    except Exception as e:
        logger.error(f"Error in drift detection task: {str(e)}")
    finally:
        db.close()
