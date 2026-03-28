"""
Agency System Data Schemas.

This module defines Pydantic models for Agency and Client data structures.
It includes compatibility logic to support legacy field names (client_name, markup_multiplier)
used by older tests and internal calls.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from decimal import Decimal
from packages.db.models import AgencyRole, ClientRole

class AgencyBase(BaseModel):
    name: str
    stripe_customer_id: Optional[str] = None

class AgencyCreate(AgencyBase):
    """
    Schema for creating a new agency.
    Requires `owner_user_id` to establish the initial Agency Admin membership.
    """
    owner_user_id: int

class AgencyUpdate(BaseModel):
    """Schema for updating agency settings"""
    name: Optional[str] = None

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

class ClientOut(ClientBase):
    """
    Public Client representation.
    """
    id: int
    agency_id: int
    
    class Config:
        from_attributes = True

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


class HierarchyPlatform(BaseModel):
    key: str
    display_name: str
    account_ids: List[str] = Field(default_factory=list)
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
