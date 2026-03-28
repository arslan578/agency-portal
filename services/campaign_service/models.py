# Re-export models from shared models to avoid duplication
from packages.db.models import (
    Campaign,
    CampaignStatus,
    Plan,
    PlanStatus,
    Client,
    Audience
)

from sqlalchemy import Column, Integer, String, ForeignKey, Boolean
from packages.db.database import Base

# CampaignStateDrift is specific to this service
class CampaignStateDrift(Base):
    __tablename__ = "campaign_state_drifts"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"))
    platform = Column(String)
    kaivo_status = Column(String)
    platform_status = Column(String)
    detected_at = Column(String) # ISO format
    resolved = Column(Boolean, default=False)
    
    # v1.1 Enhancements
    severity = Column(String, default="medium") # low, medium, high
    explanation = Column(String, nullable=True) # Human-readable reason

__all__ = ['Campaign', 'CampaignStatus', 'Plan', 'PlanStatus', 'Client', 'Audience', 'CampaignStateDrift']
