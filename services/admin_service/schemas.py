from pydantic import BaseModel, EmailStr
from typing import Optional


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "agency_viewer"
    agency_id: Optional[int] = None


class ResendInviteRequest(BaseModel):
    email: EmailStr


class InviteOut(BaseModel):
    id: int
    email: str
    role: str
    agency_id: Optional[int] = None
    agency_name: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    used_at: Optional[str] = None

    class Config:
        from_attributes = True
