"""
Tests for campaign launch.

Coverage required by spec:
- Launch creates correct number of communications rows
- Empty segment → 422 SEGMENT_EMPTY
"""

import uuid

import pytest
import pytest_asyncio

from app.models.campaign import Campaign
from app.models.customer import Customer
from app.models.segment import Segment, SegmentMember


@pytest_asyncio.fixture
async def segment_with_customers(db):
    """Create a segment with 3 customers."""
    seg = Segment(
        id=uuid.uuid4(),
        name="Test Segment",
        rules={"field": "order_count", "op": "gte", "value": 0},
        member_count=3,
    )
    db.add(seg)
    await db.flush()

    customers = []
    for i in range(3):
        c = Customer(
            id=uuid.uuid4(),
            name=f"User {i}",
            email=f"user{i}@test.com",
            phone=f"+9199000000{i}",
            total_spent=1000,
            order_count=1,
        )
        db.add(c)
        customers.append(c)
    await db.flush()

    for c in customers:
        db.add(SegmentMember(segment_id=seg.id, customer_id=c.id))
    await db.flush()

    camp = Campaign(
        id=uuid.uuid4(),
        name="Test Campaign",
        segment_id=seg.id,
        channel="sms",
        message_template="Hi {name}!",
        status="draft",
    )
    db.add(camp)
    await db.flush()

    return seg, camp, customers


@pytest_asyncio.fixture
async def empty_segment_campaign(db):
    """Create a campaign with an empty segment."""
    seg = Segment(
        id=uuid.uuid4(),
        name="Empty Segment",
        rules={"field": "total_spent", "op": "gte", "value": 999999999},
        member_count=0,
    )
    db.add(seg)
    await db.flush()

    camp = Campaign(
        id=uuid.uuid4(),
        name="Empty Campaign",
        segment_id=seg.id,
        channel="email",
        message_template="Hi!",
        status="draft",
    )
    db.add(camp)
    await db.flush()

    return seg, camp


@pytest.mark.asyncio
class TestCampaignLaunch:

    async def test_launch_empty_segment_returns_422(self, client, empty_segment_campaign):
        _, camp = empty_segment_campaign
        resp = await client.post(f"/api/v1/campaigns/{camp.id}/launch")
        assert resp.status_code == 422
        assert "SEGMENT_EMPTY" in resp.json().get("detail", "")

    async def test_launch_creates_communications(self, client, segment_with_customers, db):
        from app.models.communication import Communication
        from sqlalchemy import select

        seg, camp, customers = segment_with_customers
        resp = await client.post(f"/api/v1/campaigns/{camp.id}/launch")
        assert resp.status_code == 202

        # Give the background task a moment to run
        import asyncio
        await asyncio.sleep(0.1)

        # Check communications were created
        result = await db.execute(
            select(Communication).where(Communication.campaign_id == camp.id)
        )
        comms = result.scalars().all()
        assert len(comms) == 3
