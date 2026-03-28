from sqlalchemy import Column, Integer, String, JSON, ForeignKey, Float
from packages.db.database import Base

class OnboardingProfile(Base):
    __tablename__ = "onboarding_profiles"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True) # Reference to Auth Service User ID
    brand_id = Column(Integer, index=True, nullable=True) # Reference to Account Service Brand ID
    
    onboarding_stage = Column(String, default="started") # started, analyzed, plan_created, completed
    completed_steps = Column(JSON, default=[]) # ["docs_uploaded", "goal_set"]
    
    detected_goal_type = Column(String, nullable=True)
    detected_primary_platforms = Column(JSON, nullable=True) # ["meta", "google"]
    
    creative_readiness_score = Column(Float, default=0.0)
    audience_readiness_score = Column(Float, default=0.0)
    language_readiness_score = Column(Float, default=0.0)
    
    analysis_summary = Column(String, nullable=True)
