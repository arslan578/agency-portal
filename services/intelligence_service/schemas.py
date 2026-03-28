from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from enum import Enum
from decimal import Decimal

class GoalEnum(str, Enum):
    AWARENESS = "awareness"
    TRAFFIC = "traffic"
    CONVERSIONS = "conversions"
    MIXED = "mixed"

class PlatformCategoryEnum(str, Enum):
    STREAMING_TV = "streaming_tv"
    SOCIAL = "social"
    DISPLAY_SEARCH = "display_search"
    AUDIO_VIDEO = "audio_video"

class MetricsInput(BaseModel):
    """Metrics input with strict validation - rejects unknown fields."""

    class Config:
        extra = "forbid"  # Reject unknown fields
    
    impressions: int = 0
    reach: int = 0
    frequency: float = 0.0
    views: int = 0
    completions: int = 0
    clicks: int = 0
    conversions: int = 0
    spend: float = 0.0
    cpm: float = 0.0
    cpc: float = 0.0
    cpa: float = 0.0
    
class TimeSeriesPoint(BaseModel):
    """Time series point with strict validation."""

    class Config:
        extra = "forbid"  # Reject unknown fields
    
    date: str
    metrics: MetricsInput

class IntelligenceInput(BaseModel):
    """Intelligence input with strict validation - rejects unknown fields."""

    class Config:
        extra = "forbid"  # Reject unknown fields

    platform: str
    category: PlatformCategoryEnum
    goal: GoalEnum
    metrics: MetricsInput
    time_series: List[TimeSeriesPoint] = []
    context: Dict[str, Any] = {}

class ClusterScores(BaseModel):
    visibility: float
    engagement: float
    conversion_power: float
    efficiency: float
    quality_stability: float

class OptimizationSignal(BaseModel):
    direction: str # increase, hold, decrease
    priority: str # high, medium, low
    reason: str

class PlatformScore(BaseModel):
    platform: str
    umi_score: float  # Renamed from kaivo_score
    cluster_scores: ClusterScores
    signal: OptimizationSignal
    
    # Backward compatibility: maintain kaivo_score as a property
    @property
    def kaivo_score(self) -> float:
        """Deprecated: Use umi_score instead. Maintained for backward compatibility."""
        return self.umi_score

class SweetSpotSummary(BaseModel):
    top_platforms: List[str]
    losing_momentum: List[str]
    incremental_budget_recommendation: str
    narrative_smb: str
    narrative_agency: str


class RecommendationItem(BaseModel):
    """Actionable recommendation for a client based on their platform data."""
    id: str
    campaign_id: Optional[int] = None
    campaign_name: Optional[str] = None
    platform: Optional[str] = None
    category: str  # budget, targeting, creative, platform_mix, pacing
    priority: str  # critical, high, medium, low
    action: str
    title: str
    description: str
    impact_estimate: Optional[str] = None
    data_points: Dict[str, Any] = {}


class CampaignRecommendationInput(BaseModel):
    """Input for generating recommendations for one campaign."""
    campaign_id: int
    campaign_name: str
    goal: str = "conversions"
    total_budget_cents: int = 0
    platform_allocations: Dict[str, float] = {}
    platform_inputs: List[IntelligenceInput] = []


class RecommendationsRequest(BaseModel):
    campaigns: List[CampaignRecommendationInput] = []
