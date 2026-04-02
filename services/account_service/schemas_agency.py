"""
Agency System Data Schemas.

This module defines Pydantic models for Agency and Client data structures.
It includes compatibility logic to support legacy field names (client_name, markup_multiplier)
used by older tests and internal calls.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from packages.db.models import AgencyRole, ClientRole

_DEFAULT_MARKUP = Decimal("1.0000")

class AgencyBase(BaseModel):
    name: str
    stripe_customer_id: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None


class AgencyCreate(AgencyBase):
    """
    Schema for creating a new agency.
    Requires `owner_user_id` to establish the initial Agency Admin membership.
    """
    owner_user_id: int

class AgencyUpdate(BaseModel):
    """Schema for updating agency settings"""
    name: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None


class AgencyOut(AgencyBase):
    """
    Public Agency representation.
    Note: `owner_user_id` is intentionally detached here for general use,
    though `create_agency` may shim it onto the response for legacy tests.
    """
    id: int
    current_plan: Optional[str] = None
    credits: Optional[Decimal] = Decimal("0.00")
    billing_status: Optional[str] = "active"
    
    class Config:
        from_attributes = True

class ClientManagerAccountSelector(BaseModel):
    id: Optional[int] = None
    platform: Optional[str] = None
    account_id: Optional[str] = None

class MemberOut(BaseModel):
    """Team member representation"""
    id: int
    user_id: int
    email: str
    full_name: Optional[str] = None
    role: str
    created_at: Optional[str] = None
    
    class Config:
        from_attributes = True

class UpdateMemberRole(BaseModel):
    """Schema for updating a member's role"""
    role: str

class InviteMember(BaseModel):
    """Schema for inviting a new member"""
    email: str
    role: str = "agency_viewer"

class ClientBase(BaseModel):
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    markup_percent: Decimal = Decimal("1.0000")
    is_active: bool = True
    account_mode: Optional[str] = "kaivo_managed"  # 'kaivo_managed' | 'reporting_only'

class ClientCreate(ClientBase):
    """
    Schema for creating a new Client.
    
    Supports legacy aliases for compatibility:
    - `client_name` -> maps to `name`
    - `markup_multiplier` -> maps to `markup_percent`
    """
    pass

    def __init__(self, **data):
        # Support legacy argument names manually if passed.
        # We copy the dict to avoid mutating the input source directly.
        payload = dict(data)
        
        if 'client_name' in payload and 'name' not in payload:
            payload['name'] = payload.pop('client_name')
            
        if 'markup_multiplier' in payload and 'markup_percent' not in payload:
            payload['markup_percent'] = payload.pop('markup_multiplier')
            
        super().__init__(**payload)

class ClientUpdate(BaseModel):
    """Schema for updating client details"""
    name: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    markup_percent: Optional[Decimal] = None
    is_active: Optional[bool] = None
    account_mode: Optional[str] = None
    avatar_color: Optional[str] = None

class ClientAccountAssignment(BaseModel):
    accounts: List[ClientManagerAccountSelector]

class ClientOut(ClientBase):
    """
    Public Client representation.
    """
    id: int
    agency_id: int
    avatar_color: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("markup_percent", mode="before")
    @classmethod
    def _coerce_markup_percent(cls, v):
        """DB allows NULL; API contract expects a decimal multiplier (default 1.0)."""
        if v is None:
            return _DEFAULT_MARKUP
        return v

class PermissionUpdate(BaseModel):
    """
    Schema for updating client permissions.
    """
    is_active: bool
    role: ClientRole

class MarkupUpdate(BaseModel):
    """
    Schema for updating client markup settings.
    """
    markup_percent: Decimal


# --- Client hierarchy (dashboard tree) ---

class HierarchyAlerts(BaseModel):
    count: int = 0
    severity: str = "ok"


class HierarchyMetrics(BaseModel):
    spend: float = 0
    impressions: int = 0
    clicks: int = 0
    ctr: float = 0
    cpc: float = 0
    conversions: int = 0
    cost_per_conversion: float = 0
    budget: float = 0
    pacing: float = 0
    score: float = 50
    alerts: HierarchyAlerts = Field(default_factory=HierarchyAlerts)


class HierarchyAdSet(BaseModel):
    id: str
    name: str
    metrics: HierarchyMetrics


class HierarchyCampaign(BaseModel):
    id: int
    name: str
    status: str
    metrics: HierarchyMetrics
    ad_sets: List[HierarchyAdSet] = Field(default_factory=list)


class HierarchyLinkedAccount(BaseModel):
    """Linked PlatformAccount row (display: external account id)."""

    id: int
    external_id: str


