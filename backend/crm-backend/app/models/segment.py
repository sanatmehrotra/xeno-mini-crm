"""
Segment and SegmentMember ORM models.

`rules` is JSONB — the nested AND/OR rule tree (see Section 9 of the spec).
`nl_query` stores the original natural-language query if the segment was
created via /segments/from-nl.
`segment_members` is a materialized join table recomputed by compute_members().
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Nested AND/OR rule tree — validated before compile
    rules: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Original NL query if segment came from /segments/from-nl
    nl_query: Mapped[str | None] = mapped_column(Text, nullable=True)

    member_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_dynamic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class SegmentMember(Base):
    """
    Materialized membership table — replaced in full by compute_members().
    Composite PK (segment_id, customer_id) guarantees uniqueness.
    """

    __tablename__ = "segment_members"

    segment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("segments.id", ondelete="CASCADE"),
        primary_key=True,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
