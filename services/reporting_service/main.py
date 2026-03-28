from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from packages.db.database import engine, get_db
from packages.db.models import UsageRecord
from . import schemas
from typing import List

# models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kaivo Reporting Service")

@app.get("/reports/campaign/{campaign_id}", response_model=List[schemas.ReportRecord])
def get_campaign_report(campaign_id: int, db: Session = Depends(get_db)):
    # Fetch Report Data from usage_records table
    # UsageRecord already has spend_agency which includes agency markup
    usage_records = db.query(UsageRecord).filter(UsageRecord.campaign_id == campaign_id).all()
    
    # Map UsageRecord to ReportRecord schema (spend_agency -> spend, conversions = 0)
    return [
        schemas.ReportRecord(
            date=record.date,
            platform=record.platform,
            impressions=record.impressions or 0,
            clicks=record.clicks or 0,
            spend=float(record.spend_agency or 0),  # Use spend_agency which includes agency markup
            conversions=0  # UsageRecord doesn't have conversions field
        )
        for record in usage_records
    ]
