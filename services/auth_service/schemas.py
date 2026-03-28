from pydantic import BaseModel, EmailStr
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    company_name: Optional[str] = None

class UserCreate(UserBase):
    password: Optional[str] = None # Optional if creating via Google
    google_id: Optional[str] = None

class UserLogin(UserBase):
    password: str

class GoogleLogin(BaseModel):
    id_token: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    company_name: Optional[str] = None
    avatar_url: Optional[str] = None

class UserOut(UserBase):
    id: int
    is_active: bool
    is_superuser: bool = False
    tier: str = "TIER_0"
    agency_id: Optional[str] = None
    agency_name: Optional[str] = None
    agency_role: Optional[str] = None
    agency_credits: Optional[float] = 0.0
    google_id: Optional[str] = None
    has_password: bool = True

    class Config:
        from_attributes = True

class SetPassword(BaseModel):
    password: str
    confirm_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
