from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from decimal import Decimal

class ReportRecord(BaseModel):
    date: datetime
    platform: str
    impressions: int
    clicks: int
    spend: float  # Maps from spend_agency
    conversions: int = 0  # Default to 0 since UsageRecord doesn't have this field

    class Config:
        from_attributes = True

