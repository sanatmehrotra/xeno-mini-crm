"""
Tests for channel-service.

Coverage required by spec:
- /send returns 202 immediately
- simulator eventually calls back with a correctly-signed payload
"""

import asyncio
import hashlib
import hmac as hmaclib
import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import settings


@pytest.mark.asyncio
async def test_send_returns_202_immediately():
    """POST /send should return 202 without waiting for simulation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("app.main.simulate_delivery", new_callable=AsyncMock) as mock_sim:
            # Prevent actual simulation from firing
            mock_sim.return_value = None
            resp = await client.post("/send", json={
                "message_id": "test-message-001",
                "campaign_id": "test-campaign-001",
                "customer_id": "test-customer-001",
                "channel": "email",
                "recipient": "test@example.com",
                "message": "Hello Test!",
            })
        assert resp.status_code == 202
        data = resp.json()
        assert data["accepted"] is True
        assert data["message_id"] == "test-message-001"


@pytest.mark.asyncio
async def test_callback_is_hmac_signed():
    """
    The send_callback function should produce an HMAC-signed payload.
    Verified by checking the signature against the shared secret.
    """
    from app.callbacks import _sign

    payload = {
        "message_id": "test-001",
        "event": "delivered",
        "occurred_at": "2026-06-15T00:00:00+00:00",
        "reason": None,
    }
    body = json.dumps(payload).encode()
    signature = _sign(body)

    # Verify the signature is correct
    expected = hmaclib.new(
        settings.hmac_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    assert hmaclib.compare_digest(signature, expected)


@pytest.mark.asyncio
async def test_simulator_fires_callbacks():
    """
    simulate_delivery should call send_callback for at least the 'sent' event.
    """
    from app.simulator import simulate_delivery

    callback_calls = []

    async def mock_callback(message_id, event, occurred_at, reason):
        callback_calls.append({"event": event, "message_id": message_id})

    await simulate_delivery("msg-001", "email", mock_callback)

    # 'sent' event should always be first (rate=1.0)
    assert len(callback_calls) >= 1
    assert callback_calls[0]["event"] == "sent"
