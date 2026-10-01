import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Shield } from "lucide-react";
import { NAV } from "./TopNav";
import { useGuild } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

// Mobile navigation styled as an MMO skill bar: a row of framed slots.
export default function BottomTabs() {
  const location = useLocation();
  const { account } = useGuild();
  const member = account && account.linked ? account.member : null;
  const isAdmin = member && (member.role === "officer" || member.role === "leader");
  const tabs = isAdmin ? [...NAV, { to: "/admin", label: "Admin", icon: Shield }] : NAV;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-bronze/60 bg-[hsl(192_26%_5%/0.96)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around gap-1.5 px-2 py-2">
        {tabs.map((t) => {
          const active = location.pathname.startsWith(t.to) || (t.to === "/games" && location.pathname.startsWith("/poker"));
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-[5px] border transition-colors",
                  active
                    ? "border-gold bg-gradient-to-b from-bronze/50 to-bronze/15 text-gold shadow-[0_0_14px_-2px_hsl(40_58%_63%/0.55)]"
                    : "border-bronze/55 bg-black/40 text-mist"
                )}
              >
                <span className="pointer-events-none absolute inset-[3px] rounded-[3px] border border-white/5" />
                <t.icon className="h-5 w-5" />
              </span>
              <span className={cn("text-[11px] leading-none", active ? "text-gold" : "text-mist")}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}