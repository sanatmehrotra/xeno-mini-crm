"""
Tests for the webhook handler.

Coverage required by spec:
- Valid signature updates status
- Invalid signature → 403
- Duplicate event → no-op (idempotency)
- Out-of-order events don't regress status
"""

import hashlib
import hmac as hmaclib
import json
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.communication import Communication


def make_signature(body: bytes) -> str:
    return hmaclib.new(
        settings.channel_hmac_secret.encode(), body, hashlib.sha256
    ).hexdigest()


def make_payload(message_id: str, event: str, reason: str | None = None) -> bytes:
    return json.dumps({
        "message_id": message_id,
        "event": event,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
    }).encode()


@pytest_asyncio.fixture
async def campaign_and_comm(db):
    """Create a campaign + one communication row for tests."""
    import uuid as _uuid

    from app.models.customer import Customer
    from app.models.segment import Segment

    seg = Segment(id=_uuid.uuid4(), name="Test", rules={"field": "order_count", "op": "gte", "value": 0})
    db.add(seg)
    cust = Customer(id=_uuid.uuid4(), name="Webhook User", email="webhook@test.com", total_spent=0, order_count=0)
    db.add(cust)
    camp = Campaign(id=_uuid.uuid4(), name="Test Campaign", segment_id=seg.id, channel="whatsapp", message_template="Hi")
    db.add(camp)
    await db.flush()

    comm = Communication(
        id=_uuid.uuid4(),
        campaign_id=camp.id,
        customer_id=cust.id,
        channel="whatsapp",
        message="Hi Webhook User",
        status="sent",
    )
    db.add(comm)
    await db.flush()
    return camp, comm


@pytest.mark.asyncio
class TestWebhookHandler:

    async def test_valid_signature_updates_status(self, client, campaign_and_comm, db):
        camp, comm = campaign_and_comm
        body = make_payload(str(comm.id), "delivered")
        sig = make_signature(body)

        resp = await client.post(
            "/api/v1/webhooks/channel-receipt",
            content=body,
            headers={"Content-Type": "application/json", "X-Channel-Signature": sig},
        )
        assert resp.status_code == 200

        await db.refresh(comm)
        assert comm.status == "delivered"
        assert comm.delivered_at is not None

    async def test_invalid_signature_returns_403(self, client, campaign_and_comm):
        _, comm = campaign_and_comm
        body = make_payload(str(comm.id), "delivered")

        resp = await client.post(
            "/api/v1/webhooks/channel-receipt",
            content=body,
            headers={"Content-Type": "application/json", "X-Channel-Signature": "badhash"},
        )
        assert resp.status_code == 403

    async def test_duplicate_event_is_noop(self, client, campaign_and_comm, db):
        camp, comm = campaign_and_comm
        body = make_payload(str(comm.id), "delivered")
        sig = make_signature(body)
        headers = {"Content-Type": "application/json", "X-Channel-Signature": sig}

        # First call
        resp1 = await client.post("/api/v1/webhooks/channel-receipt", content=body, headers=headers)
        assert resp1.status_code == 200

        # Second call — same event, same message_id (duplicate)
        # Re-sign same body
        resp2 = await client.post("/api/v1/webhooks/channel-receipt", content=body, headers=headers)
        assert resp2.status_code == 200
        assert resp2.json().get("data", {}).get("note") == "duplicate" or resp2.json().get("note") == "duplicate"

    async def test_out_of_order_event_does_not_regress(self, client, campaign_and_comm, db):
        """If comm is 'clicked', a late 'delivered' event should not regress to 'delivered'."""
        camp, comm = campaign_and_comm
        # Set current status to clicked
        comm.status = "clicked"
        db.add(comm)
        await db.flush()

        body = make_payload(str(comm.id), "delivered")
        sig = make_signature(body)
        await client.post(
            "/api/v1/webhooks/channel-receipt",
            content=body,
            headers={"Content-Type": "application/json", "X-Channel-Signature": sig},
        )

        await db.refresh(comm)
        # Status must still be 'clicked' — not regressed to 'delivered'
        assert comm.status == "clicked"
