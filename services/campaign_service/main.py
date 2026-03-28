from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Dict, Any, Optional, List
from decimal import Decimal
from datetime import datetime
from . import models, crud
from packages.db.database import engine, get_db
from services.shared.observability import observability_middleware, metrics_endpoint

# models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kaivo Campaign Service")
app.middleware("http")(observability_middleware)
app.add_route("/metrics", metrics_endpoint)

class PlanOut(BaseModel):
    id: int
    name: str
    status: str
    total_budget_cents: int

    model_config = ConfigDict(from_attributes=True)

class CampaignOut(BaseModel):
    id: int
    plan_id: Optional[int] = None
    status: str
    client_id: int
    name: str
    total_budget_cents: int
    audience_id: Optional[int] = None
    goal: Optional[str] = None
    platform_allocations: Dict[str, Any] = {}
    platform_campaign_ids: Dict[str, Any] = {}
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

def _serialize_campaign(campaign) -> CampaignOut:
    """Helper to serialize Campaign model to CampaignOut, handling Enum status"""
    return CampaignOut(
        id=campaign.id,
        plan_id=campaign.plan_id,
        status=campaign.status.value if hasattr(campaign.status, 'value') else str(campaign.status),
        client_id=campaign.client_id or 0,
        name=campaign.name,
        total_budget_cents=campaign.total_budget_cents,
        audience_id=campaign.audience_id,
        goal=campaign.goal,
        platform_allocations=campaign.platform_allocations or {},
        platform_campaign_ids=campaign.platform_campaign_ids or {},
        media_url=campaign.media_url,
        media_type=campaign.media_type,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )

@app.post("/plans/", response_model=PlanOut)
def create_plan(plan: crud.PlanCreate, db: Session = Depends(get_db)):
    return crud.create_plan(db, plan)

@app.patch("/plans/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, plan: crud.PlanUpdate, db: Session = Depends(get_db)):
    return crud.update_plan(db, plan_id, plan)

@app.post("/plans/{plan_id}/submit", response_model=CampaignOut)
def submit_plan(plan_id: int, db: Session = Depends(get_db)):
    try:
        campaign = crud.convert_to_campaign(db, plan_id)
        return _serialize_campaign(campaign)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/plans/{plan_id}/convert", response_model=CampaignOut)
def convert_plan_to_campaign(plan_id: int, db: Session = Depends(get_db)):
    """Convert a plan to a campaign (idempotent)"""
    try:
        campaign = crud.convert_to_campaign(db, plan_id)
        return _serialize_campaign(campaign)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Campaign Control Endpoints
@app.get("/campaigns", response_model=List[CampaignOut])
def list_campaigns(
    client_id: Optional[int] = None,
    agency_id: Optional[int] = None, 
    db: Session = Depends(get_db)
):
    """List campaigns with optional filtering by client or agency"""
    campaigns = crud.list_campaigns(db, client_id=client_id, agency_id=agency_id)
    return [_serialize_campaign(campaign) for campaign in campaigns]

@app.get("/campaigns/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Get a single campaign"""
    campaign = crud.get_campaign(db, campaign_id)
    return _serialize_campaign(campaign)

@app.post("/campaigns/{campaign_id}/start", response_model=CampaignOut)
def start_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Start a paused or pending campaign"""
    campaign = crud.start_campaign(db, campaign_id)
    return _serialize_campaign(campaign)

@app.post("/campaigns/{campaign_id}/pause", response_model=CampaignOut)
def pause_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Pause an active campaign"""
    campaign = crud.pause_campaign(db, campaign_id)
    return _serialize_campaign(campaign)

@app.post("/campaigns/{campaign_id}/stop", response_model=CampaignOut)
def stop_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Stop a campaign (mark as completed)"""
    campaign = crud.stop_campaign(db, campaign_id)
    return _serialize_campaign(campaign)

@app.post("/campaigns/{campaign_id}/duplicate", response_model=CampaignOut)
def duplicate_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Duplicate a campaign with all settings"""
    campaign = crud.duplicate_campaign(db, campaign_id)
    return _serialize_campaign(campaign)

class PlatformAllocationsUpdate(BaseModel):
    platform_allocations: Dict[str, int]

@app.patch("/campaigns/{campaign_id}/platforms", response_model=CampaignOut)
def update_campaign_platforms(
    campaign_id: int,
    platforms: PlatformAllocationsUpdate,
    db: Session = Depends(get_db)
):
    """Update platform allocations for DRAFT campaigns only"""
    campaign = crud.update_campaign_platforms(db, campaign_id, platforms.platform_allocations)
    return _serialize_campaign(campaign)

class CampaignUpdate(BaseModel):
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    name: Optional[str] = None

@app.patch("/campaigns/{campaign_id}", response_model=CampaignOut)
def update_campaign(
    campaign_id: int,
    update_data: CampaignUpdate,
    db: Session = Depends(get_db)
):
    """Update campaign fields like media_url, media_type, name"""
    campaign = crud.get_campaign(db, campaign_id)
    
    # Update fields - allow None to explicitly set null values
    if hasattr(update_data, 'media_url'):
        campaign.media_url = update_data.media_url
    if hasattr(update_data, 'media_type'):
        campaign.media_type = update_data.media_type
    if update_data.name is not None:
        campaign.name = update_data.name
    
    db.commit()
    db.refresh(campaign)
    return _serialize_campaign(campaign)
