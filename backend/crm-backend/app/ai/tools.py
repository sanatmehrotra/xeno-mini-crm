"""
AI tool registry — JSON schemas + bound service functions.

Each tool is defined as:
  - A JSON schema (sent to the LLM so it knows how to call it)
  - A bound async function (called when the LLM emits a tool_call)

The same implementations power both:
  - Direct-call endpoints (thin wrappers, no agent loop)
  - The conversational agent loop
"""

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import llm_client
from app.ai.prompts import (
    draft_message_prompt,
    insights_prompt,
    nl_to_rules_prompt,
)
from app.core.config import settings
from app.repositories import campaign_repo, segment_repo
from app.schemas.customer import CustomerOut
from app.services import campaign_service, customer_service, segment_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Input hygiene for user-supplied NL text
# ---------------------------------------------------------------------------

_INJECTION_PATTERNS = re.compile(
    r"(ignore previous|forget instructions|system prompt|you are now|"
    r"override|disregard|act as|pretend you)",
    re.IGNORECASE,
)

MAX_NL_LENGTH = 800


def sanitize_nl(text: str) -> str:
    """
    Strip obvious instruction-override patterns and cap length.
    This is a mitigation, not a guarantee — documented as such.
    """
    text = text[:MAX_NL_LENGTH]
    text = _INJECTION_PATTERNS.sub("[REDACTED]", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Tool implementations (called by agent loop or directly by endpoints)
# ---------------------------------------------------------------------------

async def tool_search_customers(db: AsyncSession, *, search: str = "", limit: int = 10) -> list[dict]:
    """Search customers by name/email."""
    customers, _ = await customer_service.list_customers(
        db, page=1, limit=limit, search=search, sort_by="created_at", order="desc"
    )
    return [CustomerOut.model_validate(c).model_dump() for c in customers]


async def tool_preview_segment(db: AsyncSession, *, rules: dict) -> dict:
    """Dry-run segment rules — return count and sample."""
    count, sample = await segment_service.preview(db, rules, sample_size=5)
    return {
        "count": count,
        "sample": [CustomerOut.model_validate(c).model_dump() for c in sample],
    }


async def tool_create_segment(
    db: AsyncSession, *, name: str, rules: dict, description: str | None = None
) -> dict:
    """Save a segment and compute its members."""
    segment = await segment_service.create_segment(db, name=name, rules=rules, description=description)
    return {"id": str(segment.id), "name": segment.name, "member_count": segment.member_count}


async def tool_draft_message(
    db: AsyncSession,
    *,
    segment_id: str,
    channel: str,
    goal: str,
) -> str:
    """
    Draft a personalized message using the LLM.
    Uses AI_MODEL_FAST — cheap model is sufficient for drafting.
    """
    segment = await segment_repo.get_by_id(db, uuid.UUID(segment_id))
    if not segment:
        return "Error: segment not found"

    count, sample = await segment_service.preview(db, segment.rules, sample_size=3)
    sample_str = json.dumps([CustomerOut.model_validate(c).model_dump() for c in sample], default=str)
    segment_desc = f"{segment.name} ({count} customers)"

    prompt = draft_message_prompt(channel, goal, segment_desc, sample_str)
    response = await llm_client.complete(
        [{"role": "user", "content": prompt}],
        model=settings.ai_model_fast,
        max_tokens=512,
    )
    return response["choices"][0]["message"]["content"].strip()


async def tool_create_campaign(
    db: AsyncSession,
    *,
    name: str,
    segment_id: str,
    channel: str,
    message_template: str,
    ai_generated_message: bool = False,
) -> dict:
    """Create a campaign in draft status."""
    from app.schemas.campaign import CampaignCreate
    payload = CampaignCreate(
        name=name,
        segment_id=uuid.UUID(segment_id),
        channel=channel,
        message_template=message_template,
        ai_generated_message=ai_generated_message,
    )
    campaign = await campaign_service.create_campaign(db, payload)
    return {"id": str(campaign.id), "name": campaign.name, "status": campaign.status}


async def tool_launch_campaign(
    db: AsyncSession, *, campaign_id: str, confirm: bool = False
) -> dict:
    """
    Launch a campaign. REQUIRES confirm=True — returns pending_confirmation otherwise.
    This is the mutation guardrail from the spec.
    """
    if not confirm:
        campaign = await campaign_repo.get_by_id(db, uuid.UUID(campaign_id))
        name = campaign.name if campaign else campaign_id
        return {
            "pending_confirmation": True,
            "message": f"Ready to launch campaign '{name}'. Call again with confirm=true to proceed.",
            "campaign_id": campaign_id,
        }

    import asyncio
    from app.tasks.dispatch import dispatch_campaign
    # Validate segment non-empty before kicking off
    campaign = await campaign_repo.get_by_id(db, uuid.UUID(campaign_id))
    if not campaign:
        return {"error": "Campaign not found"}
    segment = await segment_repo.get_by_id(db, campaign.segment_id)
    if not segment or segment.member_count == 0:
        return {"error": "SEGMENT_EMPTY: Segment has 0 members"}

    # Fire dispatch as a background task (same pattern as the HTTP endpoint)
    asyncio.create_task(dispatch_campaign(uuid.UUID(campaign_id)))
    return {"job_id": campaign_id, "status": "queued", "recipients": segment.member_count}


async def tool_get_campaign_analytics(db: AsyncSession, *, campaign_id: str) -> dict:
    """Fetch delivery funnel and attribution stats."""
    analytics = await campaign_service.get_analytics(db, uuid.UUID(campaign_id))
    return analytics.model_dump()


async def tool_get_campaign_insights(db: AsyncSession, *, campaign_id: str) -> str:
    """Generate an AI performance summary for a campaign."""
    analytics = await campaign_service.get_analytics(db, uuid.UUID(campaign_id))
    campaign = await campaign_repo.get_by_id(db, uuid.UUID(campaign_id))
    prompt = insights_prompt(campaign.name if campaign else campaign_id, analytics.model_dump())
    response = await llm_client.complete(
        [{"role": "user", "content": prompt}],
        model=settings.ai_model_smart,
        max_tokens=512,
    )
    return response["choices"][0]["message"]["content"].strip()


async def tool_list_campaigns(db: AsyncSession) -> list[dict]:
    """List all campaigns."""
    campaigns = await campaign_service.list_campaigns(db)
    from app.schemas.campaign import CampaignOut
    return [CampaignOut.model_validate(c).model_dump() for c in campaigns]


# ---------------------------------------------------------------------------
# NL → segment rules (used by /segments/from-nl, not an agent tool)
# ---------------------------------------------------------------------------

async def nl_to_segment_rules(db: AsyncSession, query: str) -> dict:
    """
    Parse natural language into segment rules using AI_MODEL_FAST.
    Returns {"rules": {...}, "preview": {"count": n, "sample": [...]}}
    """
    safe_query = sanitize_nl(query)
    prompt = nl_to_rules_prompt(safe_query)
    response = await llm_client.complete(
        [{"role": "user", "content": prompt}],
        model=settings.ai_model_fast,
        max_tokens=512,
    )
    content = response["choices"][0]["message"]["content"].strip()

    # Strip markdown fences if present
    if content.startswith("```"):
        content = "\n".join(content.split("\n")[1:-1])

    rules = json.loads(content)
    count, sample = await segment_service.preview(db, rules, sample_size=5)
    return {
        "rules": rules,
        "preview": {
            "count": count,
            "sample": [CustomerOut.model_validate(c).model_dump() for c in sample],
        },
    }


# ---------------------------------------------------------------------------
# Tool registry — JSON schemas sent to the LLM
# ---------------------------------------------------------------------------

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_customers",
            "description": "Search customers by name or email. Returns up to `limit` results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Name or email search term"},
                    "limit": {"type": "integer", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_segment",
            "description": (
                "Dry-run a set of segment rules — returns count and sample customers. Does NOT save. "
                "Rules format: {\"operator\": \"AND\", \"conditions\": [{\"field\": \"total_spent\", \"op\": \"gte\", \"value\": 5000}]}. "
                "Supported ops: eq, neq, gt, gte, lt, lte, in, contains, between. "
                "IMPORTANT: use 'conditions' (not 'rules') as the list key inside the rule tree."
            ),
            "parameters": {
                "type": "object",
                "required": ["rules"],
                "properties": {
                    "rules": {
                        "type": "object",
                        "description": (
                            "Rule tree with 'operator' (AND/OR) and 'conditions' list. "
                            "Example: {\"operator\": \"AND\", \"conditions\": [{\"field\": \"total_spent\", \"op\": \"gte\", \"value\": 1000}]}"
                        ),
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_segment",
            "description": (
                "Save a segment permanently and compute its members. "
                "Rules format: {\"operator\": \"AND\", \"conditions\": [{\"field\": \"total_spent\", \"op\": \"gte\", \"value\": 5000}]}. "
                "IMPORTANT: use 'conditions' (not 'rules') as the list key inside the rule tree."
            ),
            "parameters": {
                "type": "object",
                "required": ["name", "rules"],
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "rules": {
                        "type": "object",
                        "description": (
                            "Rule tree with 'operator' (AND/OR) and 'conditions' list. "
                            "Example: {\"operator\": \"AND\", \"conditions\": [{\"field\": \"total_spent\", \"op\": \"gte\", \"value\": 1000}]}"
                        ),
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_message",
            "description": "Draft a personalized marketing message for a channel and goal.",
            "parameters": {
                "type": "object",
                "required": ["segment_id", "channel", "goal"],
                "properties": {
                    "segment_id": {"type": "string"},
                    "channel": {"type": "string", "enum": ["whatsapp", "sms", "email", "rcs"]},
                    "goal": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_campaign",
            "description": "Create a campaign in draft status.",
            "parameters": {
                "type": "object",
                "required": ["name", "segment_id", "channel", "message_template"],
                "properties": {
                    "name": {"type": "string"},
                    "segment_id": {"type": "string"},
                    "channel": {"type": "string", "enum": ["whatsapp", "sms", "email", "rcs"]},
                    "message_template": {"type": "string"},
                    "ai_generated_message": {"type": "boolean", "default": False},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "launch_campaign",
            "description": "Launch a campaign. REQUIRES confirm=true — first call without confirm returns a pending_confirmation.",
            "parameters": {
                "type": "object",
                "required": ["campaign_id"],
                "properties": {
                    "campaign_id": {"type": "string"},
                    "confirm": {"type": "boolean", "default": False},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_campaign_analytics",
            "description": "Get delivery funnel counts, rates, and attribution for a campaign.",
            "parameters": {
                "type": "object",
                "required": ["campaign_id"],
                "properties": {"campaign_id": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_campaign_insights",
            "description": "Get an AI-generated performance summary for a campaign.",
            "parameters": {
                "type": "object",
                "required": ["campaign_id"],
                "properties": {"campaign_id": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_campaigns",
            "description": "List all campaigns.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


# ---------------------------------------------------------------------------
# Tool dispatcher — map name → bound function
# ---------------------------------------------------------------------------

async def dispatch_tool(
    db: AsyncSession, tool_name: str, tool_args: dict[str, Any]
) -> Any:
    """
    Call the appropriate tool function given its name and parsed arguments.
    Raises ValueError for unknown tools.
    """
    dispatch_map = {
        "search_customers": lambda: tool_search_customers(db, **tool_args),
        "preview_segment": lambda: tool_preview_segment(db, **tool_args),
        "create_segment": lambda: tool_create_segment(db, **tool_args),
        "draft_message": lambda: tool_draft_message(db, **tool_args),
        "create_campaign": lambda: tool_create_campaign(db, **tool_args),
        "launch_campaign": lambda: tool_launch_campaign(db, **tool_args),
        "get_campaign_analytics": lambda: tool_get_campaign_analytics(db, **tool_args),
        "get_campaign_insights": lambda: tool_get_campaign_insights(db, **tool_args),
        "list_campaigns": lambda: tool_list_campaigns(db),
    }
    fn = dispatch_map.get(tool_name)
    if fn is None:
        raise ValueError(f"Unknown tool: {tool_name}")
    return await fn()
