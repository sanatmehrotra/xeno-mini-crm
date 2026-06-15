"""
Tests for AI tool functions.

Coverage required by spec:
- Each tool function tested directly (no LLM)
- Agent loop tested with a mocked LLMClient
"""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.models.customer import Customer
from app.models.segment import Segment


@pytest_asyncio.fixture
async def test_customer(db):
    c = Customer(
        id=uuid.uuid4(),
        name="AI Test User",
        email="aitest@example.com",
        total_spent=8000,
        order_count=4,
        attributes={"city": "Mumbai", "tier": "gold"},
        tags=["repeat_buyer"],
    )
    db.add(c)
    await db.flush()
    return c


@pytest_asyncio.fixture
async def test_segment(db, test_customer):
    seg = Segment(
        id=uuid.uuid4(),
        name="AI Test Segment",
        rules={"field": "total_spent", "op": "gte", "value": 1000},
        member_count=1,
    )
    db.add(seg)
    await db.flush()
    return seg


@pytest.mark.asyncio
class TestToolFunctions:
    """Test tool functions directly without the LLM."""

    async def test_search_customers(self, db, test_customer):
        from app.ai.tools import tool_search_customers
        results = await tool_search_customers(db, search="AI Test")
        assert any(r["email"] == "aitest@example.com" for r in results)

    async def test_preview_segment(self, db, test_customer):
        from app.ai.tools import tool_preview_segment
        rules = {"field": "total_spent", "op": "gte", "value": 5000}
        result = await tool_preview_segment(db, rules=rules)
        assert result["count"] >= 1

    async def test_create_segment(self, db):
        from app.ai.tools import tool_create_segment
        result = await tool_create_segment(
            db,
            name="Tool Created",
            rules={"field": "order_count", "op": "gte", "value": 0},
        )
        assert result["name"] == "Tool Created"
        assert "id" in result

    async def test_launch_campaign_returns_pending_without_confirm(self, db, test_segment):
        from app.models.campaign import Campaign
        camp = Campaign(
            id=uuid.uuid4(),
            name="Pending Test",
            segment_id=test_segment.id,
            channel="sms",
            message_template="Hi {name}!",
            status="draft",
        )
        db.add(camp)
        await db.flush()

        from app.ai.tools import tool_launch_campaign
        result = await tool_launch_campaign(db, campaign_id=str(camp.id), confirm=False)
        assert result.get("pending_confirmation") is True
        assert "confirm=true" in result.get("message", "").lower() or "confirm" in result.get("message", "")


@pytest.mark.asyncio
class TestAgentLoop:
    """Test the agent loop with a mocked LLMClient."""

    async def test_agent_returns_text_on_no_tool_calls(self, db):
        """When the LLM returns plain text (no tool calls), agent yields text_delta + done."""
        from app.ai.agent import run_agent

        mock_response = {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "Hello! I can help you with your CRM tasks.",
                    "tool_calls": None,
                }
            }]
        }

        with patch("app.ai.agent.llm_client") as mock_client:
            mock_client.complete = AsyncMock(return_value=mock_response)
            events = []
            async for event in run_agent(db, "Hello", conversation_id=None):
                events.append(event)

        types = [e["type"] for e in events]
        assert "text_delta" in types
        assert "done" in types

    async def test_agent_returns_pending_confirmation_on_launch(self, db, test_segment):
        """When launch_campaign is called without confirm, agent surfaces pending_confirmation."""
        from app.models.campaign import Campaign
        from app.ai.agent import run_agent

        camp = Campaign(
            id=uuid.uuid4(),
            name="Agent Launch Test",
            segment_id=test_segment.id,
            channel="email",
            message_template="Hi!",
            status="draft",
        )
        db.add(camp)
        await db.flush()

        # LLM calls launch_campaign without confirm=True
        mock_response_tool = {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{
                        "id": "tc1",
                        "type": "function",
                        "function": {
                            "name": "launch_campaign",
                            "arguments": json.dumps({"campaign_id": str(camp.id), "confirm": False}),
                        }
                    }],
                }
            }]
        }

        with patch("app.ai.agent.llm_client") as mock_client:
            mock_client.complete = AsyncMock(return_value=mock_response_tool)
            events = []
            async for event in run_agent(db, "Launch the campaign", conversation_id=None):
                events.append(event)

        # Should surface pending_confirmation
        tool_results = [e for e in events if e["type"] == "tool_result"]
        assert any(
            isinstance(e.get("result"), dict) and e["result"].get("pending_confirmation")
            for e in tool_results
        )
