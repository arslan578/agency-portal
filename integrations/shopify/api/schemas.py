from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional, Literal, Dict
from enum import Enum

class GoalPreset(str, Enum):
    SALES = "SALES"
    TRAFFIC = "TRAFFIC"
    AWARENESS = "AWARENESS"

class ChannelsPreset(str, Enum):
    DEFAULT_MIX = "DEFAULT_MIX"

class ConnectStatus(str, Enum):
    CONNECTED = "CONNECTED"

class PromoteStatus(str, Enum):
    DRAFT_CREATED = "DRAFT_CREATED"
    SUBMITTED = "SUBMITTED"

class CampaignStatus(str, Enum):
    DRAFT_CREATED = "DRAFT_CREATED"
    SUBMITTED = "SUBMITTED"
    ERROR = "ERROR"

class DisconnectStatus(str, Enum):
    DISCONNECTED = "DISCONNECTED"

# --- Input Contracts ---

class ConnectInputV1(BaseModel):
    contract_version: Literal["input_contract_v1"]
    shop_domain: str
    shopify_app_installation_id: str
    requested_at: str
    forbidden_fields: List[str] = Field(default_factory=list)

    class Config:
        extra = "forbid"

class ProductVariant(BaseModel):
    variant_id: str
    price: float
    sku: Optional[str] = None
    inventory_quantity: Optional[float] = None # Using float to be safe with numbers
    
    class Config:
        extra = "forbid"

class NormalizedProduct(BaseModel):
    shopify_product_id: str
    title: str
    description_html: Optional[str] = None
    primary_image_url: str
    image_urls: List[str]
    product_url: str
    variants: List[ProductVariant]

    class Config:
        extra = "forbid"

class PromotePresets(BaseModel):
    goal: GoalPreset
    daily_budget_usd: float
    channels: ChannelsPreset
    
    class Config:
        extra = "forbid"

class PromoteInputV1(BaseModel):
    contract_version: Literal["input_contract_v1"]
    correlation_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    shop_domain: str
    product: NormalizedProduct
    presets: PromotePresets
    requested_at: str
    forbidden_fields: List[str] = Field(default_factory=list)

    class Config:
        extra = "forbid"

class DisconnectInputV1(BaseModel):
    contract_version: Literal["input_contract_v1"]
    shop_domain: str
    requested_at: str
    forbidden_fields: List[str] = Field(default_factory=list)

    class Config:
        extra = "forbid"

# --- Output Contracts ---

class ConnectOutputV1(BaseModel):
    contract_version: Literal["output_contract_v1"] = "output_contract_v1"
    workspace_id: str
    shop_domain: str
    status: ConnectStatus
    correlation_id: str
    forbidden_fields: List[str] = Field(default_factory=list)

class PromoteOutputV1(BaseModel):
    contract_version: Literal["output_contract_v1"] = "output_contract_v1"
    kaivo_campaign_id: str
    status: PromoteStatus
    correlation_id: str
    created_at: str
    forbidden_fields: List[str] = Field(default_factory=list)

class CampaignItem(BaseModel):
    kaivo_campaign_id: str
    shopify_product_id: str
    status: CampaignStatus
    created_at: str

class CampaignsOutputV1(BaseModel):
    contract_version: Literal["output_contract_v1"] = "output_contract_v1"
    shop_domain: str
    campaigns: List[CampaignItem]
    correlation_id: str
    forbidden_fields: List[str] = Field(default_factory=list)

class DisconnectOutputV1(BaseModel):
    contract_version: Literal["output_contract_v1"] = "output_contract_v1"
    shop_domain: str
    status: DisconnectStatus
    correlation_id: str
    forbidden_fields: List[str] = Field(default_factory=list)

class ErrorOutputV1(BaseModel):
    contract_version: Literal["output_contract_v1"] = "output_contract_v1"
    error_code: str
    error_message: str
    retryable: bool
    correlation_id: str
    forbidden_fields: List[str] = Field(default_factory=list)
