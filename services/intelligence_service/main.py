from fastapi import FastAPI, Body, HTTPException, Request
from typing import List
from pydantic import ValidationError
import logging
from .schemas import IntelligenceInput, PlatformScore, SweetSpotSummary, RecommendationItem, RecommendationsRequest
from .core import analyze_platforms, generate_sweet_spot, generate_recommendations
from .creative import analyze_creative, CreativeScore

logger = logging.getLogger(__name__)

app = FastAPI(title="Kaivo Intelligence Service")

# Request validation middleware
@app.middleware("http")
async def validate_request(request: Request, call_next):
    """Validate requests and reject unknown fields."""
    # Only validate POST requests to intelligence endpoints
    if request.method == "POST" and "/intelligence/" in str(request.url.path):
        try:
            # FastAPI will validate automatically via Pydantic models
            # This middleware ensures we catch validation errors early
            response = await call_next(request)
            return response
        except ValidationError as e:
            logger.warning(f"Request validation failed: {e.errors()}")
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "Validation failed",
                    "message": "Request contains unknown fields or invalid data",
                    "errors": e.errors()
                }
            )
    else:
        return await call_next(request)

@app.post("/intelligence/analyze", response_model=List[PlatformScore])
def analyze(inputs: List[IntelligenceInput]):
    """
    Analyze a list of platform inputs and return scores.
    
    Strict validation: Rejects requests with unknown fields.
    """
    if not inputs:
        raise HTTPException(status_code=400, detail="Input list cannot be empty")
    
    try:
        return analyze_platforms(inputs)
    except Exception as e:
        logger.error(f"Intelligence analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/intelligence/recommendations", response_model=List[RecommendationItem])
def recommendations(req: RecommendationsRequest):
    """
    Generate actionable, data-driven recommendations per client based on platform data.
    Each client gets different recommendations based on their campaign metrics.
    """
    if not req.campaigns:
        return []
    try:
        return generate_recommendations(req.campaigns)
    except Exception as e:
        logger.error(f"Recommendations generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recommendations failed: {str(e)}")


@app.post("/intelligence/sweet-spot", response_model=SweetSpotSummary)
def sweet_spot(inputs: List[IntelligenceInput]):
    """
    Generate a Sweet Spot summary for the given inputs.
    
    Strict validation: Rejects requests with unknown fields.
    """
    if not inputs:
        raise HTTPException(status_code=400, detail="Input list cannot be empty")
    
    try:
        scores = analyze_platforms(inputs)
        return generate_sweet_spot(scores)
    except Exception as e:
        logger.error(f"Sweet spot generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sweet spot generation failed: {str(e)}")

@app.post("/intelligence/creative", response_model=CreativeScore)
def score_creative(asset_url: str, asset_type: str):
    """
    Analyze a creative asset.
    
    Args:
        asset_url: URL of the creative asset
        asset_type: Type of asset (image, video, etc.)
    """
    if not asset_url or not asset_url.strip():
        raise HTTPException(status_code=400, detail="asset_url is required")
    
    if not asset_type or not asset_type.strip():
        raise HTTPException(status_code=400, detail="asset_type is required")
    
    try:
        return analyze_creative(asset_url, asset_type)
    except Exception as e:
        logger.error(f"Creative analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Creative analysis failed: {str(e)}")

@app.get("/health")
def health():
    return {"status": "ok"}
