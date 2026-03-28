from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from packages.db.database import get_db
from .. import models
import os
from openai import OpenAI
import json

router = APIRouter()

class OnboardingAnalyzeRequest(BaseModel):
    user_id: int
    brand_id: Optional[int] = None
    brand_docs: Optional[str] = None
    sample_creatives: Optional[List[str]] = None
    audience_description: Optional[str] = None

class OnboardingAnalysisResult(BaseModel):
    readiness_scores: Dict[str, float]
    recommended_goal: str
    recommended_platforms: List[str]
    next_steps: List[str]
    summary: str

class OnboardingCompleteRequest(BaseModel):
    brand_name: str
    website: Optional[str] = None
    brand_description: Optional[str] = None
    product_description: Optional[str] = None
    goals: List[str] = []
    budget: int
    user_id: Optional[int] = None

class OnboardingCompleteResponse(BaseModel):
    success: bool
    brand_id: int
    message: str
    brand_profile: Optional[Dict[str, Any]] = None

@router.post("/onboarding/analyze", response_model=OnboardingAnalysisResult)
def analyze_onboarding(request: OnboardingAnalyzeRequest, db: Session = Depends(get_db)):
    # 1. Create or Get Profile
    profile = db.query(models.OnboardingProfile).filter(models.OnboardingProfile.user_id == request.user_id).first()
    if not profile:
        profile = models.OnboardingProfile(user_id=request.user_id, brand_id=request.brand_id)
        db.add(profile)
    
    # 2. Perform Analysis (Simulated AI Logic)
    # In a real system, this would call an LLM with the provided docs
    
    creative_score = 0.0
    if request.sample_creatives:
        creative_score = min(len(request.sample_creatives) * 20.0, 100.0)
        
    audience_score = 0.0
    if request.audience_description and len(request.audience_description) > 50:
        audience_score = 80.0
    elif request.audience_description:
        audience_score = 40.0
        
    # Heuristic for goal
    recommended_goal = "awareness"
    if request.brand_docs and "sales" in request.brand_docs.lower():
        recommended_goal = "conversions"
    
    recommended_platforms = ["meta", "google"] # Default
    
    # 3. Update Profile
    profile.creative_readiness_score = creative_score
    profile.audience_readiness_score = audience_score
    profile.detected_goal_type = recommended_goal
    profile.detected_primary_platforms = recommended_platforms
    profile.onboarding_stage = "analyzed"
    profile.analysis_summary = f"Ready to launch {recommended_goal} campaign on {', '.join(recommended_platforms)}."
    
    db.commit()
    db.refresh(profile)
    
    return OnboardingAnalysisResult(
        readiness_scores={
            "creative": creative_score,
            "audience": audience_score,
            "language": 100.0 # Default
        },
        recommended_goal=recommended_goal,
        recommended_platforms=recommended_platforms,
        next_steps=["Review Plan", "Connect Accounts", "Launch"],
        summary=profile.analysis_summary
    )

@router.post("/onboarding/complete", response_model=OnboardingCompleteResponse)
async def complete_onboarding(request: OnboardingCompleteRequest, db: Session = Depends(get_db)):
    """
    Complete onboarding and enrich BrandProfile using GPT-4o analysis of product documents.
    
    This endpoint:
    1. Creates/updates the brand record
    2. Fetches product documents uploaded during onboarding
    3. Uses GPT-4o to analyze and populate BrandProfile fields
    4. Returns enriched brand data
    """
    # TODO: Get actual user_id from session/auth
    user_id = request.user_id or 1
    
    # 1. Create or update Brand (stub - assumes Brand model exists)
    # In production, this would create a proper Brand record
    brand_id = 1  # Placeholder
    
    # 2. Fetch product documents for this brand (if any)
    # Note: Since we don't have brand_id yet during upload, we'd need to
    # store docs temporarily or create brand first. For now, simulate with description.
    product_context = ""
    if request.product_description:
        product_context = request.product_description
    if request.brand_description:
        product_context = f"{request.brand_description}\n\n{product_context}"
    
    # 3. Use GPT-4o to enrich Brand Profile
    brand_profile = None
    if product_context:
        try:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                 raise ValueError("OpenAI API Key missing")
                 
            client = OpenAI(api_key=api_key)
            
            system_prompt = """You are a brand strategy analyst. Extract and synthesize brand positioning from the provided context.
Return structured JSON with these fields:
- products_or_services: string
- value_propositions: string
- target_audience_description: string
- tone_of_voice: string (e.g., professional, friendly, luxury, casual)
- creative_do: list of strings (what to do in creative)
- creative_dont: list of strings (what to avoid in creative)
"""
            
            user_prompt = f"""Brand: {request.brand_name}
Website: {request.website or 'N/A'}
Goals: {', '.join(request.goals)}
Budget: ${request.budget}/month

Context:
{product_context}

Analyze this brand and return the structured brand profile as JSON."""
            
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                response_format={"type": "json_object"}
            )
            
            brand_profile = json.loads(response.choices[0].message.content)
            
            # TODO: Save brand_profile to database (BrandProfile model)
            # This would update the brand's profile with the enriched data
            
        except Exception as e:
            print(f"Error enriching brand profile: {e}")
            # Continue without enrichment
    
    # 4. Return success
    return OnboardingCompleteResponse(
        success=True,
        brand_id=brand_id,
        message="Onboarding completed successfully!",
        brand_profile=brand_profile
    )
