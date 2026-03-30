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
from packages.db.models import Agency, Client, AgencyMembership, AgencyRole, User, AgencyInvite, InviteStatus, Campaign, CampaignStatus
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
    payload = build_client_hierarchy(db, agency_id, period=period, client_id=client_id)
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
        raise HTTPException(status_code=500, detail=f"Failed to fetch insights: {str(e)}")
