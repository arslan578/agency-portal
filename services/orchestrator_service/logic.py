"""
Kaivo Orchestrator Logic - Production Implementation
Powered by OpenAI GPT-4 for intelligent campaign planning and recommendations
"""

from typing import List, Dict, Any, Optional
import os
from openai import OpenAI

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key) if api_key else None

# Kaivo's 13 supported platforms
PLATFORMS = [
    "meta", "google_ads", "youtube", "tiktok", "roku", "reddit",
    "x_ads", "spotify", "google_display", "snapchat", "microsoft_ads",
    "linkedin", "pinterest"
]

# Platform pricing tiers (CPM in USD)
PLATFORM_CPM_RANGES = {
    "meta": {"min": 5.0, "max": 15.0, "avg": 9.0},
    "google_ads": {"min": 3.0, "max": 12.0, "avg": 7.0},
    "youtube": {"min": 4.0, "max": 10.0, "avg": 6.5},
    "tiktok": {"min": 6.0, "max": 20.0, "avg": 12.0},
    "roku": {"min": 15.0, "max": 40.0, "avg": 25.0},
    "reddit": {"min": 2.0, "max": 8.0, "avg": 4.5},
    "x_ads": {"min": 3.0, "max": 10.0, "avg": 6.0},
    "spotify": {"min": 10.0, "max": 30.0, "avg": 18.0},
    "google_display": {"min": 1.0, "max": 5.0, "avg": 2.5},
    "snapchat": {"min": 5.0, "max": 15.0, "avg": 9.0},
    "microsoft_ads": {"min": 3.0, "max": 12.0, "avg": 7.5},
    "linkedin": {"min": 8.0, "max": 25.0, "avg": 15.0},
    "pinterest": {"min": 3.0, "max": 10.0, "avg": 6.0},
}

# Kaivo CPM markup
KAIVO_MARKUP = 1.50

SYSTEM_PROMPT = """You are the Kaivo Orchestrator, an expert AI advertising strategist for Kaivo's agentic advertising platform.

**Your Knowledge:**
- Kaivo supports 13 advertising platforms: Meta Ads, Google Ads, YouTube, TikTok, Roku, Reddit, X (Twitter), Spotify, Google Display Network, Snapchat, Microsoft Ads, LinkedIn, Pinterest
- Kaivo applies a 1.5x markup on all platform CPMs
- You have access to pricing tiers, platform capabilities, and audience reach models

**Your Capabilities:**
1. Campaign Planning: Recommend platforms, budgets, and targeting strategies
2. Budget Allocation: Distribute budgets across platforms optimally
3. Reach Estimation: Calculate expected impressions based on geography and budget
4. Performance Analysis: Detect drift and suggest optimizations
5. Creative Guidance: Recommend creative formats per platform

**Response Format:**
Always respond in structured JSON with:
{
  "message": "Your natural language response",
  "recommendations": [...],
  "calculations": {...},
  "next_steps": [...],
  "confidence": 0.0-1.0
}

**Platform Priority (use this to weight recommendations):**
1. Meta (highest reach)
2. Google Ads + YouTube
3. TikTok
4. Roku (premium CTV)
5. Reddit, X, Spotify
6. Others

Be conversational but precise. Use specific numbers and data-driven insights.
"""


