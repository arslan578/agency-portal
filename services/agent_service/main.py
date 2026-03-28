import os
from fastapi import FastAPI, HTTPException, Request
from .schemas import OrchestratorInput, OrchestratorOutput
from .orchestrator import process_request
from .knowledge import BrandProfile, ingest_brand_profile
from . import models, schemas
from .routers import onboarding
from packages.db.database import engine, get_db
from services.shared.observability import observability_middleware, metrics_endpoint
from .integration_verifier import verify_integrations

# models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kaivo Agent Service")

# Attach shared observability middleware and metrics endpoint
app.middleware("http")(observability_middleware)

app.include_router(onboarding.router, tags=["Onboarding"])

@app.post("/agent/kaivo/act", response_model=OrchestratorOutput)
async def agent_act(inp: OrchestratorInput, request: Request):
    """
    Main entry point for the Kaivo Orchestrator.
    External LLMs or the UI send user intent here.
    
    Safety Contract (Milestone 3):
    - In staging/production, block agent execution with 403 if critical integrations
      are not healthy/configured (database, Redis, API gateway, Meta connector,
      OpenAI API key).
    - In development, allow execution but attach safety_status/integration_status
      metadata to the orchestrator output for frontend visibility.
    """
    # Centralized integration verification (correlation-aware, but correlation-neutral)
    # We simply forward any existing request-scoped correlation ID and never mutate it.
    corr_id = request.headers.get("x-correlation-id")
    integration_status = verify_integrations(correlation_id=corr_id)
    env = integration_status.get("environment", os.getenv("ENVIRONMENT", "development"))
    safety_status = integration_status.get("status", "ok")

    # Hard safety gate for staging/production
    if env in ["staging", "production"] and safety_status != "ok":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "AGENT_BLOCKED_BY_INTEGRATION_HEALTH",
                "message": "Agent execution is disabled until critical integrations are healthy.",
                "environment": env,
                "integration_status": integration_status,
            },
        )

    try:
        out = process_request(inp)
        # Enrich orchestrator output with safety metadata for frontend
        out.safety_status = safety_status
        out.integration_status = integration_status
        return out
    except HTTPException:
        # Re-raise explicit HTTP errors untouched
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent/brand-profile/ingest", response_model=BrandProfile)
async def ingest_profile(profile: BrandProfile):
    """
    Ingest or update a brand profile.
    """
    return ingest_brand_profile(profile)

@app.get("/health")
async def health():
    return {"status": "ok"}

# Temporarily disabled - causing conflicts with API gateway
# @app.get("/metrics")
# async def get_metrics():
#     """Prometheus metrics endpoint."""
#     return metrics_endpoint()
