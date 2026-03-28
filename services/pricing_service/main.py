from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from packages.db.database import get_db
from packages.db.models import Agency
from services.pricing_service.engine import get_plans

router = APIRouter()

@router.get("/plans", response_model=List[dict])
def list_plans():
    """
    Returns the available pricing plans.
    """
    return get_plans()

@router.get("/plan-for-agency", response_model=dict)
def get_agency_plan(agency_id: int, db: Session = Depends(get_db)):
    """
    Returns the current plan and capabilities for a specific agency.
    """
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    # Find the plan details
    plans = get_plans()
    current_plan_details = next((p for p in plans if p["id"] == agency.current_plan.value), None)
    
    if not current_plan_details:
        # Fallback to Free if something is wrong
        current_plan_details = plans[0]

    return {
        "plan": agency.current_plan,
        "details": current_plan_details,
        "capabilities": {
            "can_upload_audiences": agency.current_plan.value not in ["free"],
            "can_use_budget_optimizer": agency.current_plan.value not in ["free", "starter"],
            "can_use_multilingual": agency.current_plan.value in ["scale", "enterprise"]
        }
    }
