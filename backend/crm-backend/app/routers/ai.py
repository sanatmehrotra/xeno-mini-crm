"""
AI router — /api/v1/ai

Endpoints:
  POST /ai/draft-message          — direct tool call, no agent loop
  GET  /ai/insights/{campaign_id} — direct tool call
  POST /ai/agent/chat             — SSE streamed agent loop
  GET  /ai/agent/conversations
  GET  /ai/agent/conversations/{id}

Also exposes:
  POST /segments/from-nl          — registered in segments router but uses AI tools
"""

import json
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agent import run_agent
from app.ai.tools import (
    nl_to_segment_rules,
    sanitize_nl,
    tool_draft_message,
    tool_get_campaign_insights,
)
from app.core.database import get_db_dep
from app.models.ai_conversation import AIConversation
from app.schemas.common import success

router = APIRouter(prefix="/ai", tags=["?? AI"])


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class DraftMessageRequest(BaseModel):
    segment_id: str
    channel: str
    goal: str = "increase engagement and drive repeat purchases"


class AgentChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str


# ---------------------------------------------------------------------------
# Direct-call endpoints (thin wrappers — no agent loop)
# ---------------------------------------------------------------------------

@router.post("/draft-message")
async def draft_message(
    payload: DraftMessageRequest,
    db: AsyncSession = Depends(get_db_dep),
):
    """Draft a personalized message for a segment and channel."""
    message = await tool_draft_message(
        db,
        segment_id=payload.segment_id,
        channel=payload.channel,
        goal=sanitize_nl(payload.goal),
    )
    return success({"message": message})


@router.get("/insights/{campaign_id}")
async def get_insights(campaign_id: str, db: AsyncSession = Depends(get_db_dep)):
    """AI-generated performance summary for a campaign."""
    insights = await tool_get_campaign_insights(db, campaign_id=campaign_id)
    return success({"insights": insights})


# ---------------------------------------------------------------------------
# Conversational agent (SSE stream)
# ---------------------------------------------------------------------------

@router.post("/agent/chat")
async def agent_chat(
    payload: AgentChatRequest,
    db: AsyncSession = Depends(get_db_dep),
):
    """
    Streamed agent endpoint. Returns SSE with events:
      data: {"type": "tool_call",   "name": "...", "args": {...}}\n\n
      data: {"type": "tool_result", "name": "...", "result": ...}\n\n
      data: {"type": "text_delta",  "content": "..."}\n\n
      data: {"type": "done",        "conversation_id": "..."}\n\n
    """
    safe_message = sanitize_nl(payload.message)

    async def event_stream():
        async for event in run_agent(db, safe_message, payload.conversation_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------

@router.get("/agent/conversations", include_in_schema=False)
async def list_conversations(db: AsyncSession = Depends(get_db_dep)):
    result = await db.execute(
        select(AIConversation).order_by(AIConversation.updated_at.desc()).limit(50)
    )
    convs = result.scalars().all()
    return success([
        {
            "id": str(c.id),
            "title": c.title,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
            "message_count": len(c.messages),
        }
        for c in convs
    ])


@router.get("/agent/conversations/{conversation_id}", include_in_schema=False)
async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db_dep)):
    conv = await db.get(AIConversation, uuid.UUID(conversation_id))
    if not conv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Conversation not found")
    return success({
        "id": str(conv.id),
        "title": conv.title,
        "messages": conv.messages,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
    })
