"""
channel-service Pydantic models for /send request and callback payload.
"""

from datetime import datetime

from pydantic import BaseModel


class SendRequest(BaseModel):
    """Body for POST /send — sent by crm-backend when dispatching a campaign."""
    message_id: str          # communications.id
    campaign_id: str
    customer_id: str
    channel: str             # whatsapp | sms | email | rcs
    recipient: str           # phone or email
    message: str


class CallbackPayload(BaseModel):
    """Body sent to CRM_CALLBACK_URL for each delivery lifecycle event."""
    message_id: str
    event: str               # sent | delivered | opened | read | clicked | failed
    occurred_at: str         # ISO8601
    reason: str | None = None
