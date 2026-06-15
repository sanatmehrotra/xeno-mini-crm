"""
Analytics router — /api/v1/analytics

Overview and per-campaign comparison endpoints.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_dep
from app.models.campaign import Campaign
from app.models.communication import Communication
from app.models.customer import Customer
from app.schemas.common import success

router = APIRouter(prefix="/analytics", tags=["?? Analytics"])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db_dep)):
    """
    High-level totals: customers, campaigns, sent/delivered/opened/clicked rates,
    attributed orders and revenue.
    """
    total_customers = (await db.execute(
        select(func.count(Customer.id)).where(Customer.deleted_at.is_(None))
    )).scalar_one()

    total_campaigns = (await db.execute(
        select(func.count(Campaign.id))
    )).scalar_one()

    # Communication funnel aggregates
    funnel_q = select(
        Communication.status, func.count().label("n")
    ).group_by(Communication.status)
    funnel_rows = (await db.execute(funnel_q)).all()
    funnel: dict[str, int] = {r.status: r.n for r in funnel_rows}

    total_sent = funnel.get("sent", 0) + funnel.get("delivered", 0) + \
                 funnel.get("opened", 0) + funnel.get("read", 0) + \
                 funnel.get("clicked", 0)
    delivered = funnel.get("delivered", 0)
    opened = funnel.get("opened", 0) + funnel.get("read", 0)
    clicked = funnel.get("clicked", 0)

    return success({
        "total_customers": total_customers,
        "total_campaigns": total_campaigns,
        "total_sent": total_sent,
        "delivery_rate": round(delivered / total_sent, 4) if total_sent else 0.0,
        "open_rate": round(opened / delivered, 4) if delivered else 0.0,
        "click_rate": round(clicked / delivered, 4) if delivered else 0.0,
    })


@router.get("/campaigns")
async def campaigns_comparison(
    db: AsyncSession = Depends(get_db_dep),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
):
    """Per-campaign comparison — useful for the dashboard table."""
    q = select(Campaign).order_by(Campaign.launched_at.desc())
    if from_:
        q = q.where(Campaign.launched_at >= from_)
    if to:
        q = q.where(Campaign.launched_at <= to)

    campaigns = (await db.execute(q)).scalars().all()
    results = []
    for c in campaigns:
        results.append({
            "id": str(c.id),
            "name": c.name,
            "channel": c.channel,
            "status": c.status,
            "launched_at": c.launched_at.isoformat() if c.launched_at else None,
            "total_recipients": c.total_recipients,
        })

    return success(results)
