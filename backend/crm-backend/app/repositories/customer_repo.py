"""
Customer repository — all DB queries for the Customer model.

Keeps raw SQLAlchemy out of the service layer. Every function here
takes an AsyncSession and returns ORM objects or scalars.
"""

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer


async def get_by_id(db: AsyncSession, customer_id: uuid.UUID) -> Customer | None:
    """Fetch a single customer by primary key (excludes soft-deleted)."""
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> Customer | None:
    """Fetch a customer by email (excludes soft-deleted)."""
    result = await db.execute(
        select(Customer).where(
            Customer.email == email,
            Customer.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_by_external_id(db: AsyncSession, external_id: str) -> Customer | None:
    """Fetch a customer by external_id."""
    result = await db.execute(
        select(Customer).where(Customer.external_id == external_id)
    )
    return result.scalar_one_or_none()


async def list_customers(
    db: AsyncSession,
    *,
    page: int = 1,
    limit: int = 50,
    search: str | None = None,
    sort_by: str = "created_at",
    order: str = "desc",
    city: str | None = None,
    tier: str | None = None,
) -> tuple[list[Customer], int]:
    """
    Return a page of active customers + total count.
    `search` matches name or email (case-insensitive).
    `sort_by` is validated to an allowlist to prevent injection.
    `city` and `tier` filter on the JSONB `attributes` column.
    """
    allowed_sort = {"created_at", "name", "email", "total_spent", "order_count", "last_purchase_at"}
    if sort_by not in allowed_sort:
        sort_by = "created_at"

    col = getattr(Customer, sort_by)
    order_expr = col.desc() if order == "desc" else col.asc()

    base = select(Customer).where(Customer.deleted_at.is_(None))

    if search:
        pattern = f"%{search}%"
        base = base.where(
            or_(Customer.name.ilike(pattern), Customer.email.ilike(pattern))
        )

    if city:
        # JSONB text extraction: attributes->>'city' = :city
        base = base.where(Customer.attributes["city"].as_string() == city)

    if tier:
        # JSONB text extraction: attributes->>'tier' = :tier
        base = base.where(Customer.attributes["tier"].as_string() == tier)

    # Total count
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Paginated rows
    rows_q = base.order_by(order_expr).offset((page - 1) * limit).limit(limit)
    customers = (await db.execute(rows_q)).scalars().all()

    return list(customers), total


async def create(db: AsyncSession, data: dict[str, Any]) -> Customer:
    """Insert a new customer row and return it."""
    customer = Customer(**data)
    db.add(customer)
    await db.flush()  # get the generated UUID without committing
    await db.refresh(customer)
    return customer


async def upsert_by_email(db: AsyncSession, data: dict[str, Any]) -> tuple[Customer, bool]:
    """
    Insert or update a customer keyed by email.
    Returns (customer, created) where created=True means a new row was inserted.
    """
    existing = await get_by_email(db, data["email"])
    if existing:
        # Update mutable fields (don't overwrite aggregates with zeros on re-import)
        for field in ("name", "phone", "external_id", "attributes", "tags"):
            if field in data:
                setattr(existing, field, data[field])
        await db.flush()
        await db.refresh(existing)
        return existing, False

    customer = Customer(**data)
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
    return customer, True


async def update_aggregates(
    db: AsyncSession,
    customer_id: uuid.UUID,
    *,
    total_spent_delta: float,
    first_purchase_at: Any,
    last_purchase_at: Any,
) -> None:
    """
    Atomically update purchase aggregates after an order is created.
    Uses a single UPDATE to avoid read-modify-write races.
    """
    stmt = (
        update(Customer)
        .where(Customer.id == customer_id)
        .values(
            total_spent=Customer.total_spent + Decimal(str(total_spent_delta)),
            order_count=Customer.order_count + 1,
            first_purchase_at=func.least(
                func.coalesce(Customer.first_purchase_at, first_purchase_at),
                first_purchase_at,
            ),
            last_purchase_at=func.greatest(
                func.coalesce(Customer.last_purchase_at, last_purchase_at),
                last_purchase_at,
            ),
        )
    )
    await db.execute(stmt)
