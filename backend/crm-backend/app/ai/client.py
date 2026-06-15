"""
LLMClient — thin wrapper around OpenRouter's OpenAI-compatible API.

Design goal: swapping to direct Anthropic/OpenAI later = change this file only.
Two model tiers via env vars:
  AI_MODEL_FAST  — cheap, for NL parsing and message drafting
  AI_MODEL_SMART — strong, for the agent loop and insights
"""

import json
import logging
from typing import AsyncGenerator, Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"


class LLMClient:
    """
    Async client for OpenRouter's chat completions API.

    Both .complete() and .stream() accept the same `messages` + `tools` args
    so they can be swapped transparently by the agent loop.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.openrouter_api_key

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://xeno-mini-crm.local",  # required by OpenRouter
            "X-Title": "Xeno Mini CRM",
        }

    async def complete(
        self,
        messages: list[dict],
        *,
        tools: list[dict] | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> dict:
        """
        Non-streaming chat completion.
        Returns the raw API response dict.
        Raises httpx.HTTPStatusError on API errors.
        """
        body: dict[str, Any] = {
            "model": model or settings.ai_model_fast,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OPENROUTER_BASE}/chat/completions",
                headers=self._headers(),
                json=body,
            )
            resp.raise_for_status()
            return resp.json()

    async def stream(
        self,
        messages: list[dict],
        *,
        tools: list[dict] | None = None,
        model: str | None = None,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[dict, None]:
        """
        Streaming chat completion — yields SSE delta chunks.
        Each chunk is a dict from the API's data: {...} lines.
        """
        body: dict[str, Any] = {
            "model": model or settings.ai_model_smart,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{OPENROUTER_BASE}/chat/completions",
                headers=self._headers(),
                json=body,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data.strip() == "[DONE]":
                            break
                        try:
                            yield json.loads(data)
                        except json.JSONDecodeError:
                            logger.warning("SSE parse error: %s", data)


# Singleton client
llm_client = LLMClient()
