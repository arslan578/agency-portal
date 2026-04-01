"""
Agency System Router.

This module provides endpoints for:
1. Creating Agencies (with Admin assignment).
2. Managing Agency Clients (Create, List, Update settings).
3. Managing Agency Members (Invite, List, Remove).

All sensitive operations require appropriate role-based access control.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from packages.db.database import get_db
from packages.db.models import (
    Agency,
    Client,
    AgencyMembership,
    AgencyRole,
    User,
    AgencyInvite,
    InviteStatus,
    Campaign,
    CampaignStatus,
    PlatformAccount,
    ClientAccountGroup,
    ClientPortalSettings,
)
from services.account_service import schemas_agency
from services.account_service.agency_access import ensure_agency_scope
from services.account_service.hierarchy_builder import build_client_hierarchy
from services.auth_service.dependencies import (
    require_admin,
    require_member_or_above,
    require_any_member,
    get_current_user_agency_context,
)

router = APIRouter()

# --- Agency CRUD ---

@router.get("/agencies/{agency_id}", response_model=schemas_agency.AgencyOut)
def get_agency(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """Get agency by ID"""
    ensure_agency_scope(ctx, agency_id)
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    return agency


@router.get("/agency/{agency_id}/dashboard")
def get_agency_dashboard(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """
    Agency dashboard summary. Only agency members can access.
    Returns agency info, client count, and campaign counts for the agency.
    """
    ensure_agency_scope(ctx, agency_id)
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    clients_count = db.query(Client).filter(Client.agency_id == agency_id).count()
    client_ids = [r[0] for r in db.query(Client.id).filter(Client.agency_id == agency_id).all()]
    campaigns_count = 0
    active_campaigns_count = 0
    if client_ids:
        campaigns_count = db.query(Campaign).filter(Campaign.client_id.in_(client_ids)).count()
        active_campaigns_count = db.query(Campaign).filter(
            Campaign.client_id.in_(client_ids),
            Campaign.status == CampaignStatus.ACTIVE,
        ).count()
    return {
        "agency": {
            "id": agency.id,
            "name": agency.name,
            "current_plan": agency.current_plan.value if agency.current_plan else "free",
            "credits": float(agency.credits) if agency.credits is not None else 0,
            "billing_status": agency.billing_status or "active",
        },
        "clients_count": clients_count,
        "campaigns_count": campaigns_count,
        "active_campaigns_count": active_campaigns_count,
    }


@router.patch("/agencies/{agency_id}", response_model=schemas_agency.AgencyOut)
def update_agency(
    agency_id: int,
    update: schemas_agency.AgencyUpdate,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """Update agency settings (Admin only)"""
    ensure_agency_scope(ctx, agency_id)
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    if update.name is not None:
        agency.name = update.name
    
    db.commit()
    db.refresh(agency)
    return agency


@router.get("/agencies/{agency_id}/members", response_model=List[schemas_agency.MemberOut])
def list_agency_members(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """List all members of an agency"""
    ensure_agency_scope(ctx, agency_id)
    memberships = db.query(AgencyMembership).filter(
        AgencyMembership.agency_id == agency_id
    ).all()
    
    result = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            result.append({
                "id": m.id,
                "user_id": m.user_id,
                "email": user.email,
                "full_name": user.full_name,
                "role": m.role.value if m.role else "agency_viewer",
                "created_at": str(m.id)
            })
    
    return result


@router.post("/agencies/{agency_id}/invite", response_model=dict)
def invite_member(
    agency_id: int,
    invite: schemas_agency.InviteMember,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """
    Invite a new member to the agency (Admin only).
    Creates a pending invite that the user can accept via link.
    If user already exists, they can accept immediately.
    """
    ensure_agency_scope(ctx, agency_id)
    import secrets
    from datetime import datetime, timedelta
    from packages.db.models import AgencyInvite, InviteStatus
    
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    email = invite.email.lower().strip()
    
    # Check if user is already a member
    user = db.query(User).filter(User.email == email).first()
    if user:
        existing_membership = db.query(AgencyMembership).filter(
            AgencyMembership.agency_id == agency_id,
            AgencyMembership.user_id == user.id
        ).first()
        if existing_membership:
            raise HTTPException(status_code=400, detail="User is already a member of this agency")
    
    # Check for existing pending invite
    existing_invite = db.query(AgencyInvite).filter(
        AgencyInvite.agency_id == agency_id,
        AgencyInvite.email == email,
        AgencyInvite.status == InviteStatus.PENDING
    ).first()
    
    if existing_invite:
        raise HTTPException(status_code=400, detail="An invite is already pending for this email")
    
    # Map role strings to AgencyRole enum
    role_map = {
        "agency_admin": AgencyRole.ADMIN,
        "agency_member": AgencyRole.MEMBER,
        "agency_viewer": AgencyRole.VIEWER
    }
    
    # Create invite token (URL-safe)
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)
    
    db_invite = AgencyInvite(
        agency_id=agency_id,
        email=email,
        role=role_map.get(invite.role, AgencyRole.VIEWER),
        token=token,
        status=InviteStatus.PENDING,
        invited_by_user_id=ctx.get("user_id"),
        expires_at=expires_at
    )
    db.add(db_invite)
    db.commit()
    db.refresh(db_invite)
    
    # Generate invite link (frontend will handle this route)
    import os
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    invite_link = f"{frontend_url}/auth/accept-invite?token={token}"
    
    # TODO: Send email with invite link (for now, just return the link)
    
    return {
        "success": True,
        "message": f"Invite sent to {email}",
        "invite_id": db_invite.id,
        "invite_link": invite_link,
        "expires_at": str(expires_at)
    }


@router.get("/invites/pending", response_model=list)
def get_pending_invites_for_email(
    email: str,
    db: Session = Depends(get_db)
):
    """Get pending invites for an email address (used during login/signup)"""
    from packages.db.models import AgencyInvite, InviteStatus
    from datetime import datetime
    
    invites = db.query(AgencyInvite).filter(
        AgencyInvite.email == email.lower().strip(),
        AgencyInvite.status == InviteStatus.PENDING,
        AgencyInvite.expires_at > datetime.utcnow()
    ).all()
    
    return [
        {
            "id": inv.id,
            "agency_id": inv.agency_id,
            "agency_name": inv.agency.name if inv.agency else None,
            "role": inv.role.value,
            "token": inv.token,
            "expires_at": str(inv.expires_at)
        }
        for inv in invites
    ]


@router.post("/invites/accept", response_model=dict)
def accept_invite(
    token: str,
    db: Session = Depends(get_db),
    authorization: str = Header(None)
):
    """
    Accept an agency invite using the token.
    User must be authenticated.
    """
    from packages.db.models import AgencyInvite, InviteStatus
    from datetime import datetime
    from services.auth_service.dependencies import decode_jwt_token
    
    # Get current user from token
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = decode_jwt_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Find the invite
    invite = db.query(AgencyInvite).filter(
        AgencyInvite.token == token,
        AgencyInvite.status == InviteStatus.PENDING
    ).first()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    
    if invite.expires_at < datetime.utcnow():
        invite.status = InviteStatus.EXPIRED
        db.commit()
        raise HTTPException(status_code=400, detail="Invite has expired")
    
    # Verify email matches
    if invite.email.lower() != user.email.lower():
        raise HTTPException(
            status_code=403, 
            detail=f"This invite was sent to {invite.email}. Please log in with that email."
        )
    
    # Check if already a member
    existing = db.query(AgencyMembership).filter(
        AgencyMembership.agency_id == invite.agency_id,
        AgencyMembership.user_id == user.id
    ).first()
    
    if existing:
        invite.status = InviteStatus.ACCEPTED
        invite.accepted_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "You are already a member of this agency"}
    
    # Create membership
    membership = AgencyMembership(
        user_id=user.id,
        agency_id=invite.agency_id,
        role=invite.role
    )
    db.add(membership)
    
    # Mark invite as accepted
    invite.status = InviteStatus.ACCEPTED
    invite.accepted_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "success": True,
        "message": f"You have joined {invite.agency.name}",
        "agency_id": invite.agency_id,
        "role": invite.role.value
    }


@router.get("/agencies/{agency_id}/invites", response_model=list)
def list_agency_invites(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """List all pending invites for an agency (Admin only)"""
    ensure_agency_scope(ctx, agency_id)
    from packages.db.models import AgencyInvite, InviteStatus
    
    invites = db.query(AgencyInvite).filter(
        AgencyInvite.agency_id == agency_id,
        AgencyInvite.status == InviteStatus.PENDING
    ).all()
    
    return [
        {
            "id": inv.id,
            "email": inv.email,
            "role": inv.role.value,
            "expires_at": str(inv.expires_at),
            "created_at": str(inv.created_at)
        }
        for inv in invites
    ]


@router.delete("/agencies/{agency_id}/invites/{invite_id}", response_model=dict)
def revoke_invite(
    agency_id: int,
    invite_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """Revoke a pending invite (Admin only)"""
    ensure_agency_scope(ctx, agency_id)
    from packages.db.models import AgencyInvite, InviteStatus
    
    invite = db.query(AgencyInvite).filter(
        AgencyInvite.id == invite_id,
        AgencyInvite.agency_id == agency_id,
        AgencyInvite.status == InviteStatus.PENDING
    ).first()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    
    invite.status = InviteStatus.REVOKED
    db.commit()
    
    return {"success": True, "message": "Invite revoked"}


@router.delete("/agencies/{agency_id}/members/{member_id}", response_model=dict)
def remove_member(
    agency_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """Remove a member from the agency (Admin only)"""
    ensure_agency_scope(ctx, agency_id)
    membership = db.query(AgencyMembership).filter(
        AgencyMembership.id == member_id,
        AgencyMembership.agency_id == agency_id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Prevent removing the last admin
    if membership.role == AgencyRole.ADMIN:
        admin_count = db.query(AgencyMembership).filter(
            AgencyMembership.agency_id == agency_id,
            AgencyMembership.role == AgencyRole.ADMIN
        ).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")
    
    db.delete(membership)
    db.commit()
    
    return {"success": True, "message": "Member removed from agency"}


@router.get("/clients", response_model=List[schemas_agency.ClientOut])
def list_clients_by_agency(
    agency_id: int = Query(..., description="Agency id (must match X-Agency-ID context)"),
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """List clients for an agency by query parameter (same RBAC as /agency/{id}/clients)."""
    ensure_agency_scope(ctx, agency_id)
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    return clients


# --- Agency Management ---

@router.post("/agency", response_model=schemas_agency.AgencyOut)
def create_agency(
    agency: schemas_agency.AgencyCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new agency and assign the creating user as admin.
    """
    db_agency = Agency(name=agency.name)
    db.add(db_agency)
    db.commit()
    db.refresh(db_agency)
    
    # Create the admin membership
    membership = AgencyMembership(
        user_id=agency.owner_user_id,
        agency_id=db_agency.id,
        role=AgencyRole.ADMIN
    )
    db.add(membership)
    db.commit()
    
    # COMPAT SHIM: The test contract expects result.owner_user_id to be present
    setattr(db_agency, 'owner_user_id', agency.owner_user_id)
    
    return db_agency


