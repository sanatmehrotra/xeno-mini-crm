"""
Campaign ORM model.

Status lifecycle: draft → running → completed | failed
`message_template` supports {name}, {days_inactive} etc. — personalized
per recipient at launch time.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    segment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("segments.id"),
        nullable=True,
    )
    channel: Mapped[str] = mapped_column(String(50), nullable=False)  # whatsapp|sms|email|rcs
    message_template: Mapped[str] = mapped_column(Text, nullable=False)
    ai_generated_message: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Status: draft → running → completed | failed
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")

    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    total_recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
