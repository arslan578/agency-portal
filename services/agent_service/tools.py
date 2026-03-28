from typing import List, Dict, Any, Optional
from datetime import date
import uuid
import os
import httpx
from .schemas import (
    CheckAccountsInput, CheckAccountsOutput, PlatformStatus,
    SelectExecutionModeInput, SelectExecutionModeOutput, ExecutionMode,
    CreateGoalInput, CreateGoalOutput, GoalType,
    CreateAudienceInput, CreateAudienceOutput,
    CreateCreativeInput, CreateCreativeOutput,
    CreateBudgetInput, CreateBudgetOutput,
    SimulateReachInput, SimulateReachOutput,
    ValidatePolicyInput, ValidatePolicyOutput, PolicyViolation,
    LaunchCampaignInput, LaunchCampaignOutput,
    GenerateVariantsInput, GenerateVariantsOutput,
    # Optimization tools
)
from .knowledge import get_brand_profile

# --- 2.1 check_accounts ---
def check_accounts(inp: CheckAccountsInput) -> CheckAccountsOutput:
    # Stub logic
    return CheckAccountsOutput(
        available_execution_modes=[ExecutionMode.KAIVO_MANAGED, ExecutionMode.USER_OWNED],
        configured_platforms=[
            PlatformStatus(platform="roku", status="active"),
            PlatformStatus(platform="meta", status="active"),
            PlatformStatus(platform="tiktok", status="missing_credentials")
        ],
        missing_credentials=["tiktok"],
        summary="Roku and Meta are ready. TikTok needs credentials."
    )

# --- 2.2 select_execution_mode ---
def select_execution_mode(inp: SelectExecutionModeInput) -> SelectExecutionModeOutput:
    # Stub logic
    return SelectExecutionModeOutput(
        chosen_mode=ExecutionMode.KAIVO_MANAGED,
        reasons=["User requested managed mode", "Budget allows for managed tier"],
        warnings=[]
    )

# --- 2.3 create_goal ---
def create_goal(inp: CreateGoalInput) -> CreateGoalOutput:
    goal_id = str(uuid.uuid4())
    return CreateGoalOutput(
        goal_id=goal_id,
        goal={
            "id": goal_id,
            "type": inp.goal_type,
            "description": inp.description,
            "target_metrics": inp.target_metrics
        }
    )

# --- 2.4 create_audience ---
def create_audience(inp: CreateAudienceInput, client_id: int = 1) -> CreateAudienceOutput:
    """
    Create an audience in the database via direct CRUD call.
    Since all services run in the same process, we call CRUD directly to avoid HTTP deadlock.
    
    Args:
        inp: CreateAudienceInput with audience parameters
        client_id: Client ID (defaults to 1, should be resolved from user session)
    """
    from services.audience_service import crud as audience_crud, schemas as audience_schemas
    from packages.db.database import SessionLocal
    
    definition = {
        "geo": inp.geo,
        "languages": inp.languages,
        "interests": inp.interests or [],
        "keywords": inp.keywords or [],
        "exclusions": inp.exclusions or [],
    }
    
    audience_create = audience_schemas.AudienceCreate(
        client_id=client_id,
        name=inp.notes or f"Audience for client {client_id}",
        description=inp.description or "AI-generated audience",
        definition=definition
    )
    
    db = SessionLocal()
    try:
        db_audience = audience_crud.create_audience(db, audience_create)
        return CreateAudienceOutput(
            audience_id=str(db_audience.id),
            audience={
                "id": db_audience.id,
                "client_id": client_id,
                "geo": inp.geo,
                "languages": inp.languages,
                "interests": inp.interests
            }
        )
    except Exception as e:
        raise Exception(f"Failed to create audience: {str(e)}")
    finally:
        db.close()

# --- 2.5 create_creative ---
def create_creative(inp: CreateCreativeInput) -> CreateCreativeOutput:
    creative_id = str(uuid.uuid4())
    # Stub intelligence scoring
    scores = {"quality": 0.85, "brand_safety": 0.99}
    warnings = []
    
    if inp.creative_type == "image":
        # Simulate policy check
        if "text_heavy" in inp.asset_reference:
            warnings.append("Text covers >20% of image (Meta warning)")

    return CreateCreativeOutput(
        creative_id=creative_id,
        creative={
            "id": creative_id,
            "type": inp.creative_type,
            "asset": inp.asset_reference
        },
        creative_scores=scores,
        policy_warnings=warnings
    )

