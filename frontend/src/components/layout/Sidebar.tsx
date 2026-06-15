"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";

const NAV = [
  { href: "/",           label: "Overview",  icon: "⊡" },
  { href: "/customers",  label: "Customers", icon: "👥" },
  { href: "/segments",   label: "Segments",  icon: "📊" },
  { href: "/campaigns",  label: "Campaigns", icon: "📣" },
];

export default function Sidebar({
  currentPath,
  email,
}: {
  currentPath: string;
  email: string;
}) {
  const router    = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { copilotOpen, toggleCopilot } = useUIStore();

  const isActive = (href: string) =>
    href === "/" ? currentPath === "/" : currentPath.startsWith(href);

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  return (
    <aside className="flex flex-col w-56 shrink-0 h-screen bg-surface border-r border-border">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-border">
        <p className="font-display text-lg font-semibold text-parchment leading-tight">
          BrewBharat
        </p>
        <p className="text-muted text-[11px] uppercase tracking-widest mt-0.5">
          Console
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "nav-item-active" : "nav-item"}
          >
            <span className="text-base w-5 text-center">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom — AI Co-pilot + user */}
      <div className="px-3 pb-4 space-y-1 border-t border-border pt-3">
        {/* AI Co-pilot toggle */}
        <button
          onClick={toggleCopilot}
          className={copilotOpen ? "nav-item-active w-full text-left" : "nav-item w-full text-left"}
        >
          <span className="text-base w-5 text-center">✨</span>
          <span>AI Co-pilot</span>
          {copilotOpen && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-copper animate-pulse" />
          )}
        </button>

        {/* User + logout */}
        <div className="px-3 py-2.5 flex items-center gap-2 mt-1">
          <div className="w-6 h-6 rounded-full bg-copper/20 border border-copper/40 flex items-center justify-center shrink-0">
            <span className="text-copper text-[10px] font-mono font-bold uppercase">
              {email?.[0] ?? "A"}
            </span>
          </div>
          <span className="text-muted text-xs truncate flex-1">{email}</span>
          <button
            onClick={handleLogout}
            className="text-muted/50 hover:text-brick text-xs transition-colors"
            title="Sign out"
          >
            ⏻
          </button>
        </div>
      </div>
    </aside>
  );
}
