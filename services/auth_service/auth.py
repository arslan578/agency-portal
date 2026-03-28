from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer
from . import models, schemas
import os
import logging

logger = logging.getLogger(__name__)

# Load .env from project root (same as api_gateway/database) so GOOGLE_CLIENT_ID matches frontend
try:
    from dotenv import load_dotenv
    from pathlib import Path
    _root = Path(__file__).resolve().parent.parent.parent  # auth_service -> services -> project root
    _env = _root / ".env"
    if _env.exists():
        load_dotenv(dotenv_path=_env)
except ImportError:
    pass

# Google Auth
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
except ImportError:
    id_token = None
    google_requests = None

# PyJWT fallback: when Google returns JWK certs, google-auth uses PyJWT and ignores clock_skew.
# We verify with PyJWT + leeway when we get "Token expired".
_GOOGLE_OAUTH2_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

SECRET_KEY = os.getenv("SECRET_KEY", "TEST_SECRET_KEY_CHANGE_IN_PROD")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID") or os.getenv("NEXT_PUBLIC_GOOGLE_CLIENT_ID")
# Allow token verification when server clock is ahead/behind (e.g. 21600 = 6 hours)
GOOGLE_TOKEN_CLOCK_SKEW_SECONDS = int(os.getenv("GOOGLE_TOKEN_CLOCK_SKEW_SECONDS", "60"))
if GOOGLE_TOKEN_CLOCK_SKEW_SECONDS > 60:
    logger.info("Google token clock_skew=%s seconds (from env)", GOOGLE_TOKEN_CLOCK_SKEW_SECONDS)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def verify_google_token(token: str):
    if not token or not token.strip():
        logger.warning("Google login: id_token is empty or missing")
        raise ValueError("id_token is required")
    if not id_token:
        # If library not installed, mock it for dev/test or fail
        if os.getenv("TEST_MODE") == "true":
             return {"email": "test@example.com", "sub": "mock_google_id", "name": "Test User"}
        logger.error("Google login: google-auth library not installed")
        raise Exception("google-auth library not installed")
    if not GOOGLE_CLIENT_ID:
        logger.error("Google login: GOOGLE_CLIENT_ID not configured in backend (.env)")
        raise Exception("GOOGLE_CLIENT_ID not configured in backend")
    try:
        # Verify token with Google (client_id must match the one used by the frontend to get the token)
        id_info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=GOOGLE_TOKEN_CLOCK_SKEW_SECONDS,
        )
        logger.info("Google token verified successfully for email=%s", id_info.get("email"))
        return id_info
    except ValueError as e:
        err_msg = str(e)
        # When Google returns JWK certs, google-auth uses PyJWT and does NOT pass clock_skew, so we get "Token expired".
        # Retry with PyJWT + leeway so clock skew is applied.
        if "Token expired" in err_msg or "expired" in err_msg.lower():
            try:
                id_info = _verify_google_token_with_leeway(token)
                if id_info:
                    logger.info("Google token verified (with leeway) for email=%s", id_info.get("email"))
                    return id_info
            except Exception as leeway_e:
                logger.warning("Google token leeway verification failed: %s", leeway_e)
        logger.warning("Google token verification failed: %s", e)
        raise ValueError(f"Google token invalid: {e!s}") from e


def _verify_google_token_with_leeway(token: str):
    """Verify Google ID token using PyJWT with a large leeway window.

    Root cause: Windows system clock can be hours ahead of real UTC, making fresh
    Google tokens appear "expired" to the server. We verify signature + audience +
    issuer, then apply our own exp check with a 24-hour leeway window.
    The permanent fix is to sync the system clock: run 'w32tm /resync' in Admin PowerShell.
    """
    import time

    # Minimum 24hr leeway to handle severely misconfigured clocks (like 13hr ahead)
    leeway_seconds = max(GOOGLE_TOKEN_CLOCK_SKEW_SECONDS, 86400)

    try:
        import jwt as pyjwt
        try:
            from jwt import PyJWKClient
        except ImportError:
            from jwt.jwks_client import PyJWKClient
    except ImportError:
        logger.warning("PyJWT not available for leeway fallback")
        return None

    jwks_client = PyJWKClient(_GOOGLE_OAUTH2_JWKS_URL)
    signing_key = jwks_client.get_signing_key_from_jwt(token)

    # Decode with verify_exp=False so PyJWT does not raise — we apply our own leeway below
    payload = pyjwt.decode(
        token,
        signing_key.key,
        algorithms=[signing_key.algorithm_name or "RS256"],
        audience=GOOGLE_CLIENT_ID,
        options={"verify_exp": False, "verify_nbf": False},
    )

    if payload.get("iss") not in _GOOGLE_ISSUERS:
        raise ValueError("Wrong issuer in Google token")

    exp = payload.get("exp")
    now = int(time.time())
    clock_diff = (now - exp) if exp else 0

    logger.info(
        "Google token leeway check: exp=%s server_now=%s clock_diff=%ss leeway=%ss",
        exp, now, clock_diff, leeway_seconds,
    )

    if exp is not None and clock_diff > leeway_seconds:
        logger.error(
            "Google token rejected even with %ss leeway (clock_diff=%ss). "
            "Run 'w32tm /resync' in Admin PowerShell to sync Windows clock.",
            leeway_seconds, clock_diff,
        )
        raise ValueError(
            f"Token clock_diff ({clock_diff}s) exceeds leeway ({leeway_seconds}s). "
            "Sync system clock: run 'w32tm /resync' in Admin PowerShell."
        )

    return payload

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password) if user.password else None
    
    db_user = models.User(
        email=user.email, 
        hashed_password=hashed_password,
        full_name=user.full_name,
        phone_number=user.phone_number,
        company_name=user.company_name,
        google_id=user.google_id
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, email: str, password: str):
    user = get_user_by_email(db, email)
    if not user:
        return False
    # If user has no password (google only) and tries password login, fail
    if not user.hashed_password:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(db: Session, token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
    except JWTError:
        return None
    return get_user_by_email(db, email=email)
