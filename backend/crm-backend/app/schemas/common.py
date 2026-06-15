"""
Shared response envelope schema.

All API responses use one of these three shapes (spec Section 7):
  success   → {"data": ..., "meta": ...}
  error     → {"error": {"code": ..., "message": ..., "status": ...}}
  accepted  → {"data": {"job_id": ..., "status": "queued", "recipients": ...}}
"""

from typing import Any

from pydantic import BaseModel


def success(data: Any, meta: dict | None = None) -> dict:
    """Wrap a successful response."""
    return {"data": data, "meta": meta or {}}


def error(code: str, message: str, status: int) -> dict:
    """Wrap an error response."""
    return {"error": {"code": code, "message": message, "status": status}}


def accepted(job_id: str, status: str, recipients: int) -> dict:
    """Wrap an async-accepted response (campaign launch etc.)."""
    return {"data": {"job_id": job_id, "status": status, "recipients": recipients}}
