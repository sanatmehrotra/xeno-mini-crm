"""
WebSocket connection manager for real-time campaign delivery updates.

Clients connect to /ws/campaigns/{campaign_id}.
The webhook handler calls broadcast() when a delivery event arrives.
"""

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """
    Manages active WebSocket connections keyed by campaign_id.

    Thread-safety note: FastAPI runs in a single asyncio event loop;
    no lock needed here as long as all access is from async coroutines.
    """

    def __init__(self) -> None:
        # campaign_id (str) → list of active WebSocket connections
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, campaign_id: str, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self._connections[campaign_id].append(websocket)

    def disconnect(self, campaign_id: str, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket."""
        conns = self._connections.get(campaign_id, [])
        if websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, campaign_id: str, payload: dict[str, Any]) -> None:
        """
        Send payload (as JSON) to all active connections for campaign_id.
        Silently drops connections that have closed since last broadcast.
        """
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(campaign_id, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                # Connection closed or errored — mark for removal
                dead.append(ws)

        for ws in dead:
            self.disconnect(campaign_id, ws)


# Single instance used throughout the app
ws_manager = ConnectionManager()
