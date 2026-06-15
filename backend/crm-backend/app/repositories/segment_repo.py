"""
Segment repository — DB queries for Segment and SegmentMember.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.segment import Segment, SegmentMember


async def get_by_id(db: AsyncSession, segment_id: uuid.UUID) -> Segment | None:
    result = await db.execute(select(Segment).where(Segment.id == segment_id))
    return result.scalar_one_or_none()


async def list_segments(db: AsyncSession) -> list[Segment]:
    result = await db.execute(select(Segment).order_by(Segment.created_at.desc()))
    return list(result.scalars().all())


async def delete_segment(db: AsyncSession, segment_id: uuid.UUID) -> bool:
    """Delete segment (cascades to segment_members). Returns True if found."""
    segment = await get_by_id(db, segment_id)
    if not segment:
        return False
    await db.delete(segment)
    return True


async def get_members(
    db: AsyncSession, segment_id: uuid.UUID, limit: int = 10
) -> list[Customer]:
    """Return up to `limit` Customer objects that are members of the segment."""
    q = (
        select(Customer)
        .join(SegmentMember, SegmentMember.customer_id == Customer.id)
        .where(SegmentMember.segment_id == segment_id)
        .limit(limit)
    )
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_member_ids(db: AsyncSession, segment_id: uuid.UUID) -> list[uuid.UUID]:
    """Return all customer IDs that are members of the segment."""
    q = select(SegmentMember.customer_id).where(SegmentMember.segment_id == segment_id)
    result = await db.execute(q)
    return list(result.scalars().all())
