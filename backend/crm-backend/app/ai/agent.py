"""
AI agent loop — multi-turn tool-calling agent.

Spec requirements:
- Uses AI_MODEL_SMART for the agent loop.
- Caps at MAX_ITERATIONS (6) to prevent runaway loops.
- Returns pending_confirmation (not pending_confirmation as a tool result,
  but as the final agent response) if launch_campaign returns it.
- Persists the running message history to ai_conversations.messages.
- /ai/agent/chat streams via SSE with events: tool_call, tool_result, text_delta, done.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import llm_client
from app.ai.prompts import AGENT_SYSTEM_PROMPT
from app.ai.tools import TOOL_SCHEMAS, dispatch_tool
from app.core.config import settings
from app.models.ai_conversation import AIConversation

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 6


async def _get_or_create_conversation(
    db: AsyncSession, conversation_id: str | None
) -> AIConversation:
    """Load an existing conversation or create a new one."""
    if conversation_id:
        conv = await db.get(AIConversation, uuid.UUID(conversation_id))
        if conv:
            return conv

    conv = AIConversation(messages=[])
    db.add(conv)
    await db.flush()
    return conv


async def run_agent(
    db: AsyncSession,
    user_message: str,
    conversation_id: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Run the tool-calling agent loop and yield SSE events.

    Yielded events:
      {"type": "tool_call",   "name": "...", "args": {...}}
      {"type": "tool_result", "name": "...", "result": ...}
      {"type": "text_delta",  "content": "..."}
      {"type": "done",        "conversation_id": "..."}

    The caller formats these as SSE data: ... lines.
    """
    conv = await _get_or_create_conversation(db, conversation_id)

    # Append the user message
    conv.messages = list(conv.messages)  # mutable copy
    conv.messages.append({"role": "user", "content": user_message})

    messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}] + conv.messages

    for iteration in range(MAX_ITERATIONS):
        # Call the LLM (non-streaming for tool-calling loop; stream the final text response)
        response = await llm_client.complete(
            messages,
            tools=TOOL_SCHEMAS,
            model=settings.ai_model_smart,
            max_tokens=1024,
        )

        choice = response["choices"][0]
        assistant_message = choice["message"]

        # Append assistant message to history
        conv.messages.append(assistant_message)
        messages.append(assistant_message)

        # Check for tool calls
        tool_calls = assistant_message.get("tool_calls") or []

        if not tool_calls:
            # Final text response — stream it
            content = assistant_message.get("content") or ""
            # Yield in chunks for streaming feel
            chunk_size = 50
            for i in range(0, len(content), chunk_size):
                yield {"type": "text_delta", "content": content[i : i + chunk_size]}
            break

        # Execute each tool call
        for tc in tool_calls:
            fn = tc["function"]
            tool_name = fn["name"]
            tool_args = json.loads(fn.get("arguments", "{}"))

            yield {"type": "tool_call", "name": tool_name, "args": tool_args}

            try:
                result = await dispatch_tool(db, tool_name, tool_args)
            except Exception as exc:
                result = {"error": str(exc)}
                logger.warning("Tool %s failed: %s", tool_name, exc)

            yield {"type": "tool_result", "name": tool_name, "result": result}

            # Check for pending_confirmation — surface it as final response
            if isinstance(result, dict) and result.get("pending_confirmation"):
                conv.messages.append({
                    "role": "assistant",
                    "content": result["message"],
                })
                yield {"type": "text_delta", "content": result["message"]}
                # Save and bail
                conv.updated_at = datetime.now(timezone.utc)
                db.add(conv)
                await db.flush()
                yield {"type": "done", "conversation_id": str(conv.id)}
                return

            # Append tool result to messages
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, default=str),
            })
            conv.messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "name": tool_name,
                "content": json.dumps(result, default=str),
            })
    else:
        # Hit iteration cap
        yield {"type": "text_delta", "content": "I reached my reasoning limit. Please try a simpler request."}

    # Persist conversation
    conv.updated_at = datetime.now(timezone.utc)
    db.add(conv)
    await db.flush()

    yield {"type": "done", "conversation_id": str(conv.id)}
