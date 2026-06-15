"""
Campaigns router — /api/v1/campaigns
Includes campaign analytics and WebSocket for real-time updates.
"""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_dep
from app.core.websocket import ws_manager
from app.schemas.campaign import CampaignCreate, CampaignOut
from app.schemas.common import accepted, success
from app.services import campaign_service

router = APIRouter(prefix="/campaigns", tags=["?? Campaigns"])


@router.post("", status_code=201)
async def create_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db_dep),
):
    campaign = await campaign_service.create_campaign(db, payload)
    return success(CampaignOut.model_validate(campaign).model_dump())


@router.get("")
async def list_campaigns(db: AsyncSession = Depends(get_db_dep)):
    campaigns = await campaign_service.list_campaigns(db)
    return success([CampaignOut.model_validate(c).model_dump() for c in campaigns])


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, db: AsyncSession = Depends(get_db_dep)):
    campaign = await campaign_service.get_campaign(db, uuid.UUID(campaign_id))
    return success(CampaignOut.model_validate(campaign).model_dump())


@router.post("/{campaign_id}/launch", status_code=202)
async def launch_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_dep),
):
    result = await campaign_service.launch_campaign(
        db, uuid.UUID(campaign_id), background_tasks
    )
    return accepted(**result)


@router.get("/{campaign_id}/analytics")
async def get_campaign_analytics(
    campaign_id: str,
    db: AsyncSession = Depends(get_db_dep),
):
    analytics = await campaign_service.get_analytics(db, uuid.UUID(campaign_id))
    return success(analytics.model_dump())


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(campaign_id: str, db: AsyncSession = Depends(get_db_dep)):
    await campaign_service.delete_campaign(db, uuid.UUID(campaign_id))


# ---------------------------------------------------------------------------
# WebSocket — real-time delivery updates for a campaign
# ---------------------------------------------------------------------------

@router.websocket("/ws/campaigns/{campaign_id}")
async def campaign_ws(campaign_id: str, websocket: WebSocket):
    """
    WebSocket endpoint at /ws/campaigns/{campaign_id}.
    Clients receive {event, communication_id, status, occurred_at} as
    delivery callbacks arrive from channel-service.
    """
    await ws_manager.connect(campaign_id, websocket)
    try:
        # Keep connection alive; we only send, never receive from client
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(campaign_id, websocket)
