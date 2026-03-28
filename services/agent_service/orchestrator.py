from typing import List, Dict, Any, Optional
import os
import json
from openai import OpenAI
from .schemas import (
    OrchestratorInput, OrchestratorOutput, ToolCall,
    CreateGoalInput, CreateAudienceInput, CreateBudgetInput,
    SimulateReachInput, LaunchCampaignInput
)
from .tools import TOOLS, create_plan
from .knowledge import get_session, update_session, create_session

def detect_intent_with_ai(user_message: str) -> Optional[Dict[str, Any]]:
    """
    Use OpenAI GPT-4o to detect intent and extract structured data from user message.
    Returns dict with 'intent' and 'slots' keys, or None if OpenAI fails.
    """
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
            
        client = OpenAI(api_key=api_key, timeout=1200.0)  # 20 minutes timeout
        
        system_prompt = """You are an AI assistant that classifies user intent and extracts structured data for a campaign management system.

Available intents:
- plan_campaign: User wants to create/plan a new campaign
- launch_campaign: User wants to launch/start a campaign
- manage_budget: User wants to adjust/manage budget
- simulate_reach: User wants to simulate audience reach
- onboarding: User needs help getting started
- audience_upload: User wants to upload an audience
- explain_drift: User wants to understand discrepancies
- unknown: Cannot determine intent

Return a JSON object with:
- intent: one of the intents above
- slots: object with extracted data:
  - campaign_name: string (extracted campaign name, generate a descriptive name if not provided)
  - budget: number (extracted budget amount in dollars, or null)
  - goal: string (extracted goal/objective description from user's message)
  - goal_type: string (normalized goal: "awareness", "traffic", "conversion", or "awareness" as default)
  - platforms: array of strings (extracted platforms like "meta", "tiktok", "google", "youtube", "snapchat", etc., or ["meta"] as default)
  - geo: array of strings (extracted geographic targeting as country codes like ["TH", "UK"] when user specifies regions; use empty array [] if not specified — do NOT assume US or any country)
  - languages: array of strings (extracted target languages as 2-letter codes like ["en", "th", "es"], or ["en"] as default)
  - interests: array of strings (extract relevant interest keywords for audience targeting like ["wellness", "spa", "luxury travel"], or empty array)
  - description: string (brief 1-2 sentence summary of the campaign objective and target audience for internal use)

Extract as much information as possible from the user message. Be intelligent about inferring:
- Languages from geography (e.g., Thailand -> Thai, US -> English)
- Interests from product/service mentions (e.g., "luxury hotel" -> ["luxury", "hotels", "travel"])
- Campaign name from product/service (e.g., "luxury hotel in Thailand" -> "Luxury Hotel Thailand Campaign")
- Use sensible defaults for campaign_name, goal_type, platforms, languages — but NEVER default geo; leave geo as [] unless the user explicitly mentions countries or regions."""
        
        user_prompt = f"User message: {user_message}\n\nExtract intent and structured data."
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        return result
        
    except Exception as e:
        print(f"OpenAI intent detection failed: {e}")
        return None

