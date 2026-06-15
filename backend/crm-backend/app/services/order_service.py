"""
Order service — business logic for order creation and bulk import.

Side-effects on every order create/import:
1. Resolve customer_id (from UUID or email).
2. Insert the order row.
3. Update customer aggregates (total_spent, order_count, first/last_purchase_at)
   atomically in the same transaction.
4. Trigger attribution check (Phase 11 — stubbed here as a no-op).
"""

import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import customer_repo, order_repo
from app.schemas.order import OrderCreate, OrderImport


async def _resolve_customer(db: AsyncSession, customer_id: uuid.UUID | None, email: str | None):
    """Return a Customer, resolving from email if UUID not provided. Raises 404."""
    if customer_id:
        customer = await customer_repo.get_by_id(db, customer_id)
    elif email:
        customer = await customer_repo.get_by_email(db, email)
    else:
        raise HTTPException(status_code=422, detail="customer_id or customer_email required")

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


async def _create_order_and_update_aggregates(
    db: AsyncSession, customer_id: uuid.UUID, data: dict
):
    """
    Insert order + update customer aggregates in one transaction.
    The session commit happens at the router level via get_db_dep.
    """
    order = await order_repo.create(db, {**data, "customer_id": customer_id})
    await customer_repo.update_aggregates(
        db,
        customer_id,
        total_spent_delta=float(order.amount),
        first_purchase_at=order.ordered_at,
        last_purchase_at=order.ordered_at,
    )
    # Phase 11: run attribution check
    from app.services.attribution_service import attribute_order
    await attribute_order(db, order)
    return order


async def create_order(db: AsyncSession, payload: OrderCreate):
    """Create a single order with aggregate side-effects."""
    customer = await _resolve_customer(db, payload.customer_id, None)

    # Dedup by external_id if provided
    if payload.external_id:
        existing = await order_repo.get_by_external_id(db, payload.external_id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Order with external_id {payload.external_id} already exists",
            )

    data = payload.model_dump(exclude={"customer_id"})
    # Serialize items to plain dicts for JSONB storage
    data["items"] = [item.model_dump() for item in payload.items]
    return await _create_order_and_update_aggregates(db, customer.id, data)


async def import_orders(db: AsyncSession, records: list[OrderImport]) -> dict[str, int]:
    """
    Bulk import orders. Dedup by external_id (skip if exists).
    Returns {"created": n, "skipped": m}.
    """
    created = skipped = 0
    for record in records:
        # Skip duplicate external_id
        if record.external_id:
            existing = await order_repo.get_by_external_id(db, record.external_id)
            if existing:
                skipped += 1
                continue

        customer = await _resolve_customer(db, record.customer_id, record.customer_email)

        data = record.model_dump(exclude={"customer_id", "customer_email"})
        data["items"] = [item.model_dump() for item in record.items]
        await _create_order_and_update_aggregates(db, customer.id, data)
        created += 1

    return {"created": created, "skipped": skipped}


async def list_orders(
    db: AsyncSession,
    customer_id: uuid.UUID | None,
    from_dt,
    to_dt,
):
    return await order_repo.list_orders(
        db, customer_id=customer_id, from_dt=from_dt, to_dt=to_dt
    )
