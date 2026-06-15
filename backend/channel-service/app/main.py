"""
channel-service — FastAPI application entry point.

Endpoints:
  GET  /health   — liveness probe
  POST /send     — accept a message dispatch request and start simulation
"""

import asyncio

from fastapi import FastAPI

from app.callbacks import send_callback
from app.models import SendRequest
from app.simulator import simulate_delivery

app = FastAPI(
    title="Xeno Channel Service",
    description="Stub messaging service simulating WhatsApp/SMS/Email/RCS delivery",
    version="0.1.0",
    docs_url="/docs",
)


@app.get("/health", tags=["health"])
async def health() -> dict:
    """Liveness probe."""
    return {"service": "channel-service", "status": "ok"}


@app.post("/send", status_code=202, tags=["send"])
async def send_message(payload: SendRequest) -> dict:
    """
    Accept a send request from crm-backend.

    Returns 202 immediately, then runs the delivery simulation as a
    background asyncio task that calls back into crm-backend for each event.
    """
    # Fire-and-forget the simulation; don't await it
    asyncio.create_task(
        simulate_delivery(
            message_id=payload.message_id,
            channel=payload.channel,
            send_callback=send_callback,
        )
    )
    return {"accepted": True, "message_id": payload.message_id}
