"""
channel-service delivery lifecycle simulator.

Each channel has a configured event sequence, per-stage delivery rates,
and realistic randomized delays. All configuration lives in CHANNEL_CONFIG
so it can be tuned and discussed without touching logic.

Failure reasons are picked randomly from FAILURE_REASONS.
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Callable

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Per-channel configuration (rates and delays are config, not hardcoded inline)
# ---------------------------------------------------------------------------

CHANNEL_CONFIG: dict[str, dict] = {
    "whatsapp": {
        # Events in order; each has: delivered_rate (float, vs previous stage),
        # delay_range_sec (min, max)
        "events": [
            {"name": "sent",      "rate": 1.0,  "delay": (1, 4)},
            {"name": "delivered", "rate": 0.92, "delay": (2, 8)},
            {"name": "read",      "rate": 0.70, "delay": (30, 300)},
            {"name": "clicked",   "rate": 0.35, "delay": (10, 90)},
        ]
    },
    "sms": {
        "events": [
            {"name": "sent",      "rate": 1.0,  "delay": (1, 4)},
            {"name": "delivered", "rate": 0.85, "delay": (2, 8)},
            {"name": "clicked",   "rate": 0.15, "delay": (10, 90)},
        ]
    },
    "email": {
        "events": [
            {"name": "sent",      "rate": 1.0,  "delay": (1, 4)},
            {"name": "delivered", "rate": 0.78, "delay": (2, 8)},
            {"name": "opened",    "rate": 0.25, "delay": (30, 300)},
            {"name": "clicked",   "rate": 0.20, "delay": (10, 90)},
        ]
    },
    "rcs": {
        "events": [
            {"name": "sent",      "rate": 1.0,  "delay": (1, 4)},
            {"name": "delivered", "rate": 0.88, "delay": (2, 8)},
            {"name": "read",      "rate": 0.55, "delay": (30, 300)},
            {"name": "clicked",   "rate": 0.20, "delay": (10, 90)},
        ]
    },
}

FAILURE_REASONS = [
    "Number unreachable",
    "Mailbox full",
    "Invalid recipient",
    "Blocked by user",
]


async def simulate_delivery(
    message_id: str,
    channel: str,
    send_callback: Callable,
) -> None:
    """
    Simulate the delivery lifecycle for one message.

    For each event in the channel's sequence:
    1. Wait a randomized delay.
    2. Roll against the stage's delivery rate.
    3. If success: fire send_callback(message_id, event_name, occurred_at, reason=None).
    4. If failure: fire send_callback(message_id, "failed", occurred_at, reason=<random>)
       and stop — failed is a terminal state.

    `send_callback` is the HMAC-signed HTTP POST to crm-backend (see callbacks.py).
    It is injected so the simulator stays pure (testable without HTTP).
    """
    config = CHANNEL_CONFIG.get(channel)
    if not config:
        logger.warning("Unknown channel %s — skipping simulation", channel)
        return

    for stage in config["events"]:
        delay_min, delay_max = stage["delay"]
        await asyncio.sleep(random.uniform(delay_min, delay_max))

        occurred_at = datetime.now(timezone.utc).isoformat()

        if random.random() <= stage["rate"]:
            await send_callback(message_id, stage["name"], occurred_at, None)
        else:
            # This stage failed — pick a reason and stop
            reason = random.choice(FAILURE_REASONS)
            await send_callback(message_id, "failed", occurred_at, reason)
            return  # terminal
