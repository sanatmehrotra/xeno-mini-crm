/**
 * ui.ts — Zustand UI state
 * Tracks sidebar collapsed state and AI co-pilot panel open/closed.
 */
import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  copilotOpen: boolean;
  toggleSidebar: () => void;
  toggleCopilot: () => void;
  setCopilotOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  copilotOpen: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
}));
