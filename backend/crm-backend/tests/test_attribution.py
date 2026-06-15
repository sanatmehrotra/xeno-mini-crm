"""
Tests for order attribution.

Coverage required by spec:
- Order within window attributes correctly
- Order outside window doesn't attribute
- Already-attributed communication isn't reused
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from app.models.campaign import Campaign
from app.models.communication import Communication
from app.models.customer import Customer
from app.models.order import Order
from app.models.segment import Segment
from app.services.attribution_service import attribute_order


@pytest_asyncio.fixture
async def customer_with_comm(db):
    """Create a customer with a delivered communication."""
    seg = Segment(
        id=uuid.uuid4(),
        name="Attr Test Seg",
        rules={"field": "order_count", "op": "gte", "value": 0},
    )
    db.add(seg)
    cust = Customer(
        id=uuid.uuid4(),
        name="Attribution User",
        email="attr@test.com",
        total_spent=0,
        order_count=0,
    )
    db.add(cust)
    camp = Campaign(
        id=uuid.uuid4(),
        name="Attr Campaign",
        segment_id=seg.id,
        channel="email",
        message_template="Hi!",
    )
    db.add(camp)
    await db.flush()

    now = datetime.now(timezone.utc)
    comm = Communication(
        id=uuid.uuid4(),
        campaign_id=camp.id,
        customer_id=cust.id,
        channel="email",
        message="Hi Attribution User!",
        status="delivered",
        sent_at=now - timedelta(hours=24),  # sent 24 hours ago
        delivered_at=now - timedelta(hours=23),
    )
    db.add(comm)
    await db.flush()

    return cust, comm


@pytest.mark.asyncio
class TestOrderAttribution:

    async def test_order_within_window_attributes(self, db, customer_with_comm):
        """An order placed within the attribution window should be attributed."""
        cust, comm = customer_with_comm

        order = Order(
            id=uuid.uuid4(),
            customer_id=cust.id,
            amount=1500,
            items=[],
            ordered_at=datetime.now(timezone.utc),  # now — comm was 24h ago, window is 72h
        )
        db.add(order)
        await db.flush()

        await attribute_order(db, order)

        await db.refresh(comm)
        assert comm.attributed_order_id == order.id

    async def test_order_outside_window_does_not_attribute(self, db, customer_with_comm):
        """An order placed outside the attribution window should NOT be attributed."""
        cust, comm = customer_with_comm

        # Order placed 80 hours after the comm was sent (outside 72h window)
        order = Order(
            id=uuid.uuid4(),
            customer_id=cust.id,
            amount=1500,
            items=[],
            ordered_at=comm.sent_at + timedelta(hours=80),
        )
        db.add(order)
        await db.flush()

        await attribute_order(db, order)

        await db.refresh(comm)
        assert comm.attributed_order_id is None

    async def test_already_attributed_comm_not_reused(self, db, customer_with_comm):
        """A communication that's already attributed shouldn't be reused."""
        cust, comm = customer_with_comm

        # First order — attributes correctly
        order1 = Order(
            id=uuid.uuid4(),
            customer_id=cust.id,
            amount=1000,
            items=[],
            ordered_at=datetime.now(timezone.utc),
        )
        db.add(order1)
        await db.flush()
        await attribute_order(db, order1)
        await db.refresh(comm)
        assert comm.attributed_order_id == order1.id

        # Second order — same comm already attributed, so this order gets nothing
        order2 = Order(
            id=uuid.uuid4(),
            customer_id=cust.id,
            amount=2000,
            items=[],
            ordered_at=datetime.now(timezone.utc),
        )
        db.add(order2)
        await db.flush()
        await attribute_order(db, order2)

        # Comm still points to order1
        await db.refresh(comm)
        assert comm.attributed_order_id == order1.id
