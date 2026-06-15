"""
Customer service — business logic for customer creation and bulk import.

Rules:
- Dedup by email (upsert on import).
- Single-create raises 409 if email already exists.
"""

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import customer_repo
from app.schemas.customer import CustomerCreate, CustomerImport


async def get_customer(db: AsyncSession, customer_id: uuid.UUID):
    """
    Fetch a customer by ID. Raises 404 if not found.
    """
    customer = await customer_repo.get_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


async def list_customers(
    db: AsyncSession,
    *,
    page: int,
    limit: int,
    search: str | None,
    sort_by: str,
    order: str,
):
    """Return (customers, total) for pagination."""
    return await customer_repo.list_customers(
        db, page=page, limit=limit, search=search, sort_by=sort_by, order=order
    )


async def create_customer(db: AsyncSession, payload: CustomerCreate):
    """
    Create a single customer.
    Raises 409 if email already registered.
    """
    existing = await customer_repo.get_by_email(db, payload.email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Customer with email {payload.email} already exists",
        )
    data = payload.model_dump()
    return await customer_repo.create(db, data)


async def import_customers(db: AsyncSession, records: list[CustomerImport]) -> dict[str, int]:
    """
    Bulk upsert customers by email.
    Returns {"created": n, "updated": m, "total": k}.
    """
    created = updated = 0
    for record in records:
        data = record.model_dump()
        _, is_new = await customer_repo.upsert_by_email(db, data)
        if is_new:
            created += 1
        else:
            updated += 1
    return {"created": created, "updated": updated, "total": created + updated}
