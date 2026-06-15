"""
Security helpers: JWT issuance/validation and HMAC signature verification.

JWT: used for admin authentication (single env-based admin, no users table).
HMAC: used to validate callbacks from channel-service (constant-time compare
      to prevent timing attacks).
"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# bcrypt context for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the bcrypt hash."""
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    """Return bcrypt hash of plain (used in scripts/hash_password.py)."""
    return pwd_context.hash(plain)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(subject: str) -> str:
    """
    Issue a JWT with `sub` = subject (admin email) and expiry from settings.
    """
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str:
    """
    Decode and validate a JWT. Returns the `sub` claim.
    Raises ValueError on any validation failure.
    """
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        subject: str = payload.get("sub")
        if subject is None:
            raise ValueError("Token missing sub claim")
        return subject
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc


# ---------------------------------------------------------------------------
# HMAC helpers (channel-service callback validation)
# ---------------------------------------------------------------------------

def compute_hmac(body: bytes, secret: str) -> str:
    """Return HMAC-SHA256 hex digest of body using secret."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_hmac(body: bytes, signature: str, secret: str) -> bool:
    """
    Constant-time comparison of provided signature against expected HMAC.
    Returns False if the signature doesn't match — never raises.
    """
    expected = compute_hmac(body, secret)
    return hmac.compare_digest(expected, signature)
