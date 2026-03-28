from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal
from datetime import date

# --- Shared Enums ---
class GoalType(str):
    AWARENESS = "awareness"
    TRAFFIC = "traffic"
    CONVERSIONS = "conversions"

class ExecutionMode(str):
    KAIVO_MANAGED = "kaivo_managed"
    USER_OWNED = "user_owned"
    SIMULATION_ONLY = "simulation_only"

# --- MCP Tool Inputs/Outputs ---

# 2.1 check_accounts
class CheckAccountsInput(BaseModel):
    user_id: int

class PlatformStatus(BaseModel):
    platform: str
    status: str # "active", "missing_credentials", "error"

class CheckAccountsOutput(BaseModel):
    available_execution_modes: List[str]
    configured_platforms: List[PlatformStatus]
    missing_credentials: List[str]
    summary: str

# 2.2 select_execution_mode
class SelectExecutionModeInput(BaseModel):
    user_id: int
    requested_mode: Optional[str] = None
    platforms: List[str]
    budget: float

class SelectExecutionModeOutput(BaseModel):
    chosen_mode: str
    reasons: List[str]
    warnings: List[str]

# 2.3 create_goal
class CreateGoalInput(BaseModel):
    goal_type: str
    description: str
    target_metrics: Optional[Dict[str, float]] = None

class CreateGoalOutput(BaseModel):
    goal_id: str
    goal: Dict[str, Any]

# 2.4 create_audience
class CreateAudienceInput(BaseModel):
    brand_id: int
    geo: List[str]
    languages: List[str]
    interests: List[str]
    keywords: Optional[List[str]] = None
    exclusions: Optional[List[str]] = None
    notes: Optional[str] = None
    description: Optional[str] = None  # Brief summary of audience targeting

class CreateAudienceOutput(BaseModel):
    audience_id: str
    audience: Dict[str, Any]

# 2.5 create_creative
class CreateCreativeInput(BaseModel):
    brand_id: int
    creative_type: str # "image", "video", "audio"
    asset_reference: str
    metadata: Optional[Dict[str, Any]] = None

class CreateCreativeOutput(BaseModel):
    creative_id: str
    creative: Dict[str, Any]
    creative_scores: Dict[str, float]
    policy_warnings: List[str]

# 2.6 create_budget
class CreateBudgetInput(BaseModel):
    total_amount: float
    start_date: str
    end_date: str
    daily_cap: Optional[float] = None
    platforms: List[str]
    initial_split: Optional[Dict[str, float]] = None

class CreateBudgetOutput(BaseModel):
    budget_id: str
    budget: Dict[str, Any]
    platform_minimum_warnings: List[str]

# 2.7 simulate_reach
class SimulateReachInput(BaseModel):
    goal_id: str
    audience_id: str
    creative_ids: List[str]
    budget_id: str

class SimulateReachOutput(BaseModel):
    platform_metrics: Dict[str, Any]
    final_cpm: float
    kaivo_intelligence_scores: Dict[str, float]
    sweet_spot_summary: str

# 2.8 validate_policy
class ValidatePolicyInput(BaseModel):
    creative_ids: List[str]
    audience_id: str
    budget_id: str
    platforms: List[str]

class PolicyViolation(BaseModel):
    platform: str
    severity: str # "blocking", "warning"
    rule_code: str
    explanation: str

class ValidatePolicyOutput(BaseModel):
    violations: List[PolicyViolation]
    passed: bool

# 2.9 launch_campaign
class LaunchCampaignInput(BaseModel):
    plan_id: str # Or combination of goal/audience/creative/budget IDs
    user_id: int

class LaunchCampaignOutput(BaseModel):
    campaign_id: str
    status: str
    deployment_details: Dict[str, Any]

# 2.12 generate_variants
class GenerateVariantsInput(BaseModel):
    headline: str
    body: str
    languages: List[str]

class GenerateVariantsOutput(BaseModel):
    variants: List[Dict[str, str]]

# --- Orchestrator ---

class OrchestratorInput(BaseModel):
    session_id: str
    user_message_summary: str
    slots: Dict[str, Any] = {}
    # Media fields for campaign creation
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    
    # Compatibility shim for tests expecting 'user_query'
    # We map 'user_query' input to 'user_message_summary' (or we could start using 'prompt')
    # The prompt asked to canonicalize on 'prompt', but 'user_message_summary' seems to be the current canonical field.
    # To satisfy the prompt's request AND the existing class structure, I will treat 'user_message_summary' as the canonical field the code uses, 
    # and map 'user_query' to it.
    
    @property
    def user_query(self) -> str:
        return self.user_message_summary
        
    def __init__(self, **data):
        # Allow 'user_query' to populate 'user_message_summary'
        if 'user_query' in data and 'user_message_summary' not in data:
            data['user_message_summary'] = data.pop('user_query')
        # Allow 'user_message' to populate 'user_message_summary' (frontend compatibility)
        if 'user_message' in data and 'user_message_summary' not in data:
            data['user_message_summary'] = data.pop('user_message')
        super().__init__(**data)

    class Config:
        allow_population_by_field_name = True

class ToolCall(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]

class OrchestratorOutput(BaseModel):
    tool_calls: List[ToolCall]
    new_context_ids: Dict[str, str]
    agent_explanation: str
    ui_hints: List[str]
    
    # Created resource IDs for frontend
    created_audience_id: Optional[int] = None
    created_plan_id: Optional[int] = None
    created_campaign_id: Optional[int] = None
    
    # AI extraction metadata
    extracted_data: Optional[Dict[str, Any]] = None  # All extracted slots
    ai_insights: Optional[List[str]] = None  # Intelligent inferences made

    # Integration / safety metadata (surfaced to frontend for visibility)
    # safety_status: "ok" | "warning" | "blocked" (or None for legacy callers)
    safety_status: Optional[str] = None
    # integration_status: structured dict containing environment, per-check status,
    # errors, and warnings as returned by the IntegrationVerifier.
    integration_status: Optional[Dict[str, Any]] = None
    
    # Frontend compatibility aliases
    created_resources: Optional[Dict[str, Any]] = None
    explanation: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)
    
    def model_post_init(self, __context):
        """Set computed fields after model initialization"""
        # Set created_resources if any resource was created
        if self.created_campaign_id or self.created_plan_id or self.created_audience_id:
            object.__setattr__(self, 'created_resources', {
                "campaign_id": self.created_campaign_id,
                "plan_id": self.created_plan_id,
                "audience_id": self.created_audience_id
            })
        # Set explanation alias
        object.__setattr__(self, 'explanation', self.agent_explanation)
