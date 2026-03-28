from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from services.orchestrator_service.logic import process_chat_message, analyze_onboarding

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    intent: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

class OnboardingRequest(BaseModel):
    brand_name: str
    website: str
    goals: List[str]
    budget: float

@router.post("/orchestrator/chat")
def chat(request: ChatRequest):
    """
    Orchestrator chat endpoint.
    """
    return process_chat_message(request.message, request.intent, request.context)

@router.post("/onboarding/analyze")
def analyze(request: OnboardingRequest):
    """
    Analyzes onboarding inputs and provides recommendations.
    """
    return analyze_onboarding(request.brand_name, request.website, request.goals, request.budget)
