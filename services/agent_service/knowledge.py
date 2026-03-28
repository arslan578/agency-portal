from typing import Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime
import uuid

class BrandProfile(BaseModel):
    brand_id: int
    brand_name: str
    brand_description: str
    value_props: List[str]
    tone_of_voice: str
    creative_guidelines: Dict[str, List[str]] # "do", "dont"
    competitors: List[str]
    languages: List[str]
    platform_preferences: List[str]
    past_learnings: List[str]
    product_lines: List[str]
    audiences: List[str]

class ConversationSession(BaseModel):
    session_id: str
    user_id: int
    brand_id: Optional[int] = None
    active_goal_id: Optional[str] = None
    active_audience_id: Optional[str] = None
    active_plan_id: Optional[str] = None
    active_campaign_id: Optional[str] = None
    last_tool_used: Optional[str] = None
    timestamp: datetime

# In-memory storage for prototype (would be DB in production)
_brand_profiles: Dict[int, BrandProfile] = {}
_sessions: Dict[str, ConversationSession] = {}

def ingest_brand_profile(profile: BrandProfile) -> BrandProfile:
    _brand_profiles[profile.brand_id] = profile
    return profile

def get_brand_profile(brand_id: int) -> Optional[BrandProfile]:
    return _brand_profiles.get(brand_id)

def create_session(user_id: int, brand_id: Optional[int] = None) -> ConversationSession:
    session_id = str(uuid.uuid4())
    session = ConversationSession(
        session_id=session_id,
        user_id=user_id,
        brand_id=brand_id,
        timestamp=datetime.now()
    )
    _sessions[session_id] = session
    return session

def get_session(session_id: str) -> Optional[ConversationSession]:
    return _sessions.get(session_id)

def update_session(session_id: str, **kwargs) -> Optional[ConversationSession]:
    session = _sessions.get(session_id)
    if not session:
        return None
    
    updated_data = session.dict()
    updated_data.update(kwargs)
    updated_data["timestamp"] = datetime.now()
    
    new_session = ConversationSession(**updated_data)
    _sessions[session_id] = new_session
    return new_session
