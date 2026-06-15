"""
channel-service callback sender.

Sends HMAC-signed POST requests to crm-backend's webhook endpoint.
Wraps each call in retry-with-backoff (3 attempts, exponential).
Logs failures but never raises — a failed callback shouldn't crash the simulation.
"""

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BACKOFF_BASE_SEC = 1.0  # 1s, 2s, 4s


def _sign(body: bytes) -> str:
    """Compute HMAC-SHA256 hex digest of body using the shared secret."""
    return hmac.new(settings.hmac_secret.encode(), body, hashlib.sha256).hexdigest()


async def send_callback(
    message_id: str,
    event: str,
    occurred_at: str,
    reason: str | None,
) -> None:
    """
    POST a delivery event to CRM_CALLBACK_URL with HMAC signature.
    Retries up to MAX_RETRIES times with exponential backoff on failure.
    """
    payload = {
        "message_id": message_id,
        "event": event,
        "occurred_at": occurred_at,
        "reason": reason,
    }
    body = json.dumps(payload).encode()
    signature = _sign(body)
    headers = {
        "Content-Type": "application/json",
        "X-Channel-Signature": signature,
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    settings.crm_callback_url,
                    content=body,
                    headers=headers,
                )
                if response.status_code < 500:
                    # 2xx = success, 4xx = our bug (don't retry)
                    if response.status_code >= 400:
                        logger.warning(
                            "Callback rejected by CRM: %s %s",
                            response.status_code,
                            response.text,
                        )
                    return
                # 5xx — CRM is temporarily down, retry
                logger.warning(
                    "CRM returned %s on attempt %d/%d",
                    response.status_code,
                    attempt,
                    MAX_RETRIES,
                )
        except (httpx.RequestError, httpx.TimeoutException) as exc:
            logger.warning(
                "Callback network error on attempt %d/%d: %s",
                attempt,
                MAX_RETRIES,
                exc,
            )

        if attempt < MAX_RETRIES:
            await asyncio.sleep(BACKOFF_BASE_SEC * (2 ** (attempt - 1)))

    logger.error(
        "Callback permanently failed for message_id=%s event=%s after %d attempts",
        message_id,
        event,
        MAX_RETRIES,
    )
