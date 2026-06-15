"""
Pydantic v2 schemas for Segment endpoints.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SegmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    rules: dict[str, Any]  # validated by segment_service.compile_rules


class SegmentFromNL(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)


class SegmentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    rules: dict[str, Any]
    nl_query: str | None
    member_count: int
    last_computed_at: datetime | None
    is_dynamic: bool
    created_at: datetime
    updated_at: datetime


class SegmentPreviewOut(BaseModel):
    count: int
    sample: list[dict[str, Any]]
