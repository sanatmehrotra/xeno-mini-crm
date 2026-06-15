"use client";
/**
 * useCampaignSocket — subscribes to WS /ws/campaigns/{id} while mounted.
 * On each delivery event, invalidates the campaign-analytics query so the
 * DeliveryFunnel re-renders with fresh counts (correctness over micro-optimization).
 * Handles reconnect with exponential backoff on close/error.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useCampaignSocket(campaignId: string | null) {
  const qc      = useQueryClient();
  const wsRef   = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const alive    = useRef(true);

  useEffect(() => {
    if (!campaignId) return;
    alive.current = true;

    const connect = () => {
      if (!alive.current) return;
      const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
      const ws = new WebSocket(`${wsBase}/ws/campaigns/${campaignId}`);
      wsRef.current = ws;

      ws.onmessage = () => {
        // Invalidate analytics query — let TanStack Query refetch the funnel
        qc.invalidateQueries({ queryKey: ["campaign-analytics", campaignId] });
        retryRef.current = 0;
      };

      ws.onclose = ws.onerror = () => {
        if (!alive.current) return;
        // Exponential backoff: 1s → 2s → 4s → max 16s
        const delay = Math.min(1000 * 2 ** retryRef.current, 16_000);
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      alive.current = false;
      wsRef.current?.close();
    };
  }, [campaignId, qc]);
}
