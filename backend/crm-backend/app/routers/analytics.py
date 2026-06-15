"""
Analytics router — /api/v1/analytics

Overview and per-campaign comparison endpoints.
"""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_dep
from app.models.campaign import Campaign
from app.models.communication import Communication
from app.models.customer import Customer
from app.models.order import Order
from app.schemas.common import success

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db_dep)):
    """
    High-level totals: customers, orders, revenue, campaigns, delivery rate,
    attributed revenue. Returns every field the frontend dashboard expects.
    """
    # ── Customers ────────────────────────────────────────────────────────────
    total_customers = (await db.execute(
        select(func.count(Customer.id)).where(Customer.deleted_at.is_(None))
    )).scalar_one()

    # ── Orders + Revenue ─────────────────────────────────────────────────────
    order_agg = (await db.execute(
        select(func.count(Order.id), func.coalesce(func.sum(Order.amount), 0))
    )).one()
    total_orders  = order_agg[0]
    total_revenue = float(order_agg[1])

    # Attributed revenue last 30 days
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    attr_rev = (await db.execute(
        select(func.coalesce(func.sum(Order.amount), 0))
        .where(Order.ordered_at >= thirty_days_ago)
    )).scalar_one()
    attributed_revenue_30d = float(attr_rev)

    # ── Campaigns ────────────────────────────────────────────────────────────
    campaign_agg = (await db.execute(
        select(Campaign.status, func.count().label("n"))
        .group_by(Campaign.status)
    )).all()
    campaign_counts: dict[str, int] = {r.status: r.n for r in campaign_agg}
    active_campaigns    = campaign_counts.get("running", 0)
    completed_campaigns = campaign_counts.get("completed", 0)
    total_campaigns     = sum(campaign_counts.values())

    # ── Communication funnel ─────────────────────────────────────────────────
    funnel_rows = (await db.execute(
        select(Communication.status, func.count().label("n"))
        .group_by(Communication.status)
    )).all()
    funnel: dict[str, int] = {r.status: r.n for r in funnel_rows}

    total_sent = (
        funnel.get("sent", 0)
        + funnel.get("delivered", 0)
        + funnel.get("opened", 0)
        + funnel.get("read", 0)
        + funnel.get("clicked", 0)
    )
    delivered = funnel.get("delivered", 0)
    opened    = funnel.get("opened", 0) + funnel.get("read", 0)
    clicked   = funnel.get("clicked", 0)

    avg_delivery_rate = round((delivered / total_sent) * 100, 2) if total_sent else 0.0

    return success({
        # Customer & order metrics
        "total_customers":       total_customers,
        "total_orders":          total_orders,
        "total_revenue":         total_revenue,
        "attributed_revenue_30d": attributed_revenue_30d,
        # Campaign metrics
        "total_campaigns":       total_campaigns,
        "active_campaigns":      active_campaigns,
        "completed_campaigns":   completed_campaigns,
        # Delivery metrics
        "total_sent":            total_sent,
        "avg_delivery_rate":     avg_delivery_rate,
        "open_rate":             round(opened / delivered, 4) if delivered else 0.0,
        "click_rate":            round(clicked / delivered, 4) if delivered else 0.0,
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
            "id":               str(c.id),
            "name":             c.name,
            "channel":          c.channel,
            "status":           c.status,
            "launched_at":      c.launched_at.isoformat() if c.launched_at else None,
            "total_recipients": c.total_recipients,
        })

    return success(results)
