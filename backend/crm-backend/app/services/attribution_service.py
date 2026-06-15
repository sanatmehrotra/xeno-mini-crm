"""
Order attribution service.

When an order arrives, we look for the most-engaged recent communication
sent to the same customer and link the order to it.

Attribution window: ATTRIBUTION_WINDOW_HOURS (default 72h) before the order.
Priority: clicked > opened/read > delivered (most engaged status wins).
Tie-break: most recent sent_at.
"""

import logging
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.communication import Communication
from app.models.order import Order

logger = logging.getLogger(__name__)

# Map status → priority (higher = more engaged)
ENGAGEMENT_PRIORITY: dict[str, int] = {
    "delivered": 1,
    "opened":    2,
    "read":      2,
    "clicked":   3,
}


async def attribute_order(db: AsyncSession, order: Order) -> None:
    """
    Try to attribute order to the most-engaged recent communication for that customer.

    Criteria:
    - Same customer_id
    - status IN ('delivered', 'opened', 'read', 'clicked')
    - sent_at between (ordered_at - window) and ordered_at
    - attributed_order_id IS NULL (not already attributed)

    If multiple candidates, pick: highest engagement rank → most recent sent_at.
    """
    window_start = order.ordered_at - timedelta(hours=settings.attribution_window_hours)

    q = select(Communication).where(
        Communication.customer_id == order.customer_id,
        Communication.status.in_(["delivered", "opened", "read", "clicked"]),
        Communication.sent_at >= window_start,
        Communication.sent_at <= order.ordered_at,
        Communication.attributed_order_id.is_(None),
    )
    result = await db.execute(q)
    candidates = list(result.scalars().all())

    if not candidates:
        return

    # Sort: highest engagement rank first, then most recent sent_at
    best = max(
        candidates,
        key=lambda c: (
            ENGAGEMENT_PRIORITY.get(c.status, 0),
            c.sent_at or c.queued_at,
        ),
    )

    best.attributed_order_id = order.id
    db.add(best)
    await db.flush()

    logger.info(
        "Attributed order %s to communication %s (status=%s)",
        order.id,
        best.id,
        best.status,
    )
