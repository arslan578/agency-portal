
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from packages.db.database import get_db
from packages.db.models import AIInsight, Client, Agency
from .. import schemas_agency
from services.auth_service.dependencies import require_any_member, require_member_or_above

router = APIRouter(prefix="/insights", tags=["AI Insights"])

def ensure_agency_scope(ctx: dict, agency_id: int):
    # This is a placeholder for actual agency scoping, similar to existing routers
    if ctx.get("agency_id") and ctx["agency_id"] != agency_id:
        raise HTTPException(status_code=403, detail="Forbidden: Agency mismatch")

@router.get("", response_model=List[schemas_agency.AIInsightOut])
def list_insights(
    status: str = "pending",
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """
    Get all insights for the agency.
    Optionally filter by client_id.
    """
    # Assuming the current agency is deduced from the user context
    agency_id = ctx.get("agency_id")
    if not agency_id:
        raise HTTPException(status_code=400, detail="Agency ID context missing")
        
    query = db.query(AIInsight).filter(AIInsight.agency_id == agency_id)
    
    if status:
        query = query.filter(AIInsight.status == status)
    
    if client_id:
        query = query.filter(AIInsight.client_id == client_id)
        
    insights = query.order_by(AIInsight.priority_score.desc()).all()
    
    # Map to schema with client names
    out = []
    for ins in insights:
        out.append(schemas_agency.AIInsightOut(
            insight_id=ins.id,
            client_id=ins.client_id,
            client_name=ins.client.name,
            client_short_name=ins.client.name.split()[0], # Simple short name
            platform=ins.platform,
            platform_label=ins.platform_label,
            severity=ins.severity,
            categories=ins.categories or [],
            title=ins.title,
            description=ins.description,
            impact_metrics=ins.impact_metrics or [],
            apply_label=ins.apply_label,
            review_label=ins.review_label,
            review_url=ins.review_url,
            icon=ins.icon or "✨",
            accent_color=ins.accent_color or "teal",
            icon_bg=ins.icon_bg or "teal_light",
            status=ins.status,
            created_at=ins.created_at,
            priority_score=ins.priority_score
        ))
    return out

@router.get("/summary", response_model=schemas_agency.AIInsightSummary)
def get_insights_summary(
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """
    Summary stats for the AI Insights page impact banner.
    """
    agency_id = ctx.get("agency_id")
    if not agency_id:
        raise HTTPException(status_code=400, detail="Agency ID context missing")
        
    pending = db.query(AIInsight).filter(AIInsight.agency_id == agency_id, AIInsight.status == "pending").all()
    
    total_pending = len(pending)
    critical_count = len([i for i in pending if i.severity == "critical"])
    opportunity_count = len([i for i in pending if i.severity == "opportunity"])
    recoverable_spend_cents = sum([i.recoverable_spend_cents or 0 for i in pending if i.severity == "critical"])
    clients_affected_count = len(set([i.client_id for i in pending]))
    
    return schemas_agency.AIInsightSummary(
        total_pending=total_pending,
        critical_count=critical_count,
        opportunity_count=opportunity_count,
        recoverable_spend_cents=recoverable_spend_cents,
        clients_affected_count=clients_affected_count
    )

@router.post("/{insight_id}/apply", response_model=schemas_agency.AIInsightActionResponse)
def apply_insight(
    insight_id: str,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    """
    Apply a single insight.
    """
    agency_id = ctx.get("agency_id")
    insight = db.query(AIInsight).filter(AIInsight.id == insight_id, AIInsight.agency_id == agency_id).first()
    
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
        
    # Simulate execution on MCP/Platform
    insight.status = "applied"
    insight.updated_at = datetime.now(timezone.utc)
    
    # Generate action text if empty
    if not insight.action_taken:
        insight.action_taken = f"{insight.platform_label} action executed successfully."
        
    db.commit()
    
    return schemas_agency.AIInsightActionResponse(
        success=True,
        action_taken=insight.action_taken,
        updated_at=insight.updated_at
    )

@router.post("/{insight_id}/dismiss", response_model=schemas_agency.AIInsightActionResponse)
def dismiss_insight(
    insight_id: str,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    """
    Dismiss an insight.
    """
    agency_id = ctx.get("agency_id")
    insight = db.query(AIInsight).filter(AIInsight.id == insight_id, AIInsight.agency_id == agency_id).first()
    
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
        
    insight.status = "dismissed"
    insight.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return schemas_agency.AIInsightActionResponse(
        success=True
    )

@router.post("/apply_recommended", response_model=schemas_agency.AIInsightApplyRecommendedResponse)
def apply_recommended(
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    """
    Bulk apply all high-priority or critical insights.
    """
    agency_id = ctx.get("agency_id")
    
    insights = db.query(AIInsight).filter(
        AIInsight.agency_id == agency_id,
        AIInsight.status == "pending",
        ((AIInsight.severity == "critical") | (AIInsight.priority_score >= 0.8))
    ).all()
    
    applied_ids = []
    failed_count = 0
    now = datetime.now(timezone.utc)
    
    for ins in insights:
        try:
            # Simulate execution
            ins.status = "applied"
            ins.updated_at = now
            if not ins.action_taken:
                ins.action_taken = "Bulk action applied recommended optimization."
            applied_ids.append(ins.id)
        except Exception:
            failed_count += 1
            
    db.commit()
    
    return schemas_agency.AIInsightApplyRecommendedResponse(
        applied_count=len(applied_ids),
        failed_count=failed_count,
        insight_ids=applied_ids
    )

# --- Helper to seed data if empty ---
@router.post("/seed_mock_data", tags=["Admin"])
def seed_mock_data(db: Session = Depends(get_db), ctx: dict = Depends(require_member_or_above)):
    agency_id = ctx.get("agency_id")
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    if not clients:
        raise HTTPException(status_code=400, detail="No clients in this agency to seed insights for.")
        
    # Check if already seeded
    existing = db.query(AIInsight).filter(AIInsight.agency_id == agency_id).count()
    if existing > 0:
        return {"message": "Already seeded", "count": existing}
        
    # Create 5-10 mock insights
    mock_data = [
        {
            "id": "ins_" + str(uuid.uuid4())[:8],
            "agency_id": agency_id,
            "client_id": clients[0].id,
            "platform": "meta",
            "platform_label": "Meta",
            "severity": "critical",
            "categories": ["budget", "spend"],
            "title": "Wasted spend on high-frequency creative",
            "description": "Your 'Summer Vibes' creative has reached a frequency of 4.2x. CPM is starting to climb while ROAS has dropped 40% in the last 48h.",
            "impact_metrics": [
                {"label": "Frequency", "value": "4.2x", "color": "orange"},
                {"label": "ROAS Drop", "value": "-40%", "color": "red"},
                {"label": "Recovery P.M.", "value": "$840", "color": "green"},
                {"label": "Target ROAS", "value": "2.1x", "color": "teal"}
            ],
            "apply_label": "Scale budget by 20%",
            "review_label": "View Creative",
            "review_url": f"/clients/{clients[0].id}?tab=campaigns",
            "icon": "💸",
            "accent_color": "red",
            "icon_bg": "red_light",
            "priority_score": 0.92,
            "recoverable_spend_cents": 84000
        }
        # ... add more later or just a few for now
    ]
    
    # Add a few more variants
    if len(clients) > 1:
        mock_data.append({
            "id": "ins_" + str(uuid.uuid4())[:8],
            "agency_id": agency_id,
            "client_id": clients[1].id,
            "platform": "tiktok",
            "platform_label": "TikTok",
            "severity": "opportunity",
            "categories": ["creative", "audience"],
            "title": "Scaling opportunity: New audience segment",
            "description": "An 'Interest: Outdoors' audience is outperforming benchmarks with 0.8% CTR. Increasing budget could drive 15% more volume.",
            "impact_metrics": [
                {"label": "CTR", "value": "0.8%", "color": "green"},
                {"label": "CPA", "value": "$12.4", "color": "teal"},
                {"label": "Potential", "value": "+15%", "color": "green"},
                {"label": "Spend Room", "value": "$2k", "color": "default"}
            ],
            "apply_label": "Launch Segment",
            "review_label": "Review Audience",
            "review_url": f"/clients/{clients[1].id}?tab=audiences",
            "icon": "🚀",
            "accent_color": "teal",
            "icon_bg": "teal_light",
            "priority_score": 0.65,
            "recoverable_spend_cents": 0
        })
        
    for m in mock_data:
        ins = AIInsight(**m)
        db.add(ins)
        
    db.commit()
    return {"message": "Mock data seeded", "count": len(mock_data)}
