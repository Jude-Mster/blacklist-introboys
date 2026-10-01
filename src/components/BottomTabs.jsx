import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Gamepad2, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/leaderboard", label: "Ranks", icon: Trophy },
  { to: "/profile", label: "Profile", icon: User }
];

export default function BottomTabs() {
  const location = useLocation();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gold/25 bg-ink/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = location.pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-gold" : "text-muted-foreground"
              )}
            >
              <t.icon className={cn("w-5 h-5", active && "drop-shadow-[0_0_6px_hsl(41_54%_54%/0.6)]")} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}