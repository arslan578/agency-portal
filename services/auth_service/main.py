import logging
from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import timedelta, datetime, timezone
from . import models, schemas, auth
from packages.db.database import engine, get_db

logger = logging.getLogger(__name__)

# models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kaivo Auth Service")

@app.post("/register", response_model=schemas.UserOut)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    from packages.db.models import Agency, AgencyMembership, Client, AgencyRole, PlanTier
    
    db_user = auth.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = auth.create_user(db=db, user=user)
    
    agency_name = user.company_name or f"{new_user.full_name or new_user.email.split('@')[0]}'s Agency"
    agency = Agency(
        name=agency_name,
        current_plan=PlanTier.FREE,
        credits=0.00,
        billing_status="active"
    )
    db.add(agency)
    db.commit()
    db.refresh(agency)
    
    membership = AgencyMembership(
        user_id=new_user.id,
        agency_id=agency.id,
        role=AgencyRole.ADMIN
    )
    db.add(membership)
    
    default_client = Client(
        agency_id=agency.id,
        name="Default Brand",
        is_active=True
    )
    db.add(default_client)
    db.commit()
    
    setattr(new_user, "tier", "TIER_0")
    setattr(new_user, "agency_id", str(agency.id))
    setattr(new_user, "agency_name", agency.name)
    setattr(new_user, "agency_role", "agency_admin")
    setattr(new_user, "agency_credits", 0.0)
    
    return new_user

def get_user_agency_context(db: Session, user_id: int) -> dict:
    """Get agency context for a user via AgencyMembership"""
    from packages.db.models import AgencyMembership, Agency
    
    membership = db.query(AgencyMembership).filter(
        AgencyMembership.user_id == user_id
    ).first()
    
    if membership:
        agency = db.query(Agency).filter(Agency.id == membership.agency_id).first()
        return {
            "agency_id": membership.agency_id,
            "agency_role": membership.role.value if membership.role else "agency_viewer",
            "agency_name": agency.name if agency else None,
            "agency_tier": agency.current_plan.value if agency and agency.current_plan else "free",
            "agency_credits": float(agency.credits) if agency else 0.0
        }
    return {"agency_id": None, "agency_role": None, "agency_name": None, "agency_tier": "free", "agency_credits": 0.0}

@app.post("/login", response_model=schemas.Token)
def login(form_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = auth.authenticate_user(db, form_data.email, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    agency_context = get_user_agency_context(db, user.id)
    
    access_token = auth.create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "agency_id": agency_context["agency_id"],
            "agency_role": agency_context["agency_role"]
        },
        expires_delta=timedelta(hours=auth.ACCESS_TOKEN_EXPIRE_HOURS)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/google", response_model=schemas.Token)
def google_login(login_data: schemas.GoogleLogin, db: Session = Depends(get_db)):
    from packages.db.models import Agency, AgencyMembership, Client, AgencyRole, PlanTier

    has_token = bool(login_data.id_token and login_data.id_token.strip())
    token_len = len(login_data.id_token) if login_data.id_token else 0
    logger.info("Google login attempt: has_id_token=%s, token_length=%s", has_token, token_len)

    try:
        id_info = auth.verify_google_token(login_data.id_token)
    except ValueError as e:
        logger.warning("Google login failed (ValueError): %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Google login failed (unexpected): %s", e)
        raise HTTPException(
            status_code=400,
            detail="Google Sign-In failed. Check server logs for details.",
        )

    if not id_info:
        logger.warning("Google login: verify_google_token returned no id_info")
        raise HTTPException(status_code=400, detail="Invalid Google Token")

    email = id_info.get('email')
    google_id = id_info.get('sub')
    name = id_info.get('name')
    
    user = db.query(models.User).filter(models.User.google_id == google_id).first()
    is_new_user = False
    
    if not user:
         user = auth.get_user_by_email(db, email)
         if user:
             user.google_id = google_id
             if not user.full_name: user.full_name = name
             db.commit()
             db.refresh(user)
         else:
             user_create = schemas.UserCreate(
                 email=email,
                 password=None,
                 full_name=name,
                 google_id=google_id
             )
             user = auth.create_user(db, user_create)
             is_new_user = True
    
    if is_new_user:
        agency_name = f"{name or email.split('@')[0]}'s Agency"
        agency = Agency(
            name=agency_name,
            current_plan=PlanTier.FREE,
            credits=0.00,
            billing_status="active"
        )
        db.add(agency)
        db.commit()
        db.refresh(agency)
        
        membership = AgencyMembership(
            user_id=user.id,
            agency_id=agency.id,
            role=AgencyRole.ADMIN
        )
        db.add(membership)
        
        default_client = Client(
            agency_id=agency.id,
            name="Default Brand",
            is_active=True
        )
        db.add(default_client)
        db.commit()
             
    agency_context = get_user_agency_context(db, user.id)
    
    access_token = auth.create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "agency_id": agency_context["agency_id"],
            "agency_role": agency_context["agency_role"]
        },
        expires_delta=timedelta(hours=auth.ACCESS_TOKEN_EXPIRE_HOURS)
    )
    logger.info("Google login success: email=%s user_id=%s", email, user.id)
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/refresh", response_model=schemas.Token)
def refresh_token(token: str = Depends(auth.oauth2_scheme), db: Session = Depends(get_db)):
    """
    Refresh an access token. Accepts expired tokens within a grace period (5 minutes).
    """
    from jose import jwt, JWTError
    from datetime import datetime
    
    try:
        # Decode token even if expired to get user info
        payload = jwt.decode(
            token, 
            auth.SECRET_KEY, 
            algorithms=[auth.ALGORITHM],
            options={"verify_exp": False}  # Don't verify expiration
        )
        
        email: str = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Check if token is expired
        exp = payload.get("exp")
        if exp:
            exp_datetime = datetime.utcfromtimestamp(exp)
            now = datetime.utcnow()
            time_since_expiry = (now - exp_datetime).total_seconds()
            
            # Grace period: 5 minutes (300 seconds)
            GRACE_PERIOD_SECONDS = 300
            if time_since_expiry > GRACE_PERIOD_SECONDS:
                raise HTTPException(status_code=401, detail="Token expired beyond grace period")
        
        # Get user to verify they still exist
        user = auth.get_user_by_email(db, email)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        agency_context = get_user_agency_context(db, user.id)
        
        new_token = auth.create_access_token(
            data={
                "sub": user.email,
                "user_id": user.id,
                "agency_id": agency_context["agency_id"],
                "agency_role": agency_context["agency_role"]
            },
            expires_delta=timedelta(hours=auth.ACCESS_TOKEN_EXPIRE_HOURS)
        )
        
        return {"access_token": new_token, "token_type": "bearer"}
        
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token refresh failed: {str(e)}")

@app.get("/me", response_model=schemas.UserOut)
def read_users_me(token: str = Depends(auth.oauth2_scheme), db: Session = Depends(get_db)):
    user = auth.get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    try:
        agency_context = get_user_agency_context(db, user.id)
        
        tier_map = {
            "free": "TIER_0",
            "starter": "TIER_1", 
            "growth": "TIER_2",
            "scale": "TIER_3",
            "enterprise": "TIER_4"
        }
        tier_str = tier_map.get(agency_context.get("agency_tier", "free"), "TIER_0")
        
        setattr(user, "tier", tier_str)
        setattr(user, "agency_id", str(agency_context["agency_id"]) if agency_context["agency_id"] else None)
        setattr(user, "agency_name", agency_context.get("agency_name"))
        setattr(user, "agency_role", agency_context.get("agency_role"))
        setattr(user, "agency_credits", agency_context.get("agency_credits", 0.0))

    except Exception as e:
        print(f"Error fetching agency context: {e}")
        setattr(user, "tier", "TIER_0")
        setattr(user, "agency_id", None)
        setattr(user, "agency_name", None)
        setattr(user, "agency_role", None)
        setattr(user, "agency_credits", 0.0)

    setattr(user, "has_password", bool(user.hashed_password))
    return user

@app.patch("/profile", response_model=schemas.UserOut)
def update_user_profile(
    profile_update: schemas.UserUpdate,
    token: str = Depends(auth.oauth2_scheme),
    db: Session = Depends(get_db)
):
    user = auth.get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    # Update fields only if provided
    if profile_update.full_name is not None:
        user.full_name = profile_update.full_name
    if profile_update.phone_number is not None:
        user.phone_number = profile_update.phone_number
    if profile_update.company_name is not None:
        user.company_name = profile_update.company_name
    if profile_update.avatar_url is not None:
        user.avatar_url = profile_update.avatar_url
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    try:
        agency_context = get_user_agency_context(db, user.id)
        
        tier_map = {
            "free": "TIER_0",
            "starter": "TIER_1",
            "growth": "TIER_2",
            "scale": "TIER_3",
            "enterprise": "TIER_4"
        }
        tier_str = tier_map.get(agency_context.get("agency_tier", "free"), "TIER_0")
        
        setattr(user, "tier", tier_str)
        setattr(user, "agency_id", str(agency_context["agency_id"]) if agency_context["agency_id"] else None)
        setattr(user, "agency_name", agency_context.get("agency_name"))
        setattr(user, "agency_role", agency_context.get("agency_role"))
        setattr(user, "agency_credits", agency_context.get("agency_credits", 0.0))

    except Exception as e:
        print(f"Error fetching agency context: {e}")
        setattr(user, "tier", "TIER_0")
        setattr(user, "agency_id", None)
        setattr(user, "agency_name", None)
        setattr(user, "agency_role", None)
        setattr(user, "agency_credits", 0.0)

    setattr(user, "has_password", bool(user.hashed_password))
    return user


@app.post("/set-password")
def set_password(
    body: schemas.SetPassword,
    token: str = Depends(auth.oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = auth.get_current_user(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    if body.password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    pwd = body.password
    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isupper() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.islower() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not any(c in "!@#$%^&*()_+-=[]{}|;:',.<>?/`~" for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character")

    user.hashed_password = auth.pwd_context.hash(body.password)
    db.commit()

    return {"success": True, "message": "Password set successfully"}


# --- Role Enforcement ---

def check_permissions(user: schemas.UserOut, required_action: str):
    """
    Enforce role-based access control.
    """
    # Check for Client Viewer restrictions
    # In a real app, we'd look up the user's role in ClientUserPermission
    # For now, we assume the role is passed or looked up here.
    
    # Mock logic: If email contains "viewer", treat as client_viewer
    if "viewer" in user.email:
        restricted_actions = [
            "create_goal", "create_audience", "create_budget", 
            "simulate_reach", "validate_policy", "launch_campaign", 
            "rebalance_budget"
        ]
        if required_action in restricted_actions:
            raise HTTPException(
                status_code=403, 
                detail=f"Permission denied: Client Viewers cannot perform '{required_action}'"
            )
    return True


# --- Magic Link Verification ---

@app.get("/verify-token")
def verify_magic_token(token: str, db: Session = Depends(get_db)):
    """
    Public endpoint — verify a magic link token and issue a JWT.
    Creates the user account if it doesn't exist, and establishes agency membership.
    Supports both MagicToken (admin onboarding) and AgencyInvite (team invite) tokens.
    """
    from packages.db.models import MagicToken, AgencyMembership, AgencyRole, AgencyInvite, InviteStatus

    if not token or not token.strip():
        raise HTTPException(status_code=400, detail="Token parameter is required")

    magic = db.query(MagicToken).filter(MagicToken.token == token).first()
    if not magic:
        # --- Fallback: check AgencyInvite table for team invite tokens ---
        invite = db.query(AgencyInvite).filter(
            AgencyInvite.token == token,
            AgencyInvite.status == InviteStatus.PENDING,
        ).first()
        if not invite:
            raise HTTPException(status_code=404, detail="Invalid link")

        # Validate expiry
        exp = invite.expires_at if invite.expires_at.tzinfo else invite.expires_at.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            invite.status = InviteStatus.EXPIRED
            db.commit()
            raise HTTPException(status_code=400, detail="This invite link has expired")

        # Create or fetch the user
        user = auth.get_user_by_email(db, invite.email)
        if not user:
            user_create = schemas.UserCreate(email=invite.email, password=None)
            user = auth.create_user(db, user_create)

        user.last_login_at = datetime.now(timezone.utc)
        user.is_active = True

        # Create membership if not already present
        existing_membership = db.query(AgencyMembership).filter(
            AgencyMembership.user_id == user.id,
            AgencyMembership.agency_id == invite.agency_id,
        ).first()
        if not existing_membership:
            membership = AgencyMembership(
                user_id=user.id,
                agency_id=invite.agency_id,
                role=invite.role or AgencyRole.VIEWER,
            )
            db.add(membership)

        # Mark invite as accepted
        invite.status = InviteStatus.ACCEPTED
        invite.accepted_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)

        agency_context = get_user_agency_context(db, user.id)
        access_token = auth.create_access_token(
            data={
                "sub": user.email,
                "user_id": user.id,
                "agency_id": agency_context["agency_id"],
                "agency_role": agency_context["agency_role"],
            },
            expires_delta=timedelta(hours=auth.ACCESS_TOKEN_EXPIRE_HOURS),
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "role": agency_context.get("agency_role"),
                "agency_id": agency_context.get("agency_id"),
                "is_superuser": user.is_superuser,
            },
        }

    GRACE_PERIOD_MINUTES = 5

    if magic.used_at is not None:
        used_at = magic.used_at if magic.used_at.tzinfo else magic.used_at.replace(tzinfo=timezone.utc)
        since_used = (datetime.now(timezone.utc) - used_at).total_seconds()
        if since_used > GRACE_PERIOD_MINUTES * 60:
            raise HTTPException(status_code=400, detail="This link has already been used")
        # Within grace period — allow re-verification, just issue a fresh JWT
        logger.info("Token re-verified within grace period (%ds) for %s", int(since_used), magic.email)
    else:
        exp = magic.expires_at if magic.expires_at.tzinfo else magic.expires_at.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="This link has expired")
        magic.used_at = datetime.now(timezone.utc)
        db.flush()

    user = auth.get_user_by_email(db, magic.email)
    if not user:
        user_create = schemas.UserCreate(
            email=magic.email,
            password=None,
        )
        user = auth.create_user(db, user_create)

    user.last_login_at = datetime.now(timezone.utc)
    user.is_active = True

    if magic.agency_id:
        existing_membership = db.query(AgencyMembership).filter(
            AgencyMembership.user_id == user.id,
            AgencyMembership.agency_id == magic.agency_id,
        ).first()

        if not existing_membership:
            membership = AgencyMembership(
                user_id=user.id,
                agency_id=magic.agency_id,
                role=magic.role or AgencyRole.VIEWER,
            )
            db.add(membership)
    else:
        # No explicit agency_id on the magic token. If the user does not yet have
        # an agency membership and this is an admin invite, create a new agency
        # and attach them as ADMIN so the portal has proper context.
        from packages.db.models import Agency, Client, PlanTier

        existing_ctx = get_user_agency_context(db, user.id)
        if not existing_ctx.get("agency_id") and magic.role == AgencyRole.ADMIN:
            agency_name = f"{user.full_name or user.email.split('@')[0]}'s Agency"
            agency = Agency(
                name=agency_name,
                current_plan=PlanTier.FREE,
                credits=0.00,
                billing_status="active",
            )
            db.add(agency)
            db.commit()
            db.refresh(agency)

            membership = AgencyMembership(
                user_id=user.id,
                agency_id=agency.id,
                role=AgencyRole.ADMIN,
            )
            db.add(membership)

            # Create a default client so the dashboard has something to attach to,
            # mirroring the /register and Google sign-in flows.
            default_client = Client(
                agency_id=agency.id,
                name="Default Brand",
                is_active=True,
            )
            db.add(default_client)

    db.commit()
    db.refresh(user)

    agency_context = get_user_agency_context(db, user.id)

    access_token = auth.create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "agency_id": agency_context["agency_id"],
            "agency_role": agency_context["agency_role"],
        },
        expires_delta=timedelta(hours=auth.ACCESS_TOKEN_EXPIRE_HOURS),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": agency_context.get("agency_role"),
            "agency_id": agency_context.get("agency_id"),
            "is_superuser": user.is_superuser,
        },
    }


@app.post("/logout")
def logout():
    """Backend logout endpoint. Session invalidation is handled client-side by NextAuth."""
    return {"success": True}
