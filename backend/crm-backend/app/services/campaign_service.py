"""
Campaign service — business logic for campaign CRUD and launch.
"""

import uuid
from datetime import datetime, timezone

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import campaign_repo, segment_repo
from app.schemas.campaign import CampaignCreate, CampaignAnalyticsOut
from app.tasks.dispatch import dispatch_campaign


async def create_campaign(db: AsyncSession, payload: CampaignCreate):
    """Create a campaign in draft status."""
    # Verify segment exists
    segment = await segment_repo.get_by_id(db, payload.segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    return await campaign_repo.create(db, payload.model_dump())


async def get_campaign(db: AsyncSession, campaign_id: uuid.UUID):
    campaign = await campaign_repo.get_by_id(db, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


async def list_campaigns(db: AsyncSession):
    return await campaign_repo.list_campaigns(db)


async def launch_campaign(
    db: AsyncSession,
    campaign_id: uuid.UUID,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Validate and launch a campaign.
    Returns the job info immediately (202); dispatch runs in background.
    """
    campaign = await campaign_repo.get_by_id(db, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"Campaign is already {campaign.status}",
        )

    # Check segment is non-empty
    segment = await segment_repo.get_by_id(db, campaign.segment_id)
    if not segment or segment.member_count == 0:
        raise HTTPException(
            status_code=422,
            detail="SEGMENT_EMPTY: Segment has 0 members",
        )

    # Kick off dispatch as a background task
    background_tasks.add_task(dispatch_campaign, campaign_id)

    return {
        "job_id": str(campaign_id),
        "status": "queued",
        "recipients": segment.member_count,
    }


async def delete_campaign(db: AsyncSession, campaign_id: uuid.UUID):
    """Delete a campaign — only allowed in draft status."""
    campaign = await campaign_repo.get_by_id(db, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Only draft campaigns can be deleted",
        )
    await db.delete(campaign)


async def get_analytics(db: AsyncSession, campaign_id: uuid.UUID) -> CampaignAnalyticsOut:
    campaign = await campaign_repo.get_by_id(db, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    stats = await campaign_repo.get_analytics(db, campaign_id)
    return CampaignAnalyticsOut(campaign_id=campaign_id, **stats)
