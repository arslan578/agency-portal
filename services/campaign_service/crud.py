"""
Campaign Service CRUD Operations

All campaigns are owned by clients (brands).
Credits are managed at the agency level via the client's agency_id.
"""

from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models
from pydantic import BaseModel
from decimal import Decimal
from typing import Optional, Dict
import json
import logging
from sqlalchemy.orm.attributes import flag_modified

from packages.db.models import Client, Agency
from services.billing_service.models import CreditTransaction
from services.account_service.platform_credentials import PlatformCredentialService

logger = logging.getLogger(__name__)


class PlanCreate(BaseModel):
    client_id: int
    name: str
    goal: str
    total_budget_cents: int
    audience_id: Optional[int] = None
    platform_allocations_json: dict
    shopify_shop_domain: Optional[str] = None
    shopify_product_id: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    total_budget_cents: Optional[int] = None
    audience_id: Optional[int] = None
    platform_allocations_json: Optional[dict] = None


def _ensure_json_dict(value):
    """Ensure value is a Python dict for SQLAlchemy JSON column compatibility"""
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON format for platform_allocations_json")
    if isinstance(value, dict):
        return dict(value)
    try:
        return dict(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="platform_allocations_json must be a valid JSON object")


def _get_agency_for_client(db: Session, client_id: int) -> Optional[Agency]:
    """Get the agency that owns a client"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        return None
    return db.query(Agency).filter(Agency.id == client.agency_id).first()


def create_plan(db: Session, plan: PlanCreate):
    """Create a plan and automatically convert to campaign"""
    raw_value = plan.platform_allocations_json
    allocations = _ensure_json_dict(raw_value)
    
    if not isinstance(allocations, dict):
        raise HTTPException(status_code=500, detail="Internal error: platform_allocations_json conversion failed")
    
    client = db.query(Client).filter(Client.id == plan.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    db_plan = models.Plan(
        client_id=plan.client_id,
        name=plan.name,
        goal=plan.goal,
        total_budget_cents=plan.total_budget_cents,
        audience_id=plan.audience_id if plan.audience_id else None,
        platform_allocations_json=allocations,
        status=models.PlanStatus.DRAFT,
        shopify_shop_domain=plan.shopify_shop_domain,
        shopify_product_id=plan.shopify_product_id,
        media_url=plan.media_url,
        media_type=plan.media_type
    )
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    
    campaign = models.Campaign(
        plan_id=db_plan.id,
        client_id=plan.client_id,
        name=db_plan.name,
        goal=db_plan.goal,
        total_budget_cents=db_plan.total_budget_cents,
        audience_id=db_plan.audience_id,
        platform_allocations=db_plan.platform_allocations_json,
        status=models.CampaignStatus.DRAFT,
        media_url=plan.media_url,
        media_type=plan.media_type
    )
    db_plan.status = models.PlanStatus.CONVERTED
    db.add(campaign)
    
    agency = _get_agency_for_client(db, plan.client_id)
    if agency:
        budget_decimal = Decimal(db_plan.total_budget_cents) / 100
        if agency.credits < budget_decimal:
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient credits. Have ${agency.credits}, need ${budget_decimal}"
            )
        
        agency.credits -= budget_decimal
        
        transaction = CreditTransaction(
            agency_id=agency.id,
            amount=-budget_decimal,
            transaction_type="campaign_spend",
            description=f"Campaign creation: {db_plan.name}"
        )
        db.add(transaction)
    
    db.commit()
    db.refresh(campaign)
    
    return db_plan


def update_plan(db: Session, plan_id: int, plan_update: PlanUpdate):
    """Update a plan"""
    db_plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    update_data = plan_update.dict(exclude_unset=True)
    
    if 'platform_allocations_json' in update_data:
        update_data['platform_allocations_json'] = _ensure_json_dict(update_data['platform_allocations_json'])
    
    for key, value in update_data.items():
        setattr(db_plan, key, value)
    
    db.commit()
    db.refresh(db_plan)
    return db_plan


def convert_to_campaign(db: Session, plan_id: int):
    """Convert a plan to a campaign"""
    existing_campaign = db.query(models.Campaign).filter(models.Campaign.plan_id == plan_id).first()
    if existing_campaign:
        return existing_campaign

    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    try:
        campaign = models.Campaign(
            plan_id=plan.id,
            client_id=plan.client_id,
            name=plan.name,
            goal=plan.goal,
            total_budget_cents=plan.total_budget_cents,
            audience_id=plan.audience_id,
            platform_allocations=plan.platform_allocations_json,
            status=models.CampaignStatus.DRAFT,
            media_url=plan.media_url,
            media_type=plan.media_type
        )
        plan.status = models.PlanStatus.CONVERTED
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        
        return campaign
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to convert plan {plan_id} to campaign: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to convert plan to campaign: {str(e)}")


def get_campaign(db: Session, campaign_id: int):
    """Get a single campaign by ID"""
    campaign = db.query(models.Campaign).filter(models.Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


def list_campaigns(db: Session, client_id: Optional[int] = None, agency_id: Optional[int] = None):
    """List campaigns with optional filtering by client or agency"""
    query = db.query(models.Campaign)
    
    if client_id:
        query = query.filter(models.Campaign.client_id == client_id)
    elif agency_id:
        client_ids = db.query(Client.id).filter(Client.agency_id == agency_id).subquery()
        query = query.filter(models.Campaign.client_id.in_(client_ids))
    
    return query.all()


def start_campaign(db: Session, campaign_id: int):
    """Start a campaign and publish to platforms"""
    campaign = get_campaign(db, campaign_id)
    
    if campaign.status == models.CampaignStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Campaign is already active")
    
    if campaign.status == models.CampaignStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot start a completed campaign")
    
    if campaign.client_id:
        agency = _get_agency_for_client(db, campaign.client_id)
        if agency:
            budget_decimal = Decimal(campaign.total_budget_cents) / 100
            if agency.credits < budget_decimal:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient credits to launch campaign. Have ${agency.credits}, need ${budget_decimal}"
                )
    
    campaign.status = models.CampaignStatus.ACTIVE
    
    platform_allocations = campaign.platform_allocations or {}
    platform_campaign_ids = campaign.platform_campaign_ids or {}
    publish_errors = []
    
    for platform_name, allocation in platform_allocations.items():
        if platform_name in platform_campaign_ids and platform_campaign_ids[platform_name]:
            logger.info(f"Platform {platform_name} already published, skipping")
            continue
            
        platform_normalized = platform_name.lower().replace("_", "").replace("-", "")
        
        if platform_normalized in ["meta", "facebook"]:
            try:
                from services.platform_service.connectors.meta import MetaAdsConnector
                
                connector = MetaAdsConnector()
                
                campaign_config = {
                    "name": campaign.name,
                    "goal": campaign.goal,
                    "total_budget_cents": allocation,
                    "client_id": campaign.client_id,
                    "audience_id": campaign.audience_id
                }
                
                result = connector.launch_campaign(campaign_config)
                
                if not campaign.platform_campaign_ids:
                    campaign.platform_campaign_ids = {}
                campaign.platform_campaign_ids[platform_name] = result["platform_campaign_id"]
                flag_modified(campaign, "platform_campaign_ids")
                
            except Exception as e:
                error_msg = f"Failed to publish to {platform_name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                publish_errors.append(error_msg)
                
        elif platform_normalized in ["google", "googleads"]:
            try:
                from services.platform_service.connectors.google import GoogleAdsConnector
                
                connector = GoogleAdsConnector()
                
                campaign_config = {
                    "name": campaign.name,
                    "goal": campaign.goal,
                    "total_budget_cents": allocation,
                    "client_id": campaign.client_id,
                    "audience_id": campaign.audience_id
                }
                
                result = connector.launch_campaign(campaign_config)
                
                if not campaign.platform_campaign_ids:
                    campaign.platform_campaign_ids = {}
                campaign.platform_campaign_ids[platform_name] = result["platform_campaign_id"]
                flag_modified(campaign, "platform_campaign_ids")
                
                logger.info(f"Successfully published campaign {campaign_id} to Google Ads: {result['platform_campaign_id']}")
                
            except Exception as e:
                error_msg = f"Failed to publish to {platform_name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                publish_errors.append(error_msg)
        elif platform_normalized in ["reddit"]:
            try:
                from services.platform_service.connectors.reddit import RedditAdsConnector

                reddit_creds = None
                if campaign.client_id:
                    reddit_creds = PlatformCredentialService.get_credentials(
                        db, client_id=campaign.client_id, platform="reddit"
                    )

                connector = RedditAdsConnector(credentials=reddit_creds)

                alloc_ad_account_id = None
                alloc_budget = allocation
                if isinstance(allocation, dict):
                    alloc_budget = allocation.get("budget", allocation)
                    alloc_ad_account_id = allocation.get("ad_account_id")

                campaign_config = {
                    "name": campaign.name,
                    "goal": campaign.goal,
                    "total_budget_cents": alloc_budget,
                    "client_id": campaign.client_id,
                    "audience_id": campaign.audience_id,
                    "advertiser_id": alloc_ad_account_id or (reddit_creds.get("ad_account_id") if reddit_creds else None),
                }

                result = connector.launch_campaign(campaign_config)

                if not campaign.platform_campaign_ids:
                    campaign.platform_campaign_ids = {}
                if result.get("platform_campaign_id"):
                    campaign.platform_campaign_ids[platform_name] = result.get("platform_campaign_id")
                    flag_modified(campaign, "platform_campaign_ids")

                if not result.get("success", True):
                    error_msg = f"Reddit launch reported error for {platform_name}: {result.get('error')}"
                    logger.warning(error_msg)
                    publish_errors.append(error_msg)

            except Exception as e:
                error_msg = f"Failed to publish to {platform_name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                publish_errors.append(error_msg)
        elif platform_normalized in ["tiktok"]:
            try:
                from services.platform_service.connectors.tiktok import TikTokAdsConnector

                tiktok_creds = None
                if campaign.client_id:
                    tiktok_creds = PlatformCredentialService.get_credentials(
                        db, client_id=campaign.client_id, platform="tiktok"
                    )

                connector = TikTokAdsConnector(credentials=tiktok_creds)

                alloc_ad_account_id = None
                alloc_budget = allocation
                if isinstance(allocation, dict):
                    alloc_budget = allocation.get("budget", allocation)
                    alloc_ad_account_id = allocation.get("ad_account_id")

                campaign_config = {
                    "name": campaign.name,
                    "goal": campaign.goal,
                    "total_budget_cents": alloc_budget,
                    "client_id": campaign.client_id,
                    "audience_id": campaign.audience_id,
                    "ad_account_id": alloc_ad_account_id or (tiktok_creds.get("ad_account_id") if tiktok_creds else None),
                }

                result = connector.launch_campaign(campaign_config)

                if not campaign.platform_campaign_ids:
                    campaign.platform_campaign_ids = {}
                if result.get("platform_campaign_id"):
                    campaign.platform_campaign_ids[platform_name] = result.get("platform_campaign_id")
                    flag_modified(campaign, "platform_campaign_ids")

                if not result.get("success", True):
                    error_msg = f"TikTok launch reported error for {platform_name}: {result.get('error')}"
                    logger.warning(error_msg)
                    publish_errors.append(error_msg)

            except Exception as e:
                error_msg = f"Failed to publish to {platform_name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                publish_errors.append(error_msg)
        elif platform_normalized in ["microsoftads", "microsoft"]:
            try:
                from services.platform_service.connectors.microsoft_ads import MicrosoftAdsConnector

                ms_creds = None
                if campaign.client_id:
                    ms_creds = PlatformCredentialService.get_credentials(
                        db, client_id=campaign.client_id, platform="microsoft_ads"
                    )

                connector = MicrosoftAdsConnector(credentials=ms_creds)

                alloc_ad_account_id = None
                alloc_budget = allocation
                if isinstance(allocation, dict):
                    alloc_budget = allocation.get("budget", allocation)
                    alloc_ad_account_id = allocation.get("ad_account_id")

                campaign_config = {
                    "name": campaign.name,
                    "goal": campaign.goal,
                    "total_budget_cents": alloc_budget,
                    "client_id": campaign.client_id,
                    "audience_id": campaign.audience_id,
                    "ad_account_id": alloc_ad_account_id or (ms_creds.get("ad_account_id") if ms_creds else None),
                }

                result = connector.launch_campaign(campaign_config)

                if not campaign.platform_campaign_ids:
                    campaign.platform_campaign_ids = {}
                if result.get("platform_campaign_id"):
                    campaign.platform_campaign_ids[platform_name] = result.get("platform_campaign_id")
                    flag_modified(campaign, "platform_campaign_ids")

                if not result.get("success", True):
                    error_msg = f"Microsoft Ads launch reported error for {platform_name}: {result.get('error')}"
                    logger.warning(error_msg)
                    publish_errors.append(error_msg)

            except Exception as e:
                error_msg = f"Failed to publish to {platform_name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                publish_errors.append(error_msg)
        elif platform_normalized in ["spotify"]:
            try:
                from services.platform_service.connectors.spotify import SpotifyAdsConnector

                spotify_creds = None
                if campaign.client_id:
                    spotify_creds = PlatformCredentialService.get_credentials(
                        db, client_id=campaign.client_id, platform="spotify"
                    )

                connector = SpotifyAdsConnector(credentials=spotify_creds)

                alloc_ad_account_id = None
                alloc_budget = allocation
                if isinstance(allocation, dict):
                    alloc_budget = allocation.get("budget", allocation)
                    alloc_ad_account_id = allocation.get("ad_account_id")

                campaign_config = {
                    "name": campaign.name,
                    "goal": campaign.goal,
                    "total_budget_cents": alloc_budget,
                    "client_id": campaign.client_id,
                    "audience_id": campaign.audience_id,
                    "ad_account_id": alloc_ad_account_id or (spotify_creds.get("ad_account_id") if spotify_creds else None),
                }

                result = connector.launch_campaign(campaign_config)

                if not campaign.platform_campaign_ids:
                    campaign.platform_campaign_ids = {}
                if result.get("platform_campaign_id"):
                    campaign.platform_campaign_ids[platform_name] = result.get("platform_campaign_id")
                    flag_modified(campaign, "platform_campaign_ids")

                if not result.get("success", True):
                    error_msg = f"Spotify launch reported error for {platform_name}: {result.get('error')}"
                    logger.warning(error_msg)
                    publish_errors.append(error_msg)

            except Exception as e:
                error_msg = f"Failed to publish to {platform_name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                publish_errors.append(error_msg)
        else:
            logger.warning(f"Unknown platform '{platform_name}' - skipping publication")
    
    if publish_errors and len(publish_errors) == len(platform_allocations):
        raise HTTPException(
            status_code=500,
            detail=f"Failed to publish campaign to all platforms: {'; '.join(publish_errors)}"
        )
    elif publish_errors:
        logger.warning(f"Campaign {campaign_id} started with partial platform failures: {'; '.join(publish_errors)}")
    
    db.commit()
    db.refresh(campaign)
    
    return campaign


def pause_campaign(db: Session, campaign_id: int):
    """Pause an active campaign"""
    campaign = get_campaign(db, campaign_id)
    
    if campaign.status != models.CampaignStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Can only pause active campaigns")
    
    campaign.status = models.CampaignStatus.PAUSED
    db.commit()
    db.refresh(campaign)
    
    return campaign


def stop_campaign(db: Session, campaign_id: int):
    """Stop a campaign completely (mark as completed)"""
    campaign = get_campaign(db, campaign_id)
    
    if campaign.status == models.CampaignStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Campaign is already stopped")
    
    campaign.status = models.CampaignStatus.COMPLETED
    db.commit()
    db.refresh(campaign)
    
    return campaign


def duplicate_campaign(db: Session, campaign_id: int):
    """Duplicate a campaign with all its settings"""
    original = get_campaign(db, campaign_id)
    
    plan = db.query(models.Plan).filter(models.Plan.id == original.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Original plan not found")
    
    allocations = _ensure_json_dict(plan.platform_allocations_json) if plan.platform_allocations_json else {}
    
    duplicate_plan = models.Plan(
        client_id=plan.client_id,
        name=f"{plan.name} (Copy)",
        goal=plan.goal,
        total_budget_cents=plan.total_budget_cents,
        audience_id=plan.audience_id,
        platform_allocations_json=allocations,
        status=models.PlanStatus.DRAFT
    )
    db.add(duplicate_plan)
    db.commit()
    db.refresh(duplicate_plan)
    
    duplicate_campaign = models.Campaign(
        plan_id=duplicate_plan.id,
        client_id=original.client_id,
        name=duplicate_plan.name,
        goal=duplicate_plan.goal,
        total_budget_cents=duplicate_plan.total_budget_cents,
        audience_id=duplicate_plan.audience_id,
        status=models.CampaignStatus.DRAFT,
        platform_campaign_ids=None
    )
    db.add(duplicate_campaign)
    db.commit()
    db.refresh(duplicate_campaign)
    
    return duplicate_campaign


def update_campaign_platforms(db: Session, campaign_id: int, platform_allocations: Dict[str, int]):
    """Update platform allocations for DRAFT campaigns only"""
    campaign = get_campaign(db, campaign_id)
    
    if campaign.status != models.CampaignStatus.DRAFT:
        raise HTTPException(
            status_code=400, 
            detail="Can only modify platform allocations for DRAFT campaigns"
        )
    
    total_allocated = sum(platform_allocations.values())
    if total_allocated != campaign.total_budget_cents:
        raise HTTPException(
            status_code=400,
            detail=f"Platform allocations (${total_allocated/100:.2f}) must equal total budget (${campaign.total_budget_cents/100:.2f})"
        )
    
    for platform, amount in platform_allocations.items():
        if amount <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Platform allocation for {platform} must be greater than 0"
            )
    
    campaign.platform_allocations = platform_allocations
    flag_modified(campaign, "platform_allocations")
    db.commit()
    db.refresh(campaign)
    return campaign
