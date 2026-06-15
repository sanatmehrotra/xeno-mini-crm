"""
FastAPI dependency for JWT authentication.

Usage in routers:
    from app.dependencies import get_current_user
    @router.get("/protected")
    async def protected(user: str = Depends(get_current_user)):
        ...
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> str:
    """
    Validate the Bearer JWT and return the admin email (sub claim).
    Raises 401 if the token is missing, expired, or invalid.
    """
    try:
        email = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
    return email