# --- Agency Client Management ---

# Registered on the FastAPI app in account_service/main.py via add_api_route so the route
# reliably appears when the gateway does include_router(account_app.router) (nested routers
# can omit deep routes from OpenAPI / matching in some setups).
def get_agency_clients_hierarchy(
    agency_id: int,
    period: str = "7d",
    client_id: Optional[int] = None,
    include_campaigns: bool = True,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """
    Nested clients → platforms → campaigns (ad_sets empty until Phase 4).
    Metrics are aggregated from usage_records in the given period.
    """
    ensure_agency_scope(ctx, agency_id)
    if client_id is not None:
        row = db.query(Client).filter(
            Client.id == client_id,
            Client.agency_id == agency_id,
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="Client not found")
    payload = build_client_hierarchy(
        db, agency_id,
        period=period,
        client_id=client_id,
        include_campaigns=include_campaigns
    )
    return payload


@router.get("/agency/{agency_id}/clients", response_model=List[schemas_agency.ClientOut])
def list_agency_clients(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """List all clients for an agency."""
    ensure_agency_scope(ctx, agency_id)
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    return clients


@router.post("/agency/{agency_id}/clients", response_model=schemas_agency.ClientOut)
def create_client(
    agency_id: int,
    client: schemas_agency.ClientCreate,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above)
):
    """Create a new client under an agency (Admin or Member)"""
    ensure_agency_scope(ctx, agency_id)
    db_client = Client(
        agency_id=agency_id,
        name=client.name,
        industry=client.industry,
        website=client.website,
        markup_percent=client.markup_percent,
        is_active=client.is_active,
        account_mode=client.account_mode or "kaivo_managed",
    )
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    
    # COMPAT SHIM: Attach legacy field names for older tests/consumers
    setattr(db_client, 'client_name', db_client.name)
    setattr(db_client, 'markup_multiplier', db_client.markup_percent)
    
    return db_client


@router.patch("/clients/{client_id}", response_model=schemas_agency.ClientOut)
def update_client(
    client_id: int,
    update: schemas_agency.ClientUpdate,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above)
):
    """Update client details (Admin or Member)"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    ensure_agency_scope(ctx, client.agency_id)

    if update.name is not None:
        client.name = update.name
    if update.industry is not None:
        client.industry = update.industry
    if update.website is not None:
        client.website = update.website
    if update.is_active is not None:
        client.is_active = update.is_active
    if update.account_mode is not None:
        client.account_mode = update.account_mode
    
    db.commit()
    db.refresh(client)
    return client


@router.delete("/clients/{client_id}", response_model=dict)
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """Delete a client (Admin only)"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    ensure_agency_scope(ctx, client.agency_id)

    db.delete(client)
    db.commit()
    
    return {"success": True, "message": "Client deleted"}


@router.post("/agency/clients/{client_id}/markup")
def update_client_markup(
    client_id: int,
    markup: schemas_agency.MarkupUpdate,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """Update the markup percentage for a specific client (Admin only)"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    ensure_agency_scope(ctx, client.agency_id)

    client.markup_percent = markup.markup_percent
    db.commit()
    return {"status": "success", "new_markup": client.markup_percent}


@router.post("/agency/clients/{client_id}/permissions")
def update_client_permissions(
    client_id: int,
    permission: schemas_agency.PermissionUpdate,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin)
):
    """Update client permissions (Admin only)"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    ensure_agency_scope(ctx, client.agency_id)

    client.is_active = permission.is_active
    db.commit()
    return {"status": "success", "is_active": client.is_active}


# ── Meta Business Manager Endpoints ──────────────────────────────────────────

@router.post("/agency/{agency_id}/meta/connect")
def connect_meta_bm(
    agency_id: int,
    body: dict,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """
    Connect Meta Business Manager to the agency.
    Receives OAuth code from frontend, exchanges for long-lived token,
    fetches BM info, stores credentials.
    """
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.meta_bm_service import connect_business_manager

    code = body.get("code")
    redirect_uri = body.get("redirectUri")
    if not code:
        raise HTTPException(status_code=400, detail="OAuth code is required")

    try:
        result = connect_business_manager(
            db, agency_id, code, user_id=ctx.get("user_id"), redirect_uri=redirect_uri
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect Meta BM: {str(e)}")


@router.post("/agency/{agency_id}/meta/disconnect")
def disconnect_meta_bm(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """Disconnect Meta Business Manager from the agency."""
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.meta_bm_service import disconnect_business_manager

    try:
        result = disconnect_business_manager(db, agency_id, user_id=ctx.get("user_id"))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agency/{agency_id}/meta/accounts")
def get_meta_bm_accounts(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """
    List all ad accounts under the agency's Business Manager.
    Returns list of ad accounts with metadata.
    """
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.meta_bm_service import fetch_bm_client_ad_accounts

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")

    if not agency.meta_business_manager_id or not agency.meta_agency_access_token:
        return {"connected": False, "accounts": [], "reason": "agency_not_connected"}

    try:
        accounts = fetch_bm_client_ad_accounts(
            agency.meta_business_manager_id, agency.meta_agency_access_token
        )

        # Annotate accounts with linked client info
        clients = db.query(Client).filter(Client.agency_id == agency_id).all()
        client_map = {}
        for c in clients:
            if c.agency_meta_account_id:
                client_map[c.agency_meta_account_id] = c.id

        for acc in accounts:
            acc["linked_client_id"] = client_map.get(acc["account_id"])

        return {"connected": True, "accounts": accounts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch accounts: {str(e)}")


@router.get("/agency/{agency_id}/meta/status")
def get_meta_bm_status(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """Get Meta Business Manager connection status for the agency."""
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.meta_bm_service import check_token_validity

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")

    if not agency.meta_business_manager_id:
        return {
            "connected": False,
            "business_manager_id": None,
            "business_manager_name": None,
            "connected_at": None,
            "token_valid": False,
            "token_expires_at": None,
            "token_warning": False,
        }

    token_info = check_token_validity(agency)

    return {
        "connected": True,
        "business_manager_id": agency.meta_business_manager_id,
        "business_manager_name": agency.meta_business_manager_name,
        "connected_at": agency.meta_connected_at.isoformat() if agency.meta_connected_at else None,
        "token_valid": token_info.get("valid", False),
        "token_expires_at": token_info.get("expires_at"),
        "token_warning": token_info.get("warning", False),
    }


@router.post("/agency/{agency_id}/meta/auto-link")
def auto_link_meta_clients(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """
    Auto-link agency clients to BM ad accounts.
    Matches Kaivo platform accounts against BM client_ad_accounts.
    """
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.meta_bm_service import auto_link_clients

    try:
        result = auto_link_clients(db, agency_id, user_id=ctx.get("user_id"))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auto-link failed: {str(e)}")


@router.post("/clients/{client_id}/meta/manual-link")
def manual_link_meta_client(
    client_id: int,
    body: dict,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    """
    Manually assign a BM ad account to a client.
    Body: { "ad_account_id": "act_XXXXXXX" }
    """
    from services.account_service.meta_bm_service import manual_link_client

    ad_account_id = body.get("ad_account_id")
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="ad_account_id is required")

    try:
        result = manual_link_client(
            db, client_id, ad_account_id,
            agency_id=ctx.get("agency_id"),
            user_id=ctx.get("user_id"),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Agency does not own this client")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manual link failed: {str(e)}")


@router.get("/clients/{client_id}/meta-insights")
def get_client_meta_insights(
    client_id: int,
    refresh: bool = False,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """
    Fetch Meta insights for a specific client.
    Uses agency BM token, NOT client's Kaivo token.
    Returns campaigns (live), ad_accounts (cached), ad_sets (cached).
    """
    import traceback
    from services.account_service.meta_bm_service import fetch_client_meta_insights

    try:
        result = fetch_client_meta_insights(
            db, client_id,
            agency_id=ctx.get("agency_id"),
            user_id=ctx.get("user_id"),
            refresh=refresh,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Agency does not own this client")
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(
            f"meta-insights error for client {client_id}: {e}\n{traceback.format_exc()}"
        )
        # Return a graceful fallback instead of a 500 so the frontend stops retrying
        return {
            "connected": False,
            "reason": "server_error",
            "meta_account_status": "error",
            "ad_accounts": [],
            "campaigns": [],
            "ad_sets": [],
            "token_valid": False,
            "token_expires_at": None,
            "error": str(e),
        }


# ── Client Manager (Reporting replacement) ─────────────────────────────────────



@router.get("/api/agency/accounts/unassigned", response_model=List[schemas_agency.ClientManagerAccount])
def get_unassigned_accounts(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """List platform accounts that are not yet grouped in Client Manager."""
    ensure_agency_scope(ctx, agency_id)
    accounts = (
        db.query(PlatformAccount)
        .outerjoin(ClientAccountGroup)
        .filter(ClientAccountGroup.id == None)
        .join(Client)
        .filter(Client.agency_id == agency_id)
        .all()
    )
    return [
        schemas_agency.ClientManagerAccount(
            id=pa.id,
            platform=pa.platform,
            account_id=pa.account_id,
            display_name=pa.account_id,
            client_id=pa.client_id,
            client_name=pa.client.name if pa.client else None,
            group_client_id=None,
            group_client_name=None,
            is_assigned=False,
        )
        for pa in accounts
    ]


@router.get("/api/agency/accounts/unassigned/count", response_model=dict)
def get_unassigned_count(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    """Return count of unassigned platform accounts for this agency."""
    ensure_agency_scope(ctx, agency_id)
    count = (
        db.query(PlatformAccount)
        .outerjoin(ClientAccountGroup)
        .filter(ClientAccountGroup.id == None)
        .join(Client)
        .filter(Client.agency_id == agency_id)
        .count()
    )
    return {"count": count}


@router.get("/api/agency/accounts/suggestions", response_model=List[dict])
def get_account_suggestions(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """Placeholder endpoint for future fuzzy matching suggestions."""
    ensure_agency_scope(ctx, agency_id)
    return [
        {
            "id": "s1",
            "name": "Nova Skincare",
            "count": 3,
            "platforms": ["meta", "tiktok"],
            "confidence": 0.92,
        },
    ]


@router.get(
    "/agency/{agency_id}/client-manager",
    response_model=schemas_agency.ClientManagerSummary,
)
def get_client_manager_summary(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """Return unassigned accounts and per-client grouping/portal settings."""
    ensure_agency_scope(ctx, agency_id)

    clients = (
        db.query(Client)
        .filter(Client.agency_id == agency_id, Client.is_active == True)
        .all()
    )
    client_ids = [c.id for c in clients] or [-1]

    platform_accounts = (
        db.query(PlatformAccount)
        .join(Client)
        .filter(Client.agency_id == agency_id)
        .all()
    )
    pa_ids = [p.id for p in platform_accounts] or [-1]

    groups = (
        db.query(ClientAccountGroup)
        .filter(
            ClientAccountGroup.agency_id == agency_id,
            ClientAccountGroup.platform_account_id.in_(pa_ids),
        )
        .all()
    )
    groups_by_pa = {g.platform_account_id: g for g in groups}

    settings_list = (
        db.query(ClientPortalSettings)
        .filter(ClientPortalSettings.client_id.in_(client_ids))
        .all()
    )
    settings_by_client = {s.client_id: s for s in settings_list}

    # Identify implicit accounts from Client table columns (Meta/Reddit) and ensure they have PlatformAccount rows
    migrated_count = 0
    for c in clients:
        # Meta
        if c.agency_meta_account_id:
            pa = (
                db.query(PlatformAccount)
                .filter(PlatformAccount.platform == "meta", PlatformAccount.account_id == c.agency_meta_account_id)
                .first()
            )
            if not pa:
                # Create PlatformAccount row to migrate it into the new management system
                pa = PlatformAccount(
                    client_id=c.id,
                    platform="meta",
                    account_id=c.agency_meta_account_id
                )
                db.add(pa)
                db.flush()
                # Also ensure ClientAccountGroup exists
                db.add(ClientAccountGroup(
                    agency_id=agency_id,
                    client_id=c.id,
                    platform_account_id=pa.id
                ))
                # Move existing campaigns to this client
                from packages.db.models import Campaign
                db.query(Campaign).filter(Campaign.account_id == pa.id).update({
                    "client_id": c.id
                }, synchronize_session=False)
                migrated_count += 1
        # Reddit
        if hasattr(c, 'agency_reddit_account_id') and c.agency_reddit_account_id:
             pa = (
                db.query(PlatformAccount)
                .filter(PlatformAccount.platform == "reddit", PlatformAccount.account_id == c.agency_reddit_account_id)
                .first()
            )
             if not pa:
                pa = PlatformAccount(
                    client_id=c.id,
                    platform="reddit",
                    account_id=c.agency_reddit_account_id
                )
                db.add(pa)
                db.flush()
                db.add(ClientAccountGroup(
                    agency_id=agency_id,
                    client_id=c.id,
                    platform_account_id=pa.id
                ))
                # Move existing campaigns to this client
                from packages.db.models import Campaign
                db.query(Campaign).filter(Campaign.account_id == pa.id).update({
                    "client_id": c.id
                }, synchronize_session=False)
                migrated_count += 1
    
    if migrated_count > 0:
        db.commit()
        # Refresh lists after migration
        platform_accounts = (
            db.query(PlatformAccount)
            .join(Client)
            .filter(Client.agency_id == agency_id)
            .all()
        )
        groups_by_pa = {g.platform_account_id: g for g in db.query(ClientAccountGroup).filter(ClientAccountGroup.agency_id == agency_id).all()}

    accounts_out: List[schemas_agency.ClientManagerAccount] = []
    for pa in platform_accounts:
        group = groups_by_pa.get(pa.id)
        accounts_out.append(
            schemas_agency.ClientManagerAccount(
                id=pa.id,
                platform=pa.platform,
                account_id=pa.account_id,
                display_name=pa.account_id,
                client_id=pa.client_id,
                client_name=pa.client.name if pa.client else None,
                group_client_id=group.client_id if group else None,
                group_client_name=group.client.name if group else None,
                is_assigned=group is not None,
            )
        )

    unassigned = [a for a in accounts_out if not a.is_assigned]

    accounts_by_group_client: dict[int, List[schemas_agency.ClientManagerAccount]] = {}
    for a in accounts_out:
        target_cid = a.group_client_id or a.client_id
        if target_cid:
            accounts_by_group_client.setdefault(target_cid, []).append(a)

    client_details: List[schemas_agency.ClientManagerClientDetail] = []
    for c in clients:
        attached = accounts_by_group_client.get(c.id, [])
        platforms = sorted({a.platform for a in attached})
        summary = schemas_agency.ClientManagerClientSummary(
            id=c.id,
            name=c.name,
            industry=c.industry,
            account_count=len(attached),
            platforms=platforms,
            spend_mtd=0.0,
            avatar_color=getattr(c, 'avatar_color', None),
        )
        settings = settings_by_client.get(c.id)
        client_details.append(
            schemas_agency.ClientManagerClientDetail(
                client=summary,
                accounts=attached,
                portal_settings=schemas_agency.ClientPortalSettingsOut.from_orm(settings)
                if settings
                else None,
            )
        )

    return schemas_agency.ClientManagerSummary(
        unassigned_accounts=unassigned,
        clients=client_details,
    )


@router.post("/agency/{agency_id}/client-manager/assign", response_model=dict)
def assign_platform_accounts(
    agency_id: int,
    body: schemas_agency.ClientManagerAssignRequest,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """Assign platform accounts to a specific client. Supports virtual accounts and legacy columns."""
    ensure_agency_scope(ctx, agency_id)

    client = db.query(Client).filter(Client.id == body.client_id, Client.agency_id == agency_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found for this agency")

    processed_ids = []
    
    for item in body.accounts:
        pa = None
        if item.id and item.id > 0:
            pa = db.query(PlatformAccount).filter(PlatformAccount.id == item.id).first()
        elif item.platform and item.account_id:
            # Look up or create by platform/account_id
            pa = db.query(PlatformAccount).filter(
                PlatformAccount.platform == item.platform,
                PlatformAccount.account_id == item.account_id
            ).first()
            if not pa:
                pa = PlatformAccount(
                    client_id=body.client_id,
                    platform=item.platform,
                    account_id=item.account_id
                )
                db.add(pa)
                db.flush()

        if not pa:
            continue
            
        processed_ids.append(pa.id)
        pa.client_id = body.client_id
        
        # Modern routing
        existing_group = db.query(ClientAccountGroup).filter(ClientAccountGroup.platform_account_id == pa.id).first()
        if existing_group:
            existing_group.client_id = body.client_id
            existing_group.agency_id = agency_id
        else:
            db.add(ClientAccountGroup(
                agency_id=agency_id,
                client_id=body.client_id,
                platform_account_id=pa.id
            ))
        
        # Update internal campaigns to follow the account to the new client
        from packages.db.models import Campaign
        db.query(Campaign).filter(Campaign.account_id == pa.id).update({
            "client_id": body.client_id
        }, synchronize_session=False)

        # Legacy Column Sync
        if pa.platform == "meta":
            # Clear previous associations
            db.query(Client).filter(
                Client.agency_id == agency_id,
                Client.agency_meta_account_id == pa.account_id
            ).update({
                Client.agency_meta_account_id: None,
                Client.meta_account_status: "not_linked"
            }, synchronize_session=False)
            # Set new
            client.agency_meta_account_id = pa.account_id
            client.meta_account_status = "linked_manual"
        elif pa.platform == "reddit":
            if hasattr(Client, 'agency_reddit_account_id'):
                db.query(Client).filter(
                    Client.agency_id == agency_id,
                    getattr(Client, 'agency_reddit_account_id', None) == pa.account_id
                ).update({
                    'agency_reddit_account_id': None
                }, synchronize_session=False)
                setattr(client, 'agency_reddit_account_id', pa.account_id)

    db.commit()
    return {"success": True, "processed_count": len(processed_ids)}


@router.patch("/agency/{agency_id}/clients/{client_id}", response_model=schemas_agency.ClientOut)
def update_client_details(
    agency_id: int,
    client_id: int,
    update: schemas_agency.ClientUpdate,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    client = db.query(Client).filter(Client.id == client_id, Client.agency_id == agency_id).first()
    if not client: raise HTTPException(status_code=404, detail="Client not found")
    
    payload = update.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(client, field, value)
    
    db.commit()
    db.refresh(client)
    return client

@router.delete("/agency/{agency_id}/clients/{client_id}", response_model=dict)
def delete_client_and_unassign(
    agency_id: int,
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    client = db.query(Client).filter(Client.id == client_id, Client.agency_id == agency_id).first()
    if not client: raise HTTPException(status_code=404, detail="Client not found")
    
    # Detach all accounts first
    db.query(ClientAccountGroup).filter(ClientAccountGroup.client_id == client_id).delete()
    db.delete(client)
    db.commit()
    return {"success": True}

@router.post("/agency/{agency_id}/clients/{client_id}/accounts", response_model=dict)
def assign_accounts_to_specific_client_endpoint(
    agency_id: int,
    client_id: int,
    body: schemas_agency.ClientAccountAssignment,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    client = db.query(Client).filter(Client.id == client_id, Client.agency_id == agency_id).first()
    if not client: raise HTTPException(status_code=404, detail="Client not found")

    # Reuse existing assign logic internally
    return assign_platform_accounts(agency_id, schemas_agency.ClientManagerAssignRequest(client_id=client_id, accounts=body.accounts), db, ctx)

@router.delete("/agency/{agency_id}/clients/{client_id}/accounts/{account_id}", response_model=dict)
def detach_specific_account_endpoint(
    agency_id: int,
    client_id: int,
    account_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    group = db.query(ClientAccountGroup).filter(
        ClientAccountGroup.agency_id == agency_id,
        ClientAccountGroup.client_id == client_id,
        ClientAccountGroup.platform_account_id == account_id
    ).first()
    if group:
        db.delete(group)
        db.commit()
    return {"success": True}


@router.get("/api/agency/clients/{client_id}/access", response_model=schemas_agency.ClientPortalSettingsOut)
def get_client_access(
    agency_id: int,
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    settings = db.query(ClientPortalSettings).filter(ClientPortalSettings.client_id == client_id).first()
    if not settings: return ClientPortalSettings(client_id=client_id)
    return settings

@router.post("/api/agency/clients/{client_id}/access/link", response_model=dict)
def generate_magic_link(
    agency_id: int,
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    # Placeholder for token generation logic
    token = "magic_" + os.urandom(8).hex()
    return {"token": token, "expires_at": "2026-12-31T23:59:59"}

@router.get("/api/agency/clients/{client_id}/markup", response_model=schemas_agency.ClientPortalSettingsOut)
def get_client_markup(
    agency_id: int,
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    return get_client_access(agency_id, client_id, db, ctx)

@router.get("/api/agency/clients/{client_id}/display", response_model=schemas_agency.ClientPortalSettingsOut)
def get_client_display(
    agency_id: int,
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    return get_client_access(agency_id, client_id, db, ctx)


@router.post("/agency/{agency_id}/client-manager/detach", response_model=dict)
def detach_platform_account(
    agency_id: int,
    body: schemas_agency.ClientManagerDetachRequest,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """Detach a platform account from any client manager grouping (back to Unassigned)."""
    ensure_agency_scope(ctx, agency_id)

    group = (
        db.query(ClientAccountGroup)
        .filter(
            ClientAccountGroup.agency_id == agency_id,
            ClientAccountGroup.platform_account_id == body.platform_account_id,
        )
        .first()
    )
    if group:
        db.delete(group)
        db.commit()
    return {"success": True}


@router.patch("/clients/{client_id}/portal-settings", response_model=schemas_agency.ClientPortalSettingsOut)
def update_client_portal_settings(
    client_id: int,
    update: schemas_agency.ClientPortalSettingsUpdate,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    """Update per-client portal and markup/display settings."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    ensure_agency_scope(ctx, client.agency_id)

    settings = (
        db.query(ClientPortalSettings)
        .filter(ClientPortalSettings.client_id == client_id)
        .first()
    )
    if not settings:
        settings = ClientPortalSettings(client_id=client_id)
        db.add(settings)

    payload = update.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return schemas_agency.ClientPortalSettingsOut.from_orm(settings)


# ── Reddit Agency Endpoints ───────────────────────────────────────────────────

@router.post("/agency/{agency_id}/reddit/connect")
def connect_reddit_agency(
    agency_id: int,
    body: dict,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.reddit_agency_service import connect_reddit_agency as _connect

    code = body.get("code")
    redirect_uri = body.get("redirectUri")
    if not code:
        raise HTTPException(status_code=400, detail="OAuth code is required")

    try:
        return _connect(db, agency_id, code, user_id=ctx.get("user_id"), redirect_uri=redirect_uri)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect Reddit: {str(e)}")


@router.post("/agency/{agency_id}/reddit/disconnect")
def disconnect_reddit_agency(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.reddit_agency_service import disconnect_reddit_agency as _disconnect

    try:
        return _disconnect(db, agency_id, user_id=ctx.get("user_id"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agency/{agency_id}/reddit/status")
def get_reddit_agency_status(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.reddit_agency_service import get_reddit_status

    try:
        return get_reddit_status(db, agency_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/agency/{agency_id}/reddit/accounts")
def get_reddit_agency_accounts(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.reddit_agency_service import get_reddit_agency_accounts

    try:
        return get_reddit_agency_accounts(db, agency_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Reddit accounts: {str(e)}")


@router.post("/agency/{agency_id}/reddit/auto-link")
def auto_link_reddit_clients(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.reddit_agency_service import auto_link_reddit_clients

    try:
        return auto_link_reddit_clients(db, agency_id, user_id=ctx.get("user_id"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auto-link failed: {str(e)}")


@router.post("/clients/{client_id}/reddit/manual-link")
def manual_link_reddit_client(
    client_id: int,
    body: dict,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    from services.account_service.reddit_agency_service import manual_link_reddit_client

    ad_account_id = body.get("ad_account_id")
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="ad_account_id is required")

    try:
        return manual_link_reddit_client(
            db=db,
            client_id=client_id,
            ad_account_id=ad_account_id,
            agency_id=ctx.get("agency_id"),
            user_id=ctx.get("user_id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Agency does not own this client")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manual link failed: {str(e)}")


@router.get("/clients/{client_id}/reddit-insights")
def get_client_reddit_insights(
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    from services.account_service.reddit_agency_service import fetch_client_reddit_insights

    try:
        return fetch_client_reddit_insights(
            db,
            client_id=client_id,
            agency_id=ctx.get("agency_id"),
            user_id=ctx.get("user_id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Agency does not own this client")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Reddit insights: {str(e)}")


# ── Spotify Agency Endpoints ──────────────────────────────────────────────────

@router.post("/agency/{agency_id}/spotify/connect")
def connect_spotify_agency(
    agency_id: int,
    body: dict,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.spotify_agency_service import connect_spotify_agency as _connect

    code = body.get("code")
    redirect_uri = body.get("redirectUri")
    if not code:
        raise HTTPException(status_code=400, detail="OAuth code is required")

    try:
        return _connect(db, agency_id, code, user_id=ctx.get("user_id"), redirect_uri=redirect_uri)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect Spotify: {str(e)}")


@router.post("/agency/{agency_id}/spotify/disconnect")
def disconnect_spotify_agency(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.spotify_agency_service import disconnect_spotify_agency as _disconnect

    try:
        return _disconnect(db, agency_id, user_id=ctx.get("user_id"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agency/{agency_id}/spotify/status")
def get_spotify_agency_status(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.spotify_agency_service import get_spotify_status

    try:
        return get_spotify_status(db, agency_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/agency/{agency_id}/spotify/accounts")
def get_spotify_agency_accounts(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.spotify_agency_service import get_spotify_agency_accounts

    try:
        return get_spotify_agency_accounts(db, agency_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Spotify accounts: {str(e)}")


@router.post("/agency/{agency_id}/spotify/auto-link")
def auto_link_spotify_clients(
    agency_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_admin),
):
    ensure_agency_scope(ctx, agency_id)
    from services.account_service.spotify_agency_service import auto_link_spotify_clients

    try:
        return auto_link_spotify_clients(db, agency_id, user_id=ctx.get("user_id"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auto-link failed: {str(e)}")


@router.post("/clients/{client_id}/spotify/manual-link")
def manual_link_spotify_client(
    client_id: int,
    body: dict,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_member_or_above),
):
    from services.account_service.spotify_agency_service import manual_link_spotify_client

    ad_account_id = body.get("ad_account_id")
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="ad_account_id is required")

    try:
        return manual_link_spotify_client(
            db=db,
            client_id=client_id,
            ad_account_id=ad_account_id,
            agency_id=ctx.get("agency_id"),
            user_id=ctx.get("user_id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Agency does not own this client")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manual link failed: {str(e)}")


@router.get("/clients/{client_id}/spotify-insights")
def get_client_spotify_insights(
    client_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_any_member),
):
    from services.account_service.spotify_agency_service import fetch_client_spotify_insights

    try:
        return fetch_client_spotify_insights(
            db,
            client_id=client_id,
            agency_id=ctx.get("agency_id"),
            user_id=ctx.get("user_id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Agency does not own this client")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Spotify insights: {str(e)}")
