/**
 * auth.ts — Zustand auth store
 *
 * Stores the JWT and admin email. Persisted to localStorage via Zustand persist
 * middleware so sessions survive page refresh.
 *
 * Trade-off: localStorage is readable by JS (no httpOnly). Acceptable for a
 * single-admin internal tool. Upgrade path: route handler sets an httpOnly cookie.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  email: string | null;
  setAuth: (token: string, email: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      setAuth: (token, email) => set({ token, email }),
      clearAuth: () => set({ token: null, email: null }),
    }),
    { name: "brewbharat-auth" }
  )
);
