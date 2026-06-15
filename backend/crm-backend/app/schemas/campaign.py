"""
Pydantic v2 schemas for Campaign endpoints.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    segment_id: uuid.UUID
    channel: str = Field(..., pattern="^(whatsapp|sms|email|rcs)$")
    message_template: str = Field(..., min_length=1)
    ai_generated_message: bool = False


class CampaignOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    segment_id: uuid.UUID | None
    channel: str
    message_template: str
    ai_generated_message: bool
    status: str
    launched_at: datetime | None
    completed_at: datetime | None
    total_recipients: int
    created_at: datetime
    updated_at: datetime


class CampaignAnalyticsOut(BaseModel):
    campaign_id: uuid.UUID
    total_recipients: int
    queued: int
    sent: int
    delivered: int
    opened: int
    read: int
    clicked: int
    failed: int
    # Rates (0.0–1.0)
    delivery_rate: float
    open_rate: float
    click_rate: float
    # Attribution
    attributed_orders: int
    attributed_revenue: float
