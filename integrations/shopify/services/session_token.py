"""
Shopify Session Token Verification

Implements JWT verification for Shopify session tokens used in embedded apps.
Required for Shopify App Store compliance: "Using session tokens for user authentication"

Session tokens:
- Are JWTs signed by Shopify using the shared secret (SHOPIFY_API_SECRET)
- Expire after 1 minute
- Contain shop info (iss, dest), user info (sub), and audience (aud = client ID)
- Must be verified on every request from embedded app frontend

References:
- https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
- https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens/set-up-session-tokens
"""

import jwt
import os
from typing import Dict, Any, Optional
from datetime import datetime
import structlog

logger = structlog.get_logger()

# Get Shopify credentials from environment
SHOPIFY_API_KEY = os.getenv("SHOPIFY_API_KEY", "")
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET", "")


class SessionTokenError(Exception):
    """Exception raised for session token verification failures."""
    pass


def verify_session_token(token: str) -> Dict[str, Any]:
    """
    Verify Shopify session token (JWT).
    
    Validates:
    - JWT signature using SHOPIFY_API_SECRET
    - Token expiration (exp)
    - Token activation time (nbf - not before)
    - Audience matches SHOPIFY_API_KEY (aud)
    - Issuer is a Shopify admin domain (iss)
    
    Args:
        token: Session token JWT from Authorization header (without "Bearer " prefix)
    
    Returns:
        Dict with decoded token payload containing:
            - iss: Shop's admin domain (e.g., "https://example.myshopify.com/admin")
            - dest: Shop's domain (e.g., "https://example.myshopify.com")
            - aud: Client ID (matches SHOPIFY_API_KEY)
            - sub: User ID
            - exp: Expiration timestamp
            - nbf: Not before timestamp
            - iat: Issued at timestamp
            - jti: Unique JWT ID
            - sid: Session ID
    
    Raises:
        SessionTokenError: If token is invalid, expired, or verification fails
    
    Example:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        try:
            payload = verify_session_token(token)
            shop_domain = payload["dest"].replace("https://", "").replace("http://", "")
            user_id = payload["sub"]
        except SessionTokenError as e:
            # Return 401 Unauthorized
            raise HTTPException(status_code=401, detail=str(e))
    """
    if not token:
        raise SessionTokenError("Session token is missing")
    
    if not SHOPIFY_API_SECRET:
        logger.error(
            "shopify_session_token_no_secret",
            message="SHOPIFY_API_SECRET not set - cannot verify session tokens"
        )
        raise SessionTokenError("Server configuration error: API secret not configured")
    
    if not SHOPIFY_API_KEY:
        logger.error(
            "shopify_session_token_no_api_key",
            message="SHOPIFY_API_KEY not set - cannot verify audience"
        )
        raise SessionTokenError("Server configuration error: API key not configured")
    
    try:
        # Decode and verify JWT
        # Shopify uses HS256 algorithm and signs with API secret
        payload = jwt.decode(
            token,
            SHOPIFY_API_SECRET,
            algorithms=["HS256"],
            audience=SHOPIFY_API_KEY,  # aud must match our app's client ID
            options={
                "verify_signature": True,
                "verify_exp": True,  # Check expiration
                "verify_nbf": True,  # Check not before
                "verify_aud": True,  # Check audience
                "require": ["exp", "nbf", "iat", "iss", "dest", "aud", "sub"]  # Required fields
            }
        )
        
        # Additional validation: iss should be a Shopify admin domain
        iss = payload.get("iss", "")
        if not iss.endswith(".myshopify.com/admin") and not iss.endswith(".myshopify.io/admin"):
            logger.warning(
                "shopify_session_token_invalid_issuer",
                issuer=iss,
                message="Session token issuer is not a Shopify admin domain"
            )
            raise SessionTokenError(f"Invalid issuer: {iss}")
        
        # Log successful verification
        logger.info(
            "shopify_session_token_verified",
            shop_domain=payload.get("dest", "").replace("https://", "").replace("http://", ""),
            user_id=payload.get("sub"),
            expires_at=datetime.fromtimestamp(payload.get("exp", 0)).isoformat() if payload.get("exp") else None
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        logger.warning(
            "shopify_session_token_expired",
            message="Session token has expired (tokens expire after 1 minute)"
        )
        raise SessionTokenError("Session token expired")
    
    except jwt.InvalidAudienceError:
        logger.warning(
            "shopify_session_token_invalid_audience",
            message="Session token audience does not match app client ID"
        )
        raise SessionTokenError("Session token audience mismatch")
    
    except jwt.InvalidSignatureError:
        logger.warning(
            "shopify_session_token_invalid_signature",
            message="Session token signature is invalid"
        )
        raise SessionTokenError("Invalid session token signature")
    
    except jwt.ImmatureSignatureError:
        logger.warning(
            "shopify_session_token_not_yet_valid",
            message="Session token is not yet valid (nbf)"
        )
        raise SessionTokenError("Session token not yet valid")
    
    except jwt.DecodeError as e:
        logger.warning(
            "shopify_session_token_decode_error",
            error=str(e),
            message="Failed to decode session token"
        )
        raise SessionTokenError(f"Failed to decode session token: {str(e)}")
    
    except Exception as e:
        logger.error(
            "shopify_session_token_verification_error",
            error=str(e),
            message="Unexpected error during session token verification"
        )
        raise SessionTokenError(f"Session token verification failed: {str(e)}")


def get_shop_from_session_token(token: str) -> str:
    """
    Extract shop domain from session token without full verification.
    Useful for logging/debugging before verification.
    
    Args:
        token: Session token JWT
    
    Returns:
        Shop domain (e.g., "example.myshopify.com")
    
    Note: This does NOT verify the token. Always call verify_session_token() first.
    """
    try:
        # Decode without verification (for extracting shop info only)
        unverified = jwt.decode(token, options={"verify_signature": False})
        dest = unverified.get("dest", "")
        # Remove https:// or http://
        shop = dest.replace("https://", "").replace("http://", "")
        return shop
    except Exception:
        return "unknown"
