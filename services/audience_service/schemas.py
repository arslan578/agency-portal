from pydantic import BaseModel, Field
from typing import Dict, Any, Optional


class AudienceCreate(BaseModel):
    client_id: int
    name: str = Field(..., min_length=1, description="Audience name (required)")
    definition: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Targeting definition (geo, interests, etc.)")
    description: Optional[str] = None


class AudienceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[Dict[str, Any]] = None


class AudienceOut(BaseModel):
    id: int
    client_id: int
    name: str
    definition: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    estimated_reach: Optional[int] = None

    class Config:
        from_attributes = True
