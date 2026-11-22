import secrets

from fastapi import Header, HTTPException, status

from .config import settings


async def require_internal_key(x_internal_key: str = Header(default="")) -> None:
    """All routes are called only by the Node API with a shared key (NFR-6)."""
    if not secrets.compare_digest(x_internal_key, settings.internal_api_key):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid internal API key")