class HierarchyPlatform(BaseModel):
    key: str
    display_name: str
    account_ids: List[str] = Field(default_factory=list)
    linked_accounts: List[HierarchyLinkedAccount] = Field(default_factory=list)
    metrics: HierarchyMetrics
    campaigns: List[HierarchyCampaign] = Field(default_factory=list)


class HierarchyClient(BaseModel):
    id: int
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    is_active: bool = True
    account_mode: Optional[str] = "kaivo_managed"
    platform_count: int = 0
    metrics: HierarchyMetrics
    platforms: List[HierarchyPlatform] = Field(default_factory=list)


class HierarchyCounts(BaseModel):
    clients: int = 0
    platforms: int = 0
    campaigns: int = 0
    ad_sets: int = 0


class ClientHierarchyResponse(BaseModel):
    period: str
    clients: List[HierarchyClient]
    totals: HierarchyMetrics
    counts: HierarchyCounts


# --- Client Manager (Reporting replacement) ---

class ClientManagerAccount(BaseModel):
    id: int
    platform: str
    account_id: str
    display_name: str
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    group_client_id: Optional[int] = None
    group_client_name: Optional[str] = None
    is_assigned: bool = False


class ClientManagerClientSummary(BaseModel):
    id: int
    name: str
    industry: Optional[str] = None
    account_count: int = 0
    platforms: List[str] = Field(default_factory=list)
    spend_mtd: float = 0.0
    avatar_color: Optional[str] = None


class ClientPortalSettingsOut(BaseModel):
    portal_enabled: bool = True
    contact_email: Optional[str] = None
    owner_user_id: Optional[int] = None
    portal_link_token: Optional[str] = None
    portal_link_expires_at: Optional[datetime] = None
    use_per_platform_markup: bool = False
    global_markup_percent: Optional[Decimal] = None
    meta_markup_percent: Optional[Decimal] = None
    tiktok_markup_percent: Optional[Decimal] = None
    google_markup_percent: Optional[Decimal] = None
    show_kaivo_branding: Optional[bool] = None
    show_performance_score: Optional[bool] = None
    show_leaderboard: Optional[bool] = None
    show_trend_comparisons: Optional[bool] = None


class ClientPortalSettingsUpdate(BaseModel):
    portal_enabled: Optional[bool] = None
    contact_email: Optional[str] = None
    owner_user_id: Optional[int] = None
    use_per_platform_markup: Optional[bool] = None
    global_markup_percent: Optional[Decimal] = None
    meta_markup_percent: Optional[Decimal] = None
    tiktok_markup_percent: Optional[Decimal] = None
    google_markup_percent: Optional[Decimal] = None
    show_kaivo_branding: Optional[bool] = None
    show_performance_score: Optional[bool] = None
    show_leaderboard: Optional[bool] = None
    show_trend_comparisons: Optional[bool] = None


class ClientManagerClientDetail(BaseModel):
    client: ClientManagerClientSummary
    accounts: List[ClientManagerAccount] = Field(default_factory=list)
    portal_settings: Optional[ClientPortalSettingsOut] = None


class ClientManagerSummary(BaseModel):
    unassigned_accounts: List[ClientManagerAccount] = Field(default_factory=list)
    clients: List[ClientManagerClientDetail] = Field(default_factory=list)



class ClientManagerAssignRequest(BaseModel):
    client_id: int
    accounts: List[ClientManagerAccountSelector]


class ClientManagerDetachRequest(BaseModel):
    platform_account_id: int


# --- AI Insights ---

class InsightImpactMetric(BaseModel):
    label: str
    value: str
    color: str # 'green', 'amber', 'red', 'teal', 'default'

class AIInsightOut(BaseModel):
    insight_id: str
    client_id: int
    client_name: str
    client_short_name: str
    platform: str
    platform_label: str
    severity: str # 'critical', 'warning', 'opportunity', 'anomaly'
    categories: List[str]
    title: str
    description: str
    impact_metrics: List[InsightImpactMetric]
    apply_label: Optional[str] = None
    review_label: Optional[str] = None
    review_url: Optional[str] = None
    icon: str
    accent_color: str
    icon_bg: str
    status: str
    created_at: datetime
    priority_score: float

    model_config = ConfigDict(from_attributes=True)

class AIInsightSummary(BaseModel):
    total_pending: int
    critical_count: int
    opportunity_count: int
    recoverable_spend_cents: int
    clients_affected_count: int

class AIInsightApplyRecommendedResponse(BaseModel):
    applied_count: int
    failed_count: int
    insight_ids: List[str]

class AIInsightActionResponse(BaseModel):
    success: bool
    action_taken: Optional[str] = None
    updated_at: Optional[datetime] = None
