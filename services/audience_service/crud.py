"""
Audience Service CRUD Operations

All audiences are owned by clients (brands).
"""

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional
from fastapi import HTTPException
from . import models, schemas
from packages.db.models import Client


def create_audience(db: Session, audience: schemas.AudienceCreate):
    """Create a new audience for a client. Raises HTTPException on validation or DB errors."""
    client = db.query(Client).filter(Client.id == audience.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    name = (audience.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Audience name is required")
    definition = audience.definition if audience.definition is not None else {}
    try:
        db_audience = models.Audience(
            client_id=audience.client_id,
            name=name,
            description=audience.description,
            definition_json=definition,
        )
        db.add(db_audience)
        db.commit()
        db.refresh(db_audience)
        return db_audience
    except IntegrityError as e:
        db.rollback()
        msg = str(e.orig) if e.orig else "Database constraint failed"
        raise HTTPException(status_code=400, detail=f"Could not create audience: {msg}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create audience: {str(e)}")


def get_audience(db: Session, audience_id: int):
    """Get a single audience by ID"""
    return db.query(models.Audience).filter(models.Audience.id == audience_id).first()


def list_audiences(
    db: Session,
    client_id: Optional[int] = None,
    agency_id: Optional[int] = None,
    sort_by_name: bool = True,
):
    """List audiences with optional filtering by client or agency. Ordered by name by default (for dropdowns)."""
    query = db.query(models.Audience)
    if client_id:
        query = query.filter(models.Audience.client_id == client_id)
    elif agency_id:
        client_ids = db.query(Client.id).filter(Client.agency_id == agency_id).subquery()
        query = query.filter(models.Audience.client_id.in_(client_ids))
    if sort_by_name:
        query = query.order_by(models.Audience.name.asc())
    return query.all()


def update_audience(db: Session, audience_id: int, audience_update: schemas.AudienceUpdate):
    """Update audience fields"""
    db_audience = get_audience(db, audience_id)
    if not db_audience:
        raise HTTPException(status_code=404, detail="Audience not found")
    
    update_data = audience_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key == 'definition':
            setattr(db_audience, 'definition_json', value)
        else:
            setattr(db_audience, key, value)
    
    db.commit()
    db.refresh(db_audience)
    return db_audience


def delete_audience(db: Session, audience_id: int):
    """Delete an audience"""
    db_audience = get_audience(db, audience_id)
    if not db_audience:
        raise HTTPException(status_code=404, detail="Audience not found")
    
    db.delete(db_audience)
    db.commit()
    return {"success": True}
