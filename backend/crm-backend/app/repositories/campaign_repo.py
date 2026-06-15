"""
Campaign repository — DB queries for Campaign, Communication, CommunicationEvent.
"""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.communication import Communication, CommunicationEvent
from app.models.order import Order


async def get_by_id(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign | None:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    return result.scalar_one_or_none()


async def list_campaigns(db: AsyncSession) -> list[Campaign]:
    result = await db.execute(select(Campaign).order_by(Campaign.created_at.desc()))
    return list(result.scalars().all())


async def create(db: AsyncSession, data: dict[str, Any]) -> Campaign:
    campaign = Campaign(**data)
    db.add(campaign)
    await db.flush()
    await db.refresh(campaign)
    return campaign


async def create_communications(
    db: AsyncSession, rows: list[dict[str, Any]]
) -> None:
    """Bulk insert Communication rows (called at launch)."""
    for row in rows:
        db.add(Communication(**row))
    await db.flush()


async def get_communication_by_id(
    db: AsyncSession, comm_id: uuid.UUID
) -> Communication | None:
    result = await db.execute(
        select(Communication).where(Communication.id == comm_id)
    )
    return result.scalar_one_or_none()


async def get_analytics(db: AsyncSession, campaign_id: uuid.UUID) -> dict:
    """
    Compute delivery funnel counts, rates, and attribution stats in SQL.
    Returns a plain dict for the analytics schema.
    """
    # Funnel counts by status
    status_counts_q = (
        select(Communication.status, func.count().label("n"))
        .where(Communication.campaign_id == campaign_id)
        .group_by(Communication.status)
    )
    rows = (await db.execute(status_counts_q)).all()
    counts: dict[str, int] = {r.status: r.n for r in rows}

    total = sum(counts.values())
    delivered = counts.get("delivered", 0)
    opened = counts.get("opened", 0)
    read_ = counts.get("read", 0)
    clicked = counts.get("clicked", 0)

    # Attribution
    attr_q = (
        select(
            func.count(Communication.id).label("orders"),
            func.coalesce(func.sum(Order.amount), 0).label("revenue"),
        )
        .join(Order, Order.id == Communication.attributed_order_id)
        .where(
            Communication.campaign_id == campaign_id,
            Communication.attributed_order_id.isnot(None),
        )
    )
    attr = (await db.execute(attr_q)).one()

    return {
        "total_recipients": total,
        "queued": counts.get("queued", 0),
        "sent": counts.get("sent", 0),
        "delivered": delivered,
        "opened": opened,
        "read": read_,
        "clicked": clicked,
        "failed": counts.get("failed", 0),
        "delivery_rate": round(delivered / total, 4) if total else 0.0,
        "open_rate": round((opened + read_) / delivered, 4) if delivered else 0.0,
        "click_rate": round(clicked / delivered, 4) if delivered else 0.0,
        "attributed_orders": attr.orders,
        "attributed_revenue": float(attr.revenue),
    }
