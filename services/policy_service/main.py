from fastapi import FastAPI, Depends, Body
from sqlalchemy.orm import Session
from typing import Dict, Any
from . import models, guard
from packages.db.database import engine, get_db

# models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kaivo Policy Service")

@app.get("/policy/validate")
def validate_policy(platform: str, db: Session = Depends(get_db)):
    # Stub: Return all active rules for platform
    return db.query(models.PolicyRule).filter(
        models.PolicyRule.platform == platform,
        models.PolicyRule.is_active == True
    ).all()

@app.post("/policy/check", response_model=guard.PolicyCheckResult)
def check_compliance(
    platform: str = Body(...), 
    creative_type: str = Body(...), 
    metadata: Dict[str, Any] = Body(...)
):
    """Check compliance against platform rules."""
    return guard.check_policy(platform, creative_type, metadata)
