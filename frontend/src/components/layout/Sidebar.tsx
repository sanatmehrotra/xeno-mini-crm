"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";

/* ── Inline SVG icons ──────────────────────────────────────────────────────── */
const Icons = {
  overview: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  customers: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  segments: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  campaigns: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  copilot: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  collapse: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  expand: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
};

const NAV = [
  { href: "/",          label: "Overview",  icon: "overview"  },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/segments",  label: "Segments",  icon: "segments"  },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
] as const;

/* ── Sidebar ───────────────────────────────────────────────────────────────── */

export default function Sidebar({
  currentPath,
  email,
}: {
  currentPath: string;
  email: string;
}) {
  const router    = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { copilotOpen, toggleCopilot, sidebarCollapsed, toggleSidebar } = useUIStore();

  const isActive = (href: string) =>
    href === "/" ? currentPath === "/" : currentPath.startsWith(href);

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  const W = sidebarCollapsed ? "56px" : "224px";

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: sidebarCollapsed ? 0 : "0.75rem",
    justifyContent: sidebarCollapsed ? "center" : "flex-start",
    padding: "0.6rem 0.75rem",
    borderRadius: "6px",
    fontSize: "0.875rem",
    color: active ? "#E0964A" : "#A8957E",
    background: active ? "rgba(224,150,74,0.1)" : "transparent",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: "2px",
    borderStyle: "solid",
    borderLeftColor: active ? "#E0964A" : "transparent",
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    width: "100%",
    boxSizing: "border-box" as const,
  });

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        width: W,
        minWidth: W,
        maxWidth: W,
        height: "100vh",
        background: "#1C1209",
        borderRight: "1px solid #3A2D24",
        transition: "width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease",
        overflow: "hidden",
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Brand + collapse toggle */}
      <div style={{
        padding: "1.25rem 0.75rem",
        borderBottom: "1px solid #3A2D24",
        display: "flex",
        alignItems: "center",
        justifyContent: sidebarCollapsed ? "center" : "space-between",
        gap: "0.5rem",
        minHeight: "64px",
        boxSizing: "border-box",
      }}>
        {!sidebarCollapsed && (
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontFamily: "Playfair Display, Georgia, serif",
              fontSize: "1rem",
              fontWeight: 600,
              color: "#F4E8D8",
              margin: 0,
              lineHeight: 1.2,
            }}>
              BrewBharat
            </p>
            <p style={{
              fontSize: "10px",
              color: "#A8957E",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              margin: "3px 0 0",
            }}>
              Console
            </p>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "none",
            border: "none",
            color: "#A8957E",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {sidebarCollapsed ? Icons.expand : Icons.collapse}
        </button>
      </div>

      {/* Nav links */}
      <nav style={{
        flex: 1,
        padding: "0.75rem 0.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        overflowY: "auto",
      }}>
        {NAV.map(({ href, label, icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={navItemStyle(active)}
              title={sidebarCollapsed ? label : undefined}
            >
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                {Icons[icon as keyof typeof Icons]}
              </span>
              {!sidebarCollapsed && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — copilot + user */}
      <div style={{
        padding: "0.5rem 0.5rem 0.75rem",
        borderTop: "1px solid #3A2D24",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}>
        {/* AI Co-pilot toggle */}
        <button
          onClick={toggleCopilot}
          title={sidebarCollapsed ? "AI Co-pilot" : undefined}
          style={navItemStyle(copilotOpen)}
        >
          <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            {Icons.copilot}
          </span>
          {!sidebarCollapsed && <span style={{ whiteSpace: "nowrap" }}>AI Co-pilot</span>}
          {copilotOpen && !sidebarCollapsed && (
            <span style={{
              marginLeft: "auto",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#E0964A",
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          )}
        </button>

        {/* User row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          justifyContent: sidebarCollapsed ? "center" : "flex-start",
        }}>
          <div style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "rgba(224,150,74,0.15)",
            border: "1px solid rgba(224,150,74,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{ color: "#E0964A", fontSize: "10px", fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase" }}>
              {email?.[0] ?? "A"}
            </span>
          </div>
          {!sidebarCollapsed && (
            <>
              <span style={{ color: "#A8957E", fontSize: "12px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {email}
              </span>
              <button
                onClick={handleLogout}
                title="Sign out"
                style={{ background: "none", border: "none", color: "#A8957E", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}
              >
                {Icons.logout}
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
