"""
Account Service API

Provides endpoints for agency management, client management, and platform accounts.
Legacy Account/Brand/License endpoints have been deprecated in favor of Agency/Client model.
"""

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from . import schemas, schemas_agency
from .routers import agency, platform_credentials
from packages.db.database import get_db
from services.auth_service import auth
from packages.db.models import ClientMembership, PlatformAccount, Client

app = FastAPI(title="Kaivo Account Service")
app.include_router(agency.router, tags=["Agency"])
# Mount hierarchy on the app router directly (not only on nested agency.APIRouter) so
# API gateway + OpenAPI always expose GET /agency/{agency_id}/clients/hierarchy.
app.add_api_route(
    "/agency/{agency_id}/clients/hierarchy",
    agency.get_agency_clients_hierarchy,
    methods=["GET"],
    response_model=schemas_agency.ClientHierarchyResponse,
    tags=["Agency"],
    name="get_agency_clients_hierarchy",
)
app.include_router(platform_credentials.router)


@app.get("/platform-accounts", response_model=List[schemas.PlatformAccountOut])
def get_user_platform_accounts(
    token: str = Depends(auth.oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Get platform accounts accessible to the current user.
    Returns accounts for all clients the user has membership in.
    """
    user = auth.get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    client_memberships = db.query(ClientMembership).filter(
        ClientMembership.user_id == user.id
    ).all()
    client_ids = [cm.client_id for cm in client_memberships]
    
    if not client_ids:
        return []
    
    platform_accounts = db.query(PlatformAccount).join(Client).filter(
        PlatformAccount.client_id.in_(client_ids)
    ).all()
    
    return [
        schemas.PlatformAccountOut(
            id=pa.id,
            platform=pa.platform,
            account_id=pa.account_id[-6:] if len(pa.account_id) > 6 else "******",
            client_id=pa.client_id,
            client_name=pa.client.name,
            is_connected=pa.access_token is not None,
        )
        for pa in platform_accounts
    ]
