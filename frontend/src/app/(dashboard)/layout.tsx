"use client";
/**
 * DashboardLayout — auth guard + shell.
 *
 * Three auth states:
 *   "checking"       → token exists in store, validating with /auth/me → show spinner
 *   "authenticated"  → /auth/me succeeded → render layout
 *   "unauthenticated"→ no token OR /auth/me failed → replace("/login"), render nothing
 *
 * This prevents any flash of protected content for expired/invalid tokens.
 * The Axios 401 interceptor handles mid-session expiry on any subsequent request.
 */
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { authApi } from "@/lib/api/auth";
import Sidebar from "@/components/layout/Sidebar";
import CopilotDock from "@/components/layout/CopilotDock";
import { useUIStore } from "@/stores/ui";

type AuthState = "checking" | "authenticated" | "unauthenticated";

/* ── Loading screen ─────────────────────────────────────────────────────────── */
function AuthLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4"
         style={{ background: "var(--color-espresso)" }}>
      <div className="w-8 h-8 border-2 border-border border-t-copper rounded-full animate-spin" />
      <p style={{ color: "var(--color-muted)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
        Verifying session…
      </p>
    </div>
  );
}

/* ── Dashboard layout ───────────────────────────────────────────────────────── */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const { token, email, clearAuth } = useAuthStore();
  const copilotOpen = useUIStore((s) => s.copilotOpen);

  // Start as "checking" only if a token exists — skip the /auth/me round-trip if there's nothing to check
  const [authState, setAuthState] = useState<AuthState>(
    token ? "checking" : "unauthenticated"
  );

  useEffect(() => {
    // No token at all → redirect immediately, no spinner needed
    if (!token) {
      router.replace("/login");
      return;
    }

    // Token exists → verify it is still valid server-side
    authApi
      .me()
      .then(() => setAuthState("authenticated"))
      .catch(() => {
        // Token is expired or invalid
        clearAuth();
        setAuthState("unauthenticated");
        router.replace("/login");
      });
  // Run once on mount — token value at mount time is what matters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render gates ────────────────────────────────────────────────────────────

  // No token → nothing to show, redirect is in flight
  if (authState === "unauthenticated") return null;

  // Token present but not yet validated → show spinner (no protected content)
  if (authState === "checking") return <AuthLoader />;

  // Validated → render the full dashboard
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-espresso)" }}>
      {/* Left sidebar */}
      <Sidebar currentPath={pathname} email={email ?? ""} />

      {/* Main content */}
      <main
        className="flex-1 overflow-y-auto transition-all duration-300"
        style={{ marginRight: copilotOpen ? "380px" : "0" }}
      >
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 1.5rem" }}>
          {children}
        </div>
      </main>

      {/* AI Co-pilot panel */}
      <CopilotDock />
    </div>
  );
}