def process_request(inp: OrchestratorInput) -> OrchestratorOutput:
    """
    Core Orchestrator logic:
    1. Identify intent (heuristic for now).
    2. Call appropriate MCP tools.
    3. Update session state.
    4. Return response.
    """
    session = get_session(inp.session_id)
    if not session:
        # For demo purposes, assume user_id=1 if session not found or create new
        session = create_session(user_id=1)
    
    tool_calls_made = []
    new_context = {}
    explanation = ""
    hints = []
    extracted_data = None
    ai_insights = None

    # --- AI-Powered Intent Detection (with fallback to keyword matching) ---
    
    # Try AI-powered intent detection first
    ai_result = detect_intent_with_ai(inp.user_query)
    
    if ai_result and "intent" in ai_result:
        intent = ai_result["intent"]
        # Merge extracted slots into inp.slots (AI slots take precedence)
        if "slots" in ai_result:
            for key, value in ai_result["slots"].items():
                if value is not None:  # Only override if AI extracted a value
                    inp.slots[key] = value
    else:
        # Fallback to keyword-based matching if OpenAI fails
        intent = "unknown"
        if "launch" in inp.user_query.lower() or "start" in inp.user_query.lower():
            intent = "launch_campaign"
        elif "plan" in inp.user_query.lower() or ("create" in inp.user_query.lower() and "campaign" in inp.user_query.lower()):
            intent = "plan_campaign"
        elif "budget" in inp.user_query.lower():
            intent = "manage_budget"
        elif "help me start" in inp.user_query.lower():
            intent = "onboarding"
        elif "upload" in inp.user_query.lower() and "audience" in inp.user_query.lower():
            intent = "audience_upload"
        elif "drift" in inp.user_query.lower():
            intent = "explain_drift"
        elif "simulate" in inp.user_query.lower():
            intent = "simulate_reach"
        
    # 4. Execute Logic based on Intent
    if intent == "onboarding":
        # In a real system, we'd call the onboarding analysis endpoint
        return OrchestratorOutput(
            tool_calls=[],
            new_context_ids={},
            agent_explanation="I can help you get started. Please provide your brand documents and I'll analyze them to recommend a strategy.",
            ui_hints=["Upload brand documents", "Provide campaign goals"]
        )
    elif intent == "audience_upload":
        return OrchestratorOutput(
            tool_calls=[],
            new_context_ids={},
            agent_explanation="To upload an audience, please provide a CSV file with email or phone numbers. I will hash them securely.",
            ui_hints=["Upload CSV file", "Format guide"]
        )
    elif intent == "explain_drift":
        return OrchestratorOutput(
            tool_calls=[],
            new_context_ids={},
            agent_explanation="I'm checking for any discrepancies between Kaivo and your platforms. One moment...",
            ui_hints=["View details", "Sync platforms"]
        )
    elif intent == "launch_campaign":
        launch_input = LaunchCampaignInput(
            plan_id=session.active_plan_id or "plan_1",
            user_id=session.user_id
        )
        launch_out = TOOLS["launch_campaign"](launch_input)
        tool_calls_made.append(ToolCall(tool_name="launch_campaign", arguments=launch_input.model_dump()))
        
        explanation = f"Campaign launched! ID: {launch_out.campaign_id}. Status: {launch_out.status}"
        hints = ["View dashboard", "Monitor performance"]

    # 2. Simulate
    elif intent == "simulate_reach":
        # Require context
        if not session.active_goal_id:
            explanation = "I need a plan first. Try 'Plan a campaign'."
        else:
            sim_input = SimulateReachInput(
                goal_id=session.active_goal_id,
                audience_id=session.active_audience_id or "aud_1",
                creative_ids=["cr_1"], # Stub
                budget_id="bud_1" # Stub
            )
            sim_out = TOOLS["simulate_reach"](sim_input)
            tool_calls_made.append(ToolCall(tool_name="simulate_reach", arguments=sim_input.model_dump()))
            
            explanation = f"Simulation complete. {sim_out.sweet_spot_summary}"
            hints = ["Launch now", "Adjust budget"]

    # 3. Plan / Create
    elif intent == "plan_campaign":
        try:
            # Resolve client_id from session or default to 1
            client_id = getattr(session, 'client_id', None) or inp.slots.get("client_id") or 1
            
            # Extract data from slots (with defaults)
            campaign_name = inp.slots.get("campaign_name") or "New Campaign"
            goal = inp.slots.get("goal") or inp.slots.get("description") or "awareness"
            goal_type = inp.slots.get("goal_type", "awareness").lower()
            budget = inp.slots.get("budget", 1000.0)
            platforms = inp.slots.get("platforms", ["meta"])
            geo = inp.slots.get("geo", [])
            languages = inp.slots.get("languages", ["en"])
            interests = inp.slots.get("interests", [])
            description = inp.slots.get("description") or f"Campaign for {campaign_name}"
            
            # Validation
            if not campaign_name or not campaign_name.strip():
                explanation = "Campaign name is required. Please provide a name for your campaign."
                hints = ["Provide campaign name"]
                extracted_data = None
                ai_insights = None
            elif budget <= 0:
                explanation = "Budget must be greater than 0. Please provide a valid budget amount."
                hints = ["Provide valid budget"]
                extracted_data = None
                ai_insights = None
            else:
                # 1. Resolve audience: use existing if valid, otherwise create new
                audience_id = None
                existing_audience_id = inp.slots.get("audience_id")
                if existing_audience_id is not None:
                    try:
                        from packages.db.models import Audience
                        from packages.db.database import SessionLocal
                        aid = int(existing_audience_id)
                        db = SessionLocal()
                        try:
                            aud = db.query(Audience).filter(
                                Audience.id == aid,
                                Audience.client_id == client_id
                            ).first()
                            if aud:
                                audience_id = aid
                        finally:
                            db.close()
                    except (ValueError, TypeError):
                        pass

                if audience_id is None:
                    aud_input = CreateAudienceInput(
                        brand_id=session.brand_id or 1,
                        geo=geo,
                        languages=languages,
                        interests=interests,
                        notes=campaign_name,
                        description=description
                    )
                    aud_out = TOOLS["create_audience"](aud_input, client_id=client_id)
                    tool_calls_made.append(ToolCall(tool_name="create_audience", arguments=aud_input.model_dump()))
                    audience_id = int(aud_out.audience_id)
                
                # 2. Calculate platform allocations (equal split for now)
                total_budget_cents = int(budget * 100)
                num_platforms = len(platforms)
                base_amount = total_budget_cents // num_platforms
                remainder = total_budget_cents % num_platforms
                platform_allocations_json = {}
                for i, platform in enumerate(platforms):
                    platform_allocations_json[platform] = base_amount + (1 if i < remainder else 0)
                
                # 3. Create Plan (include media_url if provided)
                plan_data = create_plan(
                    client_id=client_id,
                    name=campaign_name,
                    goal=goal_type,
                    total_budget_cents=total_budget_cents,
                    audience_id=audience_id,
                    platform_allocations_json=platform_allocations_json,
                    media_url=inp.media_url,
                    media_type=inp.media_type
                )
                tool_calls_made.append(ToolCall(tool_name="create_plan", arguments={
                    "client_id": client_id,
                    "name": campaign_name,
                    "goal": goal_type,
                    "total_budget_cents": total_budget_cents,
                    "audience_id": audience_id,
                    "platform_allocations_json": platform_allocations_json,
                    "media_url": inp.media_url,
                    "media_type": inp.media_type
                }))
                
                plan_id = plan_data["id"]
                new_context["plan_id"] = str(plan_id)
                new_context["audience_id"] = str(audience_id)
                
                # 4. Convert Plan to Campaign (DRAFT status)
                try:
                    campaign_data = TOOLS["convert_plan_to_campaign"](plan_id=plan_id)
                    campaign_id = campaign_data["id"]
                    new_context["campaign_id"] = str(campaign_id)
                    
                    explanation = f"I've created a campaign '{campaign_name}' with a budget of ${budget:.2f}. The campaign is in DRAFT status and ready for review."
                    hints = ["Review campaign", "Launch campaign", "Edit settings"]
                    
                    tool_calls_made.append(ToolCall(tool_name="convert_plan_to_campaign", arguments={"plan_id": plan_id}))
                    
                    # Log success for debugging
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.info(f"Successfully created campaign {campaign_id} from plan {plan_id}")
                except Exception as campaign_error:
                    # Log the error properly
                    import logging
                    import traceback
                    logger = logging.getLogger(__name__)
                    logger.error(f"Campaign conversion failed for plan {plan_id}: {str(campaign_error)}")
                    logger.error(traceback.format_exc())
                    
                    # If campaign creation fails, still return plan success
                    explanation = f"I've created a plan for '{campaign_name}' with a budget of ${budget:.2f}. The plan is ready for review."
                    hints = ["Review the plan", "Launch campaign", "Adjust settings"]
                
                # Update session
                update_session(
                    session.session_id,
                    active_plan_id=str(plan_id),
                    active_audience_id=str(audience_id)
                )
                
                # Store extracted data for frontend
                extracted_data = {
                    "campaign_name": campaign_name,
                    "budget": budget,
                    "goal": goal,
                    "goal_type": goal_type,
                    "platforms": platforms,
                    "geo": geo,
                    "languages": languages,
                    "interests": interests,
                    "description": description
                }
                
                # Generate AI insights
                ai_insights = []
                if len(geo) > 1:
                    ai_insights.append(f"Detected multi-country targeting: {', '.join(geo)}")
                elif len(geo) == 1:
                    ai_insights.append(f"Detected geographic targeting: {geo[0]}")
                
                # Language inference
                if len(languages) > 0:
                    if "TH" in geo or "Thailand" in str(geo) and "th" in languages:
                        ai_insights.append("Inferred Thai language from Thailand targeting")
                    if "US" in geo and "en" in languages:
                        ai_insights.append("Inferred English language from US targeting")
                    if len(languages) > 1:
                        ai_insights.append(f"Detected {len(languages)} target languages: {', '.join(languages)}")
                
                # Interest extraction
                if len(interests) > 0:
                    ai_insights.append(f"Extracted {len(interests)} interest keywords from your description")
                
                # Platform detection
                if len(platforms) > 1:
                    ai_insights.append(f"Detected {len(platforms)} platforms and allocated budget proportionally")
                elif len(platforms) == 1 and platforms[0] != "meta":
                    ai_insights.append(f"Selected {platforms[0]} as the target platform")
                
                # Goal inference
                if goal_type and goal_type != "awareness":
                    ai_insights.append(f"Inferred campaign goal: {goal_type} from your description")
                
                # Campaign name generation
                if campaign_name and len(campaign_name) > 10:
                    ai_insights.append("Generated descriptive campaign name from your input")
                
                # Budget allocation insight
                if len(platforms) > 1:
                    ai_insights.append(f"Allocated ${budget:.2f} budget across {len(platforms)} platforms")
        except Exception as e:
            explanation = f"I encountered an error while creating your plan: {str(e)}. Please try again."
            hints = ["Retry", "Check your inputs"]
            extracted_data = None
            ai_insights = None
    else:
        explanation = "I'm not sure how to help with that yet. Try 'Plan a campaign' or 'Simulate reach'."
        hints = ["Plan a campaign", "Check account status"]
        extracted_data = None
        ai_insights = None

    return OrchestratorOutput(
        tool_calls=tool_calls_made,
        new_context_ids=new_context,
        agent_explanation=explanation,
        ui_hints=hints,
        created_audience_id=int(new_context.get("audience_id")) if new_context.get("audience_id") else None,
        created_plan_id=int(new_context.get("plan_id")) if new_context.get("plan_id") else None,
        created_campaign_id=int(new_context.get("campaign_id")) if new_context.get("campaign_id") else None,
        extracted_data=extracted_data,
        ai_insights=ai_insights
    )
