"""
Order repository — all DB queries for the Order model.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order


async def get_by_id(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    result = await db.execute(select(Order).where(Order.id == order_id))
    return result.scalar_one_or_none()


async def get_by_external_id(db: AsyncSession, external_id: str) -> Order | None:
    result = await db.execute(select(Order).where(Order.external_id == external_id))
    return result.scalar_one_or_none()


async def list_orders(
    db: AsyncSession,
    *,
    customer_id: uuid.UUID | None = None,
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
    limit: int = 100,
) -> list[Order]:
    """List orders, optionally filtered by customer and date range."""
    q = select(Order)
    if customer_id:
        q = q.where(Order.customer_id == customer_id)
    if from_dt:
        q = q.where(Order.ordered_at >= from_dt)
    if to_dt:
        q = q.where(Order.ordered_at <= to_dt)
    q = q.order_by(Order.ordered_at.desc()).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


async def create(db: AsyncSession, data: dict[str, Any]) -> Order:
    """Insert a new order and return it."""
    order = Order(**data)
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order
