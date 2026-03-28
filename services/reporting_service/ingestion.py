from services.shared.celery_app import celery_app
from datetime import date
import logging
from typing import Dict, Any, List
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class NormalizedReport(BaseModel):
    platform: str
    date: str
    impressions: int
    reach: int
    clicks: int
    views: int
    listens: int
    spend: float
    cpm: float
    cpc: float
    ctr: float
    conversions: int
    view_rate: float
    listen_rate: float
    frequency: float

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def ingest_report_task(self, platform: str, report_date: str):
    """
    Async task to ingest and normalize reporting data from a platform.
    """
    logger.info(f"Starting ingestion for {platform} on {report_date}")
    
    try:
        # 1. Fetch raw report from adapter (Simulated)
        # adapter = get_adapter(platform)
        # raw_data = adapter.fetch_reporting(..., date.fromisoformat(report_date))
        
        # Simulated raw data
        raw_data = {
            "impressions": 10000,
            "clicks": 250,
            "spend": 150.00,
            "conversions": 5
        }
        
        # 2. Normalize Data
        normalized = normalize_data(platform, report_date, raw_data)
        
        # 3. Store in Database (Stub)
        # save_report(normalized)
        
        logger.info(f"Successfully ingested report for {platform} on {report_date}")
        return normalized.dict()
        
    except Exception as e:
        logger.error(f"Failed to ingest report for {platform}: {str(e)}")
        raise self.retry(exc=e)

def normalize_data(platform: str, report_date: str, raw: Dict[str, Any]) -> NormalizedReport:
    """
    Normalize raw platform data into the unified schema.
    """
    impressions = raw.get("impressions", 0)
    clicks = raw.get("clicks", 0)
    spend = float(raw.get("spend", 0.0))
    conversions = raw.get("conversions", 0)
    
    from packages.shared.constants import KAIVO_CPM_MARKUP
    
    raw_cpm = (spend / impressions) * 1000 if impressions > 0 else 0.0
    cpm = raw_cpm * KAIVO_CPM_MARKUP
    cpc = (spend / clicks) if clicks > 0 else 0.0
    ctr = (clicks / impressions) if impressions > 0 else 0.0
    
    return NormalizedReport(
        platform=platform,
        date=report_date,
        impressions=impressions,
        reach=int(impressions * 0.8), # Estimate
        clicks=clicks,
        views=raw.get("views", 0),
        listens=raw.get("listens", 0),
        spend=spend,
        cpm=cpm,
        cpc=cpc,
        ctr=ctr,
        conversions=conversions,
        view_rate=0.0, # Calculate if views exist
        listen_rate=0.0, # Calculate if listens exist
        frequency=1.2 # Estimate
    )
