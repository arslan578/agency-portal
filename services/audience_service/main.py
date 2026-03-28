"""
Audience Service API

Audiences are owned by clients (brands) within agencies.
"""

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from . import schemas, crud
from .routers import upload
from packages.db.database import get_db

app = FastAPI(title="Kaivo Audience Service")
app.include_router(upload.router, tags=["Upload"])


def _serialize_audience(audience) -> schemas.AudienceOut:
    """Helper to serialize audience model"""
    return schemas.AudienceOut(
        id=audience.id,
        client_id=audience.client_id,
        name=audience.name,
        definition=audience.definition_json or {},
        description=audience.description,
        estimated_reach=None
    )


@app.get("/audiences", response_model=List[schemas.AudienceOut])
def list_audiences(
    client_id: Optional[int] = None,
    agency_id: Optional[int] = None,
    sort_by_name: bool = True,
    db: Session = Depends(get_db),
):
    """List audiences for dropdown/campaign flow. Filter by client_id or agency_id; results ordered by name."""
    db_audiences = crud.list_audiences(
        db, client_id=client_id, agency_id=agency_id, sort_by_name=sort_by_name
    )
    return [_serialize_audience(audience) for audience in db_audiences]


@app.post("/audiences", response_model=schemas.AudienceOut)
def create_audience(audience: schemas.AudienceCreate, db: Session = Depends(get_db)):
    """Create a new audience. Returns clear errors for missing client, empty name, or DB failures."""
    try:
        db_audience = crud.create_audience(db, audience)
        return _serialize_audience(db_audience)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Create audience failed: {str(e)}")


@app.get("/audiences/{audience_id}", response_model=schemas.AudienceOut)
def get_audience(audience_id: int, db: Session = Depends(get_db)):
    """Get a single audience by ID"""
    db_audience = crud.get_audience(db, audience_id)
    if not db_audience:
        raise HTTPException(status_code=404, detail="Audience not found")
    return _serialize_audience(db_audience)


@app.patch("/audiences/{audience_id}", response_model=schemas.AudienceOut)
def update_audience(
    audience_id: int,
    audience_update: schemas.AudienceUpdate,
    db: Session = Depends(get_db)
):
    """Update audience fields"""
    db_audience = crud.update_audience(db, audience_id, audience_update)
    return _serialize_audience(db_audience)


@app.delete("/audiences/{audience_id}")
def delete_audience(audience_id: int, db: Session = Depends(get_db)):
    """Delete an audience"""
    return crud.delete_audience(db, audience_id)
