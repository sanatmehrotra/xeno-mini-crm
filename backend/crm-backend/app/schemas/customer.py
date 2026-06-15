"""
Pydantic v2 schemas for Customer endpoints.

Naming convention:
  CustomerCreate  — POST /customers body
  CustomerImport  — single item in POST /customers/import list
  CustomerOut     — response DTO
  CustomerListOut — paginated list response
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CustomerCreate(BaseModel):
    """Single customer creation payload."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = None
    external_id: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class CustomerImport(BaseModel):
    """
    One record in the bulk import list.
    Same fields as CustomerCreate — kept separate so import-specific
    validation rules can diverge later without affecting the single-create path.
    """
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = None
    external_id: str | None = None
    total_spent: float = 0.0
    order_count: int = 0
    attributes: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class CustomerOut(BaseModel):
    """Full customer detail response."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    external_id: str | None
    name: str
    email: str
    phone: str | None
    total_spent: float
    order_count: int
    first_purchase_at: datetime | None
    last_purchase_at: datetime | None
    attributes: dict[str, Any]
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class CustomerListOut(BaseModel):
    """Paginated customer list (data + meta envelope)."""
    data: list[CustomerOut]
    meta: dict[str, Any]
