"""
Campaign dispatch background task.

Called by POST /campaigns/{id}/launch.
Runs as an asyncio BackgroundTask in Phases 1–9.
Upgraded to Celery in Phase 10.

What it does:
1. Recompute segment members (so the list is fresh at launch time).
2. Fetch all member customers.
3. Create one Communication row per customer (status=queued).
4. Update campaign: status=running, launched_at, total_recipients.
5. For each communication, POST to channel-service /send.
6. On completion, set campaign status=completed.
"""

import uuid
import logging
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.core.database import get_db
from app.models.communication import Communication
from app.repositories import campaign_repo, customer_repo, segment_repo
from app.services import segment_service
from app.services.message_service import personalize

logger = logging.getLogger(__name__)


async def dispatch_campaign(campaign_id: uuid.UUID) -> None:
    """
    Main dispatch coroutine. Runs in the background after /launch returns 202.
    All DB work is done in its own session (not the request session).
    """
    async with get_db() as db:
        campaign = await campaign_repo.get_by_id(db, campaign_id)
        if not campaign:
            logger.error("Dispatch: campaign %s not found", campaign_id)
            return

        # 1. Recompute segment
        segment = await segment_repo.get_by_id(db, campaign.segment_id)
        if not segment:
            logger.error("Dispatch: segment %s not found", campaign.segment_id)
            return
        await segment_service.compute_members(db, segment)

        # 2. Get member customer IDs
        member_ids = await segment_repo.get_member_ids(db, segment.id)
        if not member_ids:
            logger.warning("Dispatch: segment %s has 0 members — aborting", segment.id)
            campaign.status = "failed"
            return

        # 3. Create Communication rows
        comm_rows = []
        customers = []
        for cid in member_ids:
            customer = await customer_repo.get_by_id(db, cid)
            if not customer:
                continue
            message = personalize(campaign.message_template, customer)
            comm = Communication(
                campaign_id=campaign.id,
                customer_id=cid,
                channel=campaign.channel,
                message=message,
                status="queued",
            )
            db.add(comm)
            comm_rows.append(comm)
            customers.append(customer)

        await db.flush()  # assign IDs to Communication rows

        # 4. Update campaign status
        campaign.status = "running"
        campaign.launched_at = datetime.now(timezone.utc)
        campaign.total_recipients = len(comm_rows)
        await db.flush()

    # Session committed. Now fire HTTP requests outside the DB transaction.
    # (channel-service calls don't need to be in the DB session)
    failed_count = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        for comm, customer in zip(comm_rows, customers):
            recipient = customer.phone or customer.email
            try:
                await client.post(
                    f"{settings.channel_service_url}/send",
                    json={
                        "message_id": str(comm.id),
                        "campaign_id": str(campaign.id),
                        "customer_id": str(customer.id),
                        "channel": campaign.channel,
                        "recipient": recipient,
                        "message": comm.message,
                    },
                )
            except Exception as exc:
                logger.warning(
                    "Failed to dispatch message_id=%s: %s", comm.id, exc
                )
                failed_count += 1

    # Mark campaign completed
    async with get_db() as db:
        campaign = await campaign_repo.get_by_id(db, campaign_id)
        if campaign:
            campaign.status = "completed"
            campaign.completed_at = datetime.now(timezone.utc)

    logger.info(
        "Dispatch complete: campaign=%s recipients=%d failed_dispatch=%d",
        campaign_id,
        len(comm_rows),
        failed_count,
    )
