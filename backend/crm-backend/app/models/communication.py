"""
Communication and CommunicationEvent ORM models.

Communication: one row per recipient per campaign.
Status lifecycle: queued → sent → delivered → (opened|read) → clicked ; or failed

CommunicationEvent: append-only audit log.
UNIQUE(communication_id, event_type) gives idempotency for free —
duplicate webhook callbacks become no-ops via ON CONFLICT DO NOTHING.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Communication(Base):
    __tablename__ = "communications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id"),
        nullable=False,
    )
    channel: Mapped[str] = mapped_column(String(50), nullable=False)

    # Personalized message (template rendered at launch)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # ID returned by channel-service for correlation
    channel_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Status: queued → sent → delivered → opened|read → clicked ; failed (terminal)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued")

    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    clicked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Set by attribution_service when an order is attributed to this communication
    attributed_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id"),
        nullable=True,
    )


class CommunicationEvent(Base):
    """
    Append-only event log for each delivery lifecycle step.
    UNIQUE(communication_id, event_type) ensures idempotency —
    ON CONFLICT DO NOTHING in the webhook handler.
    """

    __tablename__ = "communication_events"

    __table_args__ = (
        UniqueConstraint("communication_id", "event_type", name="uq_comm_event_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    communication_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("communications.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