# --- 2.6 create_budget ---
def create_budget(inp: CreateBudgetInput) -> CreateBudgetOutput:
    budget_id = str(uuid.uuid4())
    warnings = []
    
    # Platform minimums check (Stub)
    for platform in inp.platforms:
        if platform == "roku" and inp.total_amount < 750:
            warnings.append("Roku requires minimum $750 budget.")
            
    return CreateBudgetOutput(
        budget_id=budget_id,
        budget={
            "id": budget_id,
            "total": inp.total_amount,
            "start": inp.start_date,
            "end": inp.end_date,
            "platforms": inp.platforms
        },
        platform_minimum_warnings=warnings
    )

# --- 2.6.1 create_plan ---
def create_plan(
    client_id: int,
    name: str,
    goal: str,
    total_budget_cents: int,
    audience_id: int,
    platform_allocations_json: Dict[str, Any],
    media_url: Optional[str] = None,
    media_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a plan in the database via direct CRUD call.
    Since all services run in the same process, we call CRUD directly to avoid HTTP deadlock.
    Returns plan dict with 'id' (integer).
    """
    from services.campaign_service import crud as campaign_crud
    from packages.db.database import SessionLocal
    
    plan_create = campaign_crud.PlanCreate(
        client_id=client_id,
        name=name,
        goal=goal,
        total_budget_cents=total_budget_cents,
        audience_id=audience_id,
        platform_allocations_json=platform_allocations_json,
        media_url=media_url,
        media_type=media_type
    )
    
    db = SessionLocal()
    try:
        db_plan = campaign_crud.create_plan(db, plan_create)
        return {
            "id": db_plan.id,
            "client_id": db_plan.client_id,
            "name": db_plan.name,
            "goal": db_plan.goal,
            "total_budget_cents": db_plan.total_budget_cents,
            "audience_id": db_plan.audience_id,
            "platform_allocations_json": db_plan.platform_allocations_json,
            "media_url": db_plan.media_url,
            "media_type": db_plan.media_type
        }
    except Exception as e:
        raise Exception(f"Failed to create plan: {str(e)}")
    finally:
        db.close()

# --- 2.6.2 convert_plan_to_campaign ---
def convert_plan_to_campaign(plan_id: int) -> Dict[str, Any]:
    """
    Convert a plan to a campaign via direct CRUD call.
    Since all services run in the same process, we call CRUD directly to avoid HTTP deadlock.
    Returns campaign dict with 'id' (integer).
    """
    from services.campaign_service import crud as campaign_crud
    from packages.db.database import SessionLocal
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"Converting plan {plan_id} to campaign")
    
    db = SessionLocal()
    try:
        db_campaign = campaign_crud.convert_to_campaign(db, plan_id)
        
        # Convert Enum status to string
        status_str = db_campaign.status.value if hasattr(db_campaign.status, 'value') else str(db_campaign.status)
        
        result = {
            "id": db_campaign.id,
            "client_id": db_campaign.client_id,
            "plan_id": db_campaign.plan_id,
            "name": db_campaign.name,
            "status": status_str,
            "total_budget_cents": db_campaign.total_budget_cents,
            "audience_id": db_campaign.audience_id
        }
        
        logger.info(f"Successfully converted plan {plan_id} to campaign {db_campaign.id} with status {status_str}")
        return result
    except Exception as e:
        logger.error(f"Failed to convert plan {plan_id} to campaign: {str(e)}", exc_info=True)
        raise Exception(f"Failed to convert plan to campaign: {str(e)}")
    finally:
        db.close()

# --- 2.7 simulate_reach ---
def simulate_reach(inp: SimulateReachInput) -> SimulateReachOutput:
    # Stub simulation
    return SimulateReachOutput(
        platform_metrics={
            "roku": {"impressions": 50000, "reach": 45000},
            "meta": {"impressions": 100000, "reach": 80000}
        },
        final_cpm=25.50,
        kaivo_intelligence_scores={"overall": 82.5},
        sweet_spot_summary="Roku is your sweet spot for high-quality views."
    )

# --- 2.8 validate_policy ---
def validate_policy(inp: ValidatePolicyInput) -> ValidatePolicyOutput:
    # Stub validation
    return ValidatePolicyOutput(
        violations=[],
        passed=True
    )

# --- 2.13 run_os_intent ---
def run_os_intent(intent: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes an OS intent via the API Gateway.
    Gated by FF_AGENT_CAN_CALL_OS_RUNTIME.
    """
    import os
    import httpx
    import uuid
    from datetime import datetime

    # Feature Flag Check
    if os.getenv("FF_AGENT_CAN_CALL_OS_RUNTIME", "false").lower() != "true":
        return {"code": "OS_RUNTIME_DISABLED"}

    # Try API_GATEWAY_URL first, then fallback to internal service name or external URL
    gateway_url = os.getenv("API_GATEWAY_URL")
    if not gateway_url:
        # In K8s, use internal service name; otherwise derive from NEXT_PUBLIC_API_URL or default
        if os.getenv("KUBERNETES_SERVICE_HOST"):  # Running in K8s
            gateway_url = "http://api-gateway"  # Internal service name
        else:
            # Try to derive from NEXT_PUBLIC_API_URL if available (for external access)
            public_api_url = os.getenv("NEXT_PUBLIC_API_URL", "")
            if public_api_url:
                gateway_url = public_api_url.replace("/api", "").rstrip("/")
            else:
                gateway_url = "http://localhost:8000"  # Local dev default
    # In real world, agent needs a token. 
    # For now, using E2E token or internal service token if available.
    token = os.getenv("E2E_BEARER_TOKEN", "test-token-placeholder") 
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    body = {
        "execution_id": str(uuid.uuid4()),
        "intent": intent,
        "payload": payload,
        "requested_at": datetime.utcnow().isoformat() + "Z"
    }

    try:
        # Use sync client for tool strictness (agent tools are sync here)
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(f"{gateway_url}/os/run", json=body, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("result", {})
            elif resp.status_code == 403:
                return {"code": "OS_RUNTIME_DISABLED", "details": resp.json()}
            else:
                return {"code": "OS_ERROR", "status": resp.status_code, "details": resp.text}
    except Exception as e:
        return {"code": "OS_UNREACHABLE", "error": str(e)}

# --- 2.9 launch_campaign ---
def launch_campaign(inp: LaunchCampaignInput) -> LaunchCampaignOutput:
    # Consumption Point: Safety Layer Check
    # Only block IF feature is enabled and check fails
    safety_result = run_os_intent("SAFETY_LAYER_EVALUATION_V1", {"campaign_input": inp.dict()})
    
    if safety_result.get("code") != "OS_RUNTIME_DISABLED":
         if "passed" in safety_result and not safety_result["passed"]:
             # BLOCK LAUNCH
             violations = safety_result.get("violations", [])
             return LaunchCampaignOutput(
                 campaign_id="BLOCKED",
                 status="blocked_by_safety_layer",
                 deployment_details={
                     "reason": "Safety Layer Validation Failed",
                     "violations": violations
                 }
             )

    campaign_id = str(uuid.uuid4())
    return LaunchCampaignOutput(
        campaign_id=campaign_id,
        status="launching",
        deployment_details={"job_id": "job_123"}
    )

# --- 2.14 fetch_results ---
# (Using generic dict for now as schema wasn't strictly defined in previous step for this one)
def fetch_results(campaign_id: str) -> Dict[str, Any]:
    return {
        "campaign_id": campaign_id,
        "spend": 1500.00,
        "impressions": 60000,
        "clicks": 1200
    }

# --- 2.15 rebalance_budget ---
def rebalance_budget(campaign_id: str) -> Dict[str, Any]:
    return {
        "recommendation": "Shift 15% from Meta to Roku",
        "signal": "Roku CPA is 40% lower"
    }

# --- 2.16 generate_variants ---
def generate_variants(inp: GenerateVariantsInput) -> GenerateVariantsOutput:
    # Stub implementation
    variants = []
    for lang in inp.languages:
        variants.append({
            "language": lang,
            "headline": f"[{lang.upper()}] {inp.headline}",
            "body": f"[{lang.upper()}] {inp.body}"
        })
        
    return GenerateVariantsOutput(variants=variants)

# --- Tool Registry ---
TOOLS = {
    "check_accounts": check_accounts,
    "select_execution_mode": select_execution_mode,
    "create_goal": create_goal,
    "create_audience": create_audience,
    "create_creative": create_creative,
    "create_budget": create_budget,
    "create_plan": create_plan,
    "convert_plan_to_campaign": convert_plan_to_campaign,
    "simulate_reach": simulate_reach,
    "validate_policy": validate_policy,
    "launch_campaign": launch_campaign,
    "fetch_results": fetch_results,
    "rebalance_budget": rebalance_budget,
    "generate_variants": generate_variants,
    "run_os_intent": run_os_intent
}
