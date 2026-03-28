"""
Account Service Schemas

Note: Legacy Account/Brand/License schemas are deprecated.
Use Agency/Client schemas from schemas_agency.py instead.
"""

from pydantic import BaseModel
from typing import Optional


class PlatformAccountOut(BaseModel):
    """Platform account information for UI display"""
    id: int
    platform: str
    account_id: str
    client_id: int
    client_name: str
    is_connected: bool

    class Config:
        from_attributes = True
