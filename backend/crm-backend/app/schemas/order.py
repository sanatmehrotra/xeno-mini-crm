"""
Pydantic v2 schemas for Order endpoints.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class OrderItem(BaseModel):
    """One line item in an order. Accepts both 'qty' and 'quantity' field names."""
    name: str
    qty: int = Field(1, ge=1)
    price: float = Field(..., ge=0)

    @model_validator(mode="before")
    @classmethod
    def normalise_quantity(cls, data):
        if isinstance(data, dict) and "quantity" in data and "qty" not in data:
            data = {**data, "qty": data["quantity"]}
        return data


class OrderCreate(BaseModel):
    """Single order creation payload."""
    customer_id: uuid.UUID
    amount: float = Field(..., ge=0)
    items: list[OrderItem] = Field(default_factory=list)
    channel: str | None = None  # online | offline | app
    status: str = "completed"
    ordered_at: datetime
    external_id: str | None = None


class OrderImport(BaseModel):
    """
    One record in bulk order import.
    Accepts customer_email as an alternative to customer_id
    so import files don't need to pre-resolve UUIDs.
    """
    customer_id: uuid.UUID | None = None
    customer_email: str | None = None  # resolved to customer_id on import
    amount: float = Field(..., ge=0)
    items: list[OrderItem] = Field(default_factory=list)
    channel: str | None = None
    status: str = "completed"
    ordered_at: datetime
    external_id: str | None = None


class OrderOut(BaseModel):
    """Order detail response."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    customer_id: uuid.UUID
    external_id: str | None
    amount: float
    items: list[Any]
    channel: str | None
    status: str
    ordered_at: datetime
    created_at: datetime
