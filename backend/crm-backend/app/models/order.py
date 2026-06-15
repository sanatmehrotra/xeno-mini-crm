"""
Order ORM model.

`items` is JSONB: [{name, qty, price}, ...].
`channel` represents purchase channel: online | offline | app.
Customer aggregates (total_spent, order_count, first/last_purchase_at)
are updated in a transaction by the order service on every create/import.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
    )
    external_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    # Line items: [{name: str, qty: int, price: float}]
    items: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    channel: Mapped[str | None] = mapped_column(String(50), nullable=True)  # online|offline|app
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="completed")

    ordered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationship (not loaded by default — use explicit join when needed)
    customer = relationship("Customer", lazy="noload")