def process_chat_message(
    message: str,
    intent: Optional[str] = None,
    context: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Process user message using GPT-4 with Kaivo platform knowledge.
    """
    context = context or {}
    conversation_history = context.get("history", [])
    user_budget = context.get("budget", None)
    user_geo = context.get("geography", None)
    
    # Build messages for GPT-4
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]
    
    # Add conversation history
    for msg in conversation_history[-5:]:  # Last 5 messages for context
        messages.append(msg)
    
    # Add current message with context
    user_message = message
    if user_budget:
        user_message += f"\n[Context: User budget is ${user_budget:,.2f}]"
    if user_geo:
        user_message += f"\n[Context: Target geography: {user_geo}]"
    
    messages.append({"role": "user", "content": user_message})
    
    try:
        if not client:
            return {
                "messages": [{"role": "assistant", "content": "I'm currently running in offline mode (No API Key). Please configure OPENAI_API_KEY to enable AI features."}],
                "actions": [],
                "language": "en"
            }

        # Call GPT-4
        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=messages,
            temperature=0.7,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        
        assistant_message = response.choices[0].message.content
        
        # Parse GPT-4 response
        import json
        result = json.loads(assistant_message)
        
        return {
            "messages": [
                {"role": "assistant", "content": result.get("message", "I'm here to help!")}
            ],
            "actions": result.get("next_steps", []),
            "recommendations": result.get("recommendations", []),
            "calculations": result.get("calculations", {}),
            "language": "en"
        }
        
    except Exception as e:
        # Fallback to basic response if GPT-4 fails
        return {
            "messages": [
                {"role": "assistant", "content": f"I'm here to help with your campaign. Could you provide more details about your goals?"}
            ],
            "actions": [],
            "error": str(e),
            "language": "en"
        }


def analyze_onboarding(
    brand_name: str,
    website: str,
    goals: List[str],
    budget: float
) -> Dict[str, Any]:
    """
    Analyze brand inputs and recommend strategy using GPT-4.
    """
    
    # Calculate platform recommendations based on budget
    recommended_platforms = []
    if budget >= 10000:
        recommended_platforms = ["meta", "google_ads", "youtube", "tiktok"]
    elif budget >= 5000:
        recommended_platforms = ["meta", "google_ads", "youtube"]
    else:
        recommended_platforms = ["meta", "google_ads"]
    
    # Calculate estimated reach
    total_impressions = 0
    for platform in recommended_platforms:
        cpm = PLATFORM_CPM_RANGES[platform]["avg"] * KAIVO_MARKUP
        platform_budget = budget / len(recommended_platforms)
        impressions = (platform_budget / cpm) * 1000
        total_impressions += impressions
    
    # Build GPT-4 prompt for brand analysis
    analysis_prompt = f"""Analyze this brand for advertising readiness:

Brand: {brand_name}
Website: {website}
Goals: {', '.join(goals)}
Budget: ${budget:,.2f}/month

Recommended Platforms: {', '.join(recommended_platforms)}
Estimated Total Reach: {total_impressions:,.0f} impressions/month

Provide:
1. Readiness score (0-100)
2. Platform-specific strategies
3. Creative recommendations
4. Next steps

Format as JSON with keys: readiness_score, strategies, creative_guidance, next_steps
"""
    
    try:
        if not client:
             # Fallback immediately if no client
             raise ValueError("OpenAI API Key missing")

        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": analysis_prompt}
            ],
            temperature=0.8,
            max_tokens=1200,
            response_format={"type": "json_object"}
        )
        
        import json
        analysis = json.loads(response.choices[0].message.content)
        
        return {
            "readiness_score": analysis.get("readiness_score", 85),
            "recommended_platforms": recommended_platforms,
            "estimated_reach": int(total_impressions),
            "estimated_cpm": sum(PLATFORM_CPM_RANGES[p]["avg"] * KAIVO_MARKUP for p in recommended_platforms) / len(recommended_platforms),
            "strategies": analysis.get("strategies", {}),
            "creative_guidance": analysis.get("creative_guidance", []),
            "next_steps": analysis.get("next_steps", [
                "Connect platform accounts",
                "Upload audience data",
                "Create initial campaigns"
            ])
        }
        
    except Exception as e:
        # Fallback calculation if GPT-4 fails
        return {
            "readiness_score": 85,
            "recommended_platforms": recommended_platforms,
            "estimated_reach": int(total_impressions),
            "estimated_cpm": sum(PLATFORM_CPM_RANGES[p]["avg"] * KAIVO_MARKUP for p in recommended_platforms) / len(recommended_platforms),
            "next_steps": [
                "Connect platform accounts",
                "Upload audience data",
                "Create initial campaigns"
            ],
            "error": str(e)
        }


def calculate_reach_estimate(
    budget: float,
    platforms: List[str],
    geography: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculate estimated reach across platforms.
    """
    platform_breakdown = {}
    total_impressions = 0
    
    budget_per_platform = budget / len(platforms) if platforms else 0
    
    for platform in platforms:
        if platform not in PLATFORM_CPM_RANGES:
            continue
            
        cpm = PLATFORM_CPM_RANGES[platform]["avg"] * KAIVO_MARKUP
        impressions = (budget_per_platform / cpm) * 1000
        
        platform_breakdown[platform] = {
            "budget": budget_per_platform,
            "cpm": cpm,
            "impressions": int(impressions)
        }
        total_impressions += impressions
    
    return {
        "total_impressions": int(total_impressions),
        "total_budget": budget,
        "platform_breakdown": platform_breakdown,
        "average_cpm": budget / (total_impressions / 1000) if total_impressions > 0 else 0
    }


# ===== Product Knowledge Integration =====

def check_brand_readiness(brand_id: int, db_session: Any = None) -> Dict[str, Any]:
    """
    Check if brand has BrandProfile and ProductDocuments.
    Returns readiness status and recommendations.
    """
    # TODO: Query database for BrandProfile and ProductDocuments
    # For now, simulate with placeholder logic
    has_brand_profile = True  # Would check if brand profile exists with required fields
    has_product_docs = False  # Would check if any active ProductDocuments exist for brand_id
    
    return {
        "brand_id": brand_id,
        "has_brand_profile": has_brand_profile,
        "has_product_docs": has_product_docs,
        "is_ready": has_brand_profile and has_product_docs,
        "missing_items": [
            item for item, exists in [
                ("Brand Profile", has_brand_profile),
                ("Product Documents", has_product_docs)
            ] if not exists
        ]
    }


def help_start(brand_id: int, user_message: str = "", context: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Intent: help_start
    
    Check brand readiness and guide user on next steps.
    If BrandProfile or ProductDocuments are missing, propose uploading them.
    """
    context = context or {}
    
    # Check brand readiness
    readiness = check_brand_readiness(brand_id)
    
    if not readiness["is_ready"]:
        # Missing required data
        missing = readiness["missing_items"]
        
        response_message = f"Welcome! To help you get started, I need a bit more information.\n\n"
        
        if "Brand Profile" in missing:
            response_message += "📋 **Brand Profile**: Please complete your brand information in Settings.\n"
        
        if "Product Documents" in missing:
            response_message += "📄 **Product Documents**: Upload documents about your products/services to help me create better campaigns.\n"
        
        response_message += "\nOnce you've provided this information, I can help you create highly targeted campaigns with AI-generated creative!"
        
        return {
            "intent": "help_start",
            "message": response_message,
            "next_steps": [
                "Complete brand profile" if "Brand Profile" in missing else None,
                "Upload product documents" if "Product Documents" in missing else None
            ],
            "ready_to_proceed": False
        }
    
    # Brand is ready!
    return {
        "intent": "help_start",
        "message": "Great! Your brand is all set up. I can help you:\n\n✨ Generate AI-powered creative variations\n📊 Plan campaigns across 13 platforms\n💰 Optimize budget allocation\n🎯 Target the right audiences\n\nWhat would you like to do?",
        "next_steps": [
            "Create a new campaign",
            "Generate creative variants",
            "Analyze platform options"
        ],
        "ready_to_proceed": True
    }


def generate_creative_from_docs(
    brand_id: int,
    product_document_ids: List[int],
    brief: str,
    objective: str,
    audience: Dict[str, Any] = None,
    db_session: Any = None
) -> Dict[str, Any]:
    """
    Intent: generate_creative_from_docs
    
    Generate creative variants using product knowledge.
    Calls the creative service endpoint and returns structured variants.
    """
    import requests
    
    # TODO: Get from environment or config
    creative_service_url = os.getenv("CREATIVE_SERVICE_URL", "http://creative-service:8000")
    
    try:
        response = requests.post(
            f"{creative_service_url}/creative/generate-variants",
            json={
                "brand_id": brand_id,
                "product_document_ids": product_document_ids,
                "brief": brief,
                "objective": objective,
                "audience": audience or {},
                "variant_types": ["headline_short", "headline_long", "body", "cta"]
            },
            timeout=30
        )
        
        if response.ok:
            data = response.json()
            
            return {
                "intent": "generate_creative_from_docs",
                "success": True,
                "variants": data.get("variants", {}),
                "cache_hit": data.get("cache_hit", False),
                "message": "I've generated creative variants based on your product knowledge! Click on any variant to add it to your campaign.",
                "agent_explanation": {
                    "headline_count": len(data.get("variants", {}).get("headline_short", [])),
                    "body_count": len(data.get("variants", {}).get("body", [])),
                    "cta_count": len(data.get("variants", {}).get("cta", []))
                }
            }
        else:
            return {
                "intent": "generate_creative_from_docs",
                "success": False,
                "message": "I encountered an issue generating variants. Please try again or contact support.",
                "error": response.text
            }
            
    except Exception as e:
        return {
            "intent": "generate_creative_from_docs",
            "success": False,
            "message": "Unable to connect to the creative generation service. Please try again later.",
            "error": str(e)
        }


def plan_campaign_with_docs(
    brand_id: int,
    product_document_ids: List[int],
    goal: str,
    budget: float,
    audience: Dict[str, Any] = None,
    tier: str = "pro",
    db_session: Any = None
) -> Dict[str, Any]:
    """
    Intent: plan_campaign_with_docs
    
    Combine product knowledge, goal, and budget to suggest platforms and allocations.
    Respects tier rules.
    """
    audience = audience or {}
    
    # Tier constraints
    tier_limits = {
        "free": {"max_platforms": 2, "max_budget": 5000},
        "pro": {"max_platforms": 5, "max_budget": 50000},
        "enterprise": {"max_platforms": 13, "max_budget": float('inf')}
    }
    
    limits = tier_limits.get(tier, tier_limits["pro"])
    
    # Goal-platform mapping
    goal_platform_priority = {
        "awareness": ["meta", "youtube", "tiktok", "snapchat", "reddit"],
        "traffic": ["google_ads", "meta", "reddit", "microsoft_ads", "pinterest"],
        "conversions": ["meta", "google_ads", "youtube", "tiktok", "linkedin"],
        "engagement": ["tiktok", "meta", "snapchat", "reddit", "x_ads"]
    }
    
    # Select platforms based on goal and budget
    priority_platforms = goal_platform_priority.get(goal.lower(), ["meta", "google_ads", "youtube"])
    
    # Budget-based platform count
    if budget >= 20000:
        num_platforms = min(5, limits["max_platforms"])
    elif budget >= 10000:
        num_platforms = min(4, limits["max_platforms"])
    elif budget >= 5000:
        num_platforms = min(3, limits["max_platforms"])
    else:
        num_platforms = min(2, limits["max_platforms"])
    
    recommended_platforms = priority_platforms[:num_platforms]
    
    # Calculate budget allocation (weighted by CPM efficiency)
    platform_allocations = {}
    total_weight = 0
    
    for platform in recommended_platforms:
        # Lower CPM = higher weight (more efficient)
        cpm = PLATFORM_CPM_RANGES[platform]["avg"] * KAIVO_MARKUP
        weight = 1 / cpm
        total_weight += weight
        platform_allocations[platform] = weight
    
    # Normalize and assign budgets
    allocation_breakdown = {}
    for platform, weight in platform_allocations.items():
        percentage = (weight / total_weight) * 100
        platform_budget = budget * (weight / total_weight)
        cpm = PLATFORM_CPM_RANGES[platform]["avg"] * KAIVO_MARKUP
        estimated_impressions = (platform_budget / cpm) * 1000
        
        allocation_breakdown[platform] = {
            "budget": round(platform_budget, 2),
            "percentage": round(percentage, 1),
            "estimated_cpm": round(cpm, 2),
            "estimated_impressions": int(estimated_impressions)
        }
    
    return {
        "intent": "plan_campaign_with_docs",
        "goal": goal,
        "budget": budget,
        "tier": tier,
        "recommended_platforms": recommended_platforms,
        "platform_allocations": allocation_breakdown,
        "total_estimated_impressions": sum(p["estimated_impressions"] for p in allocation_breakdown.values()),
        "message": f"Based on your {goal} goal and ${budget:,.0f} budget, I recommend running on {len(recommended_platforms)} platforms. Here's the optimized allocation:",
        "next_steps": [
            "Review platform allocations",
            "Generate creative variants",
            "Launch campaign"
        ]
    }
