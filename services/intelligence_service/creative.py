from pydantic import BaseModel
from typing import List, Dict, Any

class CreativeScore(BaseModel):
    quality_score: float
    safety_score: float
    detected_language: str
    tags: List[str]
    recommendations: List[str]

def analyze_creative(asset_url: str, asset_type: str) -> CreativeScore:
    # Stub: In a real system, this would call Vision API / OpenAI
    
    # Mock logic based on URL keywords
    quality = 85.0
    safety = 100.0
    tags = ["product", "lifestyle"]
    recs = []
    
    if "low_res" in asset_url:
        quality = 40.0
        recs.append("Upload higher resolution image")
        
    if "nsfw" in asset_url:
        safety = 0.0
        recs.append("Content flagged as unsafe")
        
    return CreativeScore(
        quality_score=quality,
        safety_score=safety,
        detected_language="en",
        tags=tags,
        recommendations=recs
    )
