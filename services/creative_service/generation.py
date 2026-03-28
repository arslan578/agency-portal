"""
GPT-4o Creative Generation Service with Caching

Generates creative variants (headlines, body copy, CTAs) using product knowledge.
"""
import hashlib
import json
import os
from typing import List, Dict, Any, Optional
from openai import OpenAI
from pydantic import BaseModel
from datetime import datetime, timedelta


# Simple in-memory cache (replace with Redis for production)
_generation_cache: Dict[str, Dict] = {}
CACHE_TTL_HOURS = 24


class CreativeVariant(BaseModel):
    text: str
    tone: str
    rationale: str
    score: float


class GenerationRequest(BaseModel):
    brand_id: int
    product_document_ids: List[int] = []
    brief: str
    objective: str
    audience: Dict[str, Any] = {}
    variant_types: List[str] = ["headline_short", "headline_long", "body", "cta", "keywords"]
    seed_content: Optional[Dict[str, str]] = None # e.g. {'headline': '...', 'body': '...'}
    bypass_cache: bool = False
    cache_ttl_minutes: Optional[int] = None # TTL in minutes. If None, uses default CACHE_TTL_HOURS


class GenerationResponse(BaseModel):
    variants: Dict[str, List[CreativeVariant]]
    cache_hit: bool
    saved_variant_id: Optional[int] = None


def generate_cache_key(req: GenerationRequest) -> str:
    """
    Generate a hash key for caching based on request parameters.
    
    Args:
        req: Generation request
        
    Returns:
        Cache key (MD5 hash)
    """
    # Create a stable string representation
    key_parts = [
        str(req.brand_id),
        ",".join(map(str, sorted(req.product_document_ids))),
        req.objective,
        req.brief.lower().strip()
    ]
    
    # Add seed content to key if present
    if req.seed_content:
        for k in sorted(req.seed_content.keys()):
            key_parts.append(f"seed_{k}_{req.seed_content[k]}")

    key_string = "|".join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()


def is_cache_valid(cache_entry: Dict) -> bool:
    """Check if cache entry is still valid using its stored TTL"""
    if not cache_entry:
        return False
    
    cached_at = cache_entry.get("cached_at")
    if not cached_at:
        return False
    
    # Use TTL stored with cache entry, or default if not specified
    stored_ttl_minutes = cache_entry.get("ttl_minutes")
    if stored_ttl_minutes is not None:
        expiry = cached_at + timedelta(minutes=stored_ttl_minutes)
    else:
        expiry = cached_at + timedelta(hours=CACHE_TTL_HOURS)
    
    return datetime.utcnow() < expiry


async def generate_creative_variants(
    req: GenerationRequest,
    product_docs_context: str = "",
    brand_profile: Dict[str, Any] = {}
) -> GenerationResponse:
    """
    Generate creative variants using GPT-4o.
    
    Args:
        req: Generation request
        product_docs_context: Concatenated product document content
        brand_profile: Brand profile data
        
    Returns:
        Generation response with variants
    """
    # Check cache (unless bypassed)
    cache_key = generate_cache_key(req)
    
    if not req.bypass_cache:
        cached = _generation_cache.get(cache_key)
        if cached and is_cache_valid(cached):
            return GenerationResponse(
                variants=cached["variants"],
                cache_hit=True
            )
    
    # Construct GPT-4o prompt
    system_prompt = """You are an expert advertising copywriter specializing in high-converting ad creative.
Generate compelling, concise, and persuasive ad copy that drives action."""
    
    # Build context
    context_parts = []
    
    if product_docs_context:
        context_parts.append(f"=== PRODUCT KNOWLEDGE ===\n{product_docs_context}\n")
    
    if brand_profile:
        context_parts.append(f"=== BRAND INFO ===")
        if brand_profile.get("products_or_services"):
            context_parts.append(f"Products/Services: {brand_profile['products_or_services']}")
        if brand_profile.get("value_propositions"):
            context_parts.append(f"Value Props: {brand_profile['value_propositions']}")
        if brand_profile.get("tone_of_voice"):
            context_parts.append(f"Tone: {brand_profile['tone_of_voice']}")
        context_parts.append("")
    
    context_parts.append(f"=== CAMPAIGN BRIEF ===")
    context_parts.append(f"Objective: {req.objective}")
    context_parts.append(f"Brief: {req.brief}")
    
    if req.seed_content:
        context_parts.append(f"\n=== SEED CONTENT / USER DRAFTS ===")
        context_parts.append("Use these drafts as inspiration or a starting point:")
        for k, v in req.seed_content.items():
            if v and v.strip():
                context_parts.append(f"- {k.replace('_', ' ').capitalize()}: {v}")
    
    if req.audience:
        context_parts.append(f"\n=== TARGET AUDIENCE ===")
        context_parts.append(f"{json.dumps(req.audience, indent=2)}")
    
    context = "\n".join(context_parts)
    
    # Request structured output
    user_prompt = f"""{context}

TASK: Generate 10 variants for each requested type. Return as JSON only.

For each variant type requested ({", ".join(req.variant_types)}), generate 10 options.

Response format:
{{
  "headline_short": [
    {{"text": "...", "tone": "...", "rationale": "...", "score": 0.95}},
    ...
  ],
  "headline_long": [...],
  "body": [...],
  "cta": [...],
  "keywords": ["keyword1", "keyword2", ...]
}}

Constraints:
- headline_short: max 30 chars
- headline_long: max 90 chars
- body: max 270 chars
- cta: max 20 chars
- keywords: single words or short phrases, high search volume potential
- score: 0.0 to 1.0 (quality/relevance estimate)
"""
    
    # Call GPT-4o
    # Call GPT-4o
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
         raise ValueError("OpenAI API Key missing")
         
    client = OpenAI(api_key=api_key)
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.8,
        response_format={"type": "json_object"}
    )
    
    # Parse response
    raw_variants = json.loads(response.choices[0].message.content)
    
    # Convert to Pydantic models
    variants = {}
    for variant_type in req.variant_types:
        if variant_type in raw_variants:
            # Special handling for keywords if they are simple strings
            if variant_type == "keywords" and raw_variants[variant_type] and isinstance(raw_variants[variant_type][0], str):
                # Convert keyword strings to CreativeVariant objects
                variants[variant_type] = [
                    CreativeVariant(
                        text=kw,
                        tone="neutral",
                        rationale="High search volume potential keyword",
                        score=0.8
                    ) for kw in raw_variants[variant_type]
                ]
            else:
                variants[variant_type] = [
                    CreativeVariant(**v) for v in raw_variants[variant_type]
                ]
        else:
            variants[variant_type] = []
    
    # Cache the result (store TTL for validation)
    _generation_cache[cache_key] = {
        "variants": variants,
        "cached_at": datetime.utcnow(),
        "ttl_minutes": req.cache_ttl_minutes
    }
    
    return GenerationResponse(
        variants=variants,
        cache_hit=False
    )
