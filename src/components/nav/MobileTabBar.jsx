import React from "react";
import { Link, useLocation } from "react-router-dom";
import { HOME, GAMES_HUB, POKER, RANKINGS, CHAT, isActive } from "./navConfig";
import { cn } from "@/lib/utils";

// Phone navigation: five slots along the bottom, styled like an MMO skill bar.
// Profile, admin and log out live in the avatar menu at the top.
export default function MobileTabBar({ onChat, chatOpen, unread }) {
  const location = useLocation();
  const gamesActive = location.pathname === "/games";
  const tabs = [
    { ...HOME, active: !chatOpen && isActive(HOME, location) },
    { ...GAMES_HUB, active: !chatOpen && gamesActive },
    { ...POKER, active: !chatOpen && isActive(POKER, location) },
    { ...RANKINGS, active: !chatOpen && isActive(RANKINGS, location) },
    { ...CHAT, active: chatOpen, onClick: onChat, badge: unread }
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-bronze/60 bg-[hsl(0_0%_5%/0.97)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around gap-1 px-2 py-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const slot = (
            <>
              <span
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-[5px] border transition-colors",
                  t.active
                    ? "border-gold bg-gradient-to-b from-bronze/50 to-bronze/15 text-gold shadow-[0_0_14px_-2px_hsl(0_0%_63%/0.55)]"
                    : "border-bronze/55 bg-black/40 text-mist"
                )}
              >
                <span className="pointer-events-none absolute inset-[3px] rounded-[3px] border border-white/5" />
                <Icon className="h-5 w-5" />
                {t.badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-[hsl(0_0%_92%)]">
                    {t.badge > 9 ? "9+" : t.badge}
                  </span>
                )}
              </span>
              <span className={cn("text-[11px] leading-none", t.active ? "text-gold" : "text-mist")}>{t.short}</span>
            </>
          );
          return t.onClick ? (
            <button key={t.id} type="button" onClick={t.onClick} aria-pressed={t.active} className="flex flex-1 flex-col items-center gap-1">
              {slot}
            </button>
          ) : (
            <Link key={t.id} to={t.to} aria-current={t.active ? "page" : undefined} className="flex flex-1 flex-col items-center gap-1">
              {slot}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}