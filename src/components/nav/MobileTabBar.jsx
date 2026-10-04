import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import Avatar from "@/components/Avatar";
import RankBadge from "@/components/RankBadge";
import { Points } from "@/components/SealLogo";
import { useGuild } from "@/lib/GuildContext";
import { GAME_ICONS } from "@/lib/gameIcons";
import { HOME, GAMES_HUB, POKER, RANKINGS, CHAT, RAFFLE, SHOP, GUIDE, PROFILE, ADMIN, gameLinks, isActive, isAdminRole, tableLinks } from "./navConfig";
import { cn } from "@/lib/utils";

// Phone navigation. Four destinations within thumb reach plus "More", which
// opens a bottom sheet holding everything else (the sidebar's content on desktop).
export default function MobileTabBar({ onChat, chatOpen, unread }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { account, settings } = useGuild();
  const member = account && account.linked ? account.member : null;
  const [more, setMore] = useState(false);
  const { logout: signOut } = useAuth();

  // Close the sheet after moving to another page.
  useEffect(() => setMore(false), [location.pathname, location.search]);

  const secondary = [SHOP, RAFFLE, GUIDE, RANKINGS, PROFILE, ...(isAdminRole(member) ? [ADMIN] : [])];
  const inMore = secondary.some((i) => isActive(i, location));
  const quiet = chatOpen || more;
  const tabs = [
    { ...HOME, active: !quiet && isActive(HOME, location) },
    { ...GAMES_HUB, active: !quiet && location.pathname === "/games" },
    { ...POKER, active: !quiet && isActive(POKER, location) },
    ...(member ? [{ ...CHAT, active: chatOpen && !more, onClick: onChat, badge: unread }] : []),
    { id: "more", short: "More", icon: Menu, active: more || (!chatOpen && inMore), onClick: () => setMore(true) }
  ];

  const logout = async () => {
    setMore(false);
    await signOut();
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-bronze/70 bg-[hsl(0_0%_4%/0.96)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className={cn("mx-auto grid max-w-md", member ? "grid-cols-5" : "grid-cols-4")}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const inner = (
              <>
                <span className={cn("absolute inset-x-5 top-0 h-[3px] rounded-b bg-crimson transition-opacity", t.active ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                <span className="relative">
                  <Icon className={cn("h-6 w-6", t.active ? "text-white" : "text-mist")} strokeWidth={t.active ? 2.4 : 1.8} />
                  {t.badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-white">
                      {t.badge > 9 ? "9+" : t.badge}
                    </span>
                  )}
                </span>
                <span className={cn("text-[11px] leading-none", t.active ? "font-bold text-white" : "text-mist")}>{t.short}</span>
              </>
            );
            const cls = "relative flex h-[58px] flex-col items-center justify-center gap-1.5 active:bg-white/5";
            return t.onClick ? (
              <button key={t.id} type="button" onClick={t.onClick} aria-pressed={t.active} className={cls}>
                {inner}
              </button>
            ) : (
              <Link key={t.id} to={t.to} aria-current={t.active ? "page" : undefined} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>

      <Drawer open={more} onOpenChange={setMore} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[86svh] rounded-t-2xl border-bronze bg-[hsl(0_0%_6%)] pb-[env(safe-area-inset-bottom)] md:hidden">
          <DrawerTitle className="sr-only">Menu</DrawerTitle>
          <DrawerDescription className="sr-only">Every page of the guild hall</DrawerDescription>
          <div className="overflow-y-auto px-4 pb-5 pt-3">
            {member && (
              <Link to="/profile" className="flex items-center gap-3 rounded-lg border border-bronze bg-black/40 p-3 active:bg-white/5">
                <Avatar url={member.avatar_url} name={member.discord_name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-lg font-semibold text-white">{member.discord_name}</span>
                  <RankBadge role={member.role} />
                </span>
                <Points value={member.points} className="font-heading text-lg font-bold text-white" iconSize={18} />
              </Link>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              {secondary.map((item) => {
                const Icon = item.icon;
                const on = isActive(item, location);
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex h-[76px] flex-col items-center justify-center gap-2 rounded-lg border text-sm active:bg-white/10",
                      on ? "border-crimson bg-crimson/15 font-bold text-white" : "border-bronze bg-black/40 text-[hsl(var(--foreground))]"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    {item.short === "Ranks" ? "Rankings" : item.label.replace(" hall", "")}
                  </Link>
                );
              })}
            </div>

            <p className="mb-1.5 mt-5 text-xs font-medium uppercase tracking-wider text-mist">Games</p>
            <ul className="overflow-hidden rounded-lg border border-bronze">
              {[...gameLinks(settings), ...tableLinks(settings).map((t) => (t.id === "poker" ? { ...t, label: "Poker Room" } : t))].map((g) => (
                <li key={g.id} className="border-b border-bronze/60 last:border-b-0">
                  <Link to={g.to} className="flex h-[52px] items-center gap-3 bg-black/40 px-3 active:bg-white/10">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center">{GAME_ICONS[g.id]}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px]">{g.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-mist" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>

            <button onClick={logout} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-bronze text-[15px] text-ember active:bg-white/10">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}