from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import csv
import io
from packages.db.database import get_db
from packages.db.models import Client, Agency, Audience, PlanTier
from services.shared.cloudinary_client import cloudinary_client

router = APIRouter()


class AudienceUploadResponse(BaseModel):
    audience_id: int
    row_count: int
    status: str


class AudienceUploadRequest(BaseModel):
    """Request model for audience CSV upload (file is uploaded to Cloudinary by frontend)."""
    client_id: int = Field(..., description="Client (brand) that owns this audience")
    name: str = Field(..., min_length=1, description="Audience name")
    cloudinary_url: str = Field(..., description="Cloudinary URL of the uploaded CSV file")


@router.post("/audience/upload", response_model=AudienceUploadResponse)
async def upload_audience(
    request: AudienceUploadRequest,
    db: Session = Depends(get_db),
):
    """
    Create an audience from a CSV file (hosted at Cloudinary URL).
    Validates client and tier; parses CSV and stores audience with row count in definition_json.
    """
    client_id = request.client_id
    name = (request.name or "").strip()
    cloudinary_url = (request.cloudinary_url or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Audience name is required")
    if not cloudinary_url:
        raise HTTPException(status_code=400, detail="cloudinary_url is required")

    # 1. Resolve client and check tier (audience upload requires non-free plan)
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    agency = db.query(Agency).filter(Agency.id == client.agency_id).first()
    if agency and getattr(agency, "current_plan", None) == PlanTier.FREE:
        raise HTTPException(
            status_code=403,
            detail="Audience upload requires a paid plan.",
        )

    # 2. Fetch CSV from Cloudinary
    try:
        content = cloudinary_client.fetch_content(cloudinary_url)
        text_content = content.decode("utf-8")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to fetch CSV from Cloudinary: {str(e)}",
        )

    # 3. Parse CSV and count rows (first column treated as identifier)
    csv_reader = csv.reader(io.StringIO(text_content))
    row_count = 0
    for row in csv_reader:
        if row and (row[0] or "").strip():
            row_count += 1

    # 4. Create Audience using only existing DB columns
    audience = Audience(
        client_id=client_id,
        name=name,
        file_url=cloudinary_url,
        is_uploaded=True,
        definition_json={
            "source": "csv_upload",
            "row_count": row_count,
        },
    )
    db.add(audience)
    db.commit()
    db.refresh(audience)

    return AudienceUploadResponse(
        audience_id=audience.id,
        row_count=row_count,
        status="processed",
    )
