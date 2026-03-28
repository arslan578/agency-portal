from typing import List, Dict, Any
from pydantic import BaseModel

class PolicyCheckResult(BaseModel):
    passed: bool
    violations: List[str]
    warnings: List[str]

def check_policy(platform: str, creative_type: str, metadata: Dict[str, Any]) -> PolicyCheckResult:
    violations = []
    warnings = []
    
    # 1. Text-to-Image Ratio (Meta Rule)
    if platform == "meta" and creative_type == "image":
        text_ratio = metadata.get("text_ratio", 0.0)
        if text_ratio > 0.2:
            warnings.append("Text covers more than 20% of image. Reach may be reduced.")
            
    # 2. Video Duration (TikTok Rule)
    if platform == "tiktok" and creative_type == "video":
        duration = metadata.get("duration", 0)
        if duration < 5:
            violations.append("Video must be at least 5 seconds long.")
        if duration > 60:
            violations.append("Video must be under 60 seconds.")
            
    # 3. Political Content (Global & X Specific)
    if metadata.get("is_political", False):
        if platform == "x":
            violations.append("Political ads are strictly prohibited on X.")
        else:
            violations.append("Political content requires special authorization.")

    # 4. AudioGo Format Rules
    if platform == "audiogo":
        if creative_type != "audio":
            violations.append("AudioGo only supports audio creatives.")
        if metadata.get("duration", 0) > 30:
            violations.append("Audio ads must be 30 seconds or less.")

    # 5. Roku Content Category
    if platform == "roku":
        category = metadata.get("category", "")
        prohibited = ["gambling", "adult", "crypto"]
        if category in prohibited:
            violations.append(f"Content category '{category}' is prohibited on Roku.")

    return PolicyCheckResult(
        passed=len(violations) == 0,
        violations=violations,
        warnings=warnings
    )
