"""
Auth router — /api/v1/auth/login

Single env-based admin (no users table).
POST /auth/login → {access_token, token_type}
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, verify_password

bearer_dep = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/auth", tags=["🔐 Auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login — get a JWT token",
    description="Authenticate with admin credentials. Returns a Bearer token valid for 24h.",
)
async def login(payload: LoginRequest) -> TokenResponse:
    if payload.email != settings.admin_email:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not settings.admin_password_hash:
        raise HTTPException(status_code=500, detail="ADMIN_PASSWORD_HASH not configured")
    if not verify_password(payload.password, settings.admin_password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(subject=payload.email)
    return TokenResponse(access_token=token)


@router.get(
    "/me",
    summary="Current user — verify your token",
    description="Returns the logged-in admin email. Use this to confirm your token is valid.",
)
async def me(credentials=Depends(bearer_dep)):
    """Return current authenticated admin info."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated — include Authorization: Bearer <token>")
    try:
        email = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return {"email": email, "role": "admin"}
