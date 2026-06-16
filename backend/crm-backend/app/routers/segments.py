"""
Segments router — /api/v1/segments
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_dep
from app.repositories import segment_repo
from app.schemas.common import success
from app.schemas.customer import CustomerOut
from app.schemas.segment import SegmentCreate, SegmentFromNL, SegmentOut, SegmentPreview, SegmentPreviewOut
from app.services import segment_service

router = APIRouter(prefix="/segments", tags=["📊 Segments"])


@router.post("/preview")
async def preview_segment(
    payload: SegmentPreview,
    db: AsyncSession = Depends(get_db_dep),
):
    """Dry-run: return count and sample without saving."""
    count, sample = await segment_service.preview(db, payload.rules)
    return success(
        SegmentPreviewOut(
            count=count,
            sample=[CustomerOut.model_validate(c).model_dump() for c in sample],
        ).model_dump()
    )


@router.post("/from-nl")
async def segment_from_nl(
    payload: SegmentFromNL,
    db: AsyncSession = Depends(get_db_dep),
):
    """
    Parse a natural language query into segment rules using AI.
    Returns rules + preview but does NOT save — frontend confirms then calls POST /segments.
    """
    from app.ai.tools import nl_to_segment_rules, sanitize_nl
    result = await nl_to_segment_rules(db, payload.query)
    return success(result)


@router.post("", status_code=201)
async def create_segment(
    payload: SegmentCreate,
    db: AsyncSession = Depends(get_db_dep),
):
    segment = await segment_service.create_segment(
        db,
        name=payload.name,
        rules=payload.rules,
        description=payload.description,
    )
    return success(SegmentOut.model_validate(segment).model_dump())


@router.get("")
async def list_segments(db: AsyncSession = Depends(get_db_dep)):
    segments = await segment_repo.list_segments(db)
    return success([SegmentOut.model_validate(s).model_dump() for s in segments])


@router.get("/{segment_id}")
async def get_segment(segment_id: str, db: AsyncSession = Depends(get_db_dep)):
    segment = await segment_repo.get_by_id(db, uuid.UUID(segment_id))
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    return success(SegmentOut.model_validate(segment).model_dump())


@router.get("/{segment_id}/preview")
async def get_segment_preview(
    segment_id: str, db: AsyncSession = Depends(get_db_dep)
):
    """Return sample 10 members + total count for a saved segment."""
    segment = await segment_repo.get_by_id(db, uuid.UUID(segment_id))
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    count, sample = await segment_service.preview(db, segment.rules, sample_size=10)
    return success(
        SegmentPreviewOut(
            count=count,
            sample=[CustomerOut.model_validate(c).model_dump() for c in sample],
        ).model_dump()
    )


@router.post("/{segment_id}/compute", include_in_schema=False)
async def force_compute(segment_id: str, db: AsyncSession = Depends(get_db_dep)):
    """Force recompute of segment members."""
    segment = await segment_repo.get_by_id(db, uuid.UUID(segment_id))
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    await segment_service.compute_members(db, segment)
    await db.refresh(segment)
    return success({"member_count": segment.member_count, "last_computed_at": segment.last_computed_at.isoformat()})


@router.delete("/{segment_id}", status_code=204)
async def delete_segment(segment_id: str, db: AsyncSession = Depends(get_db_dep)):
    deleted = await segment_repo.delete_segment(db, uuid.UUID(segment_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Segment not found")
