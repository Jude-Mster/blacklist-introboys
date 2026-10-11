import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useGuild } from "@/lib/GuildContext";
import { GAME_ICONS } from "@/lib/gameIcons";
import { HOME, RANKINGS, PROFILE, ADMIN, CHAT, FIGHT, GuildMark, SHOP, GUIDE, gameLinks, isActive, isAdminRole, tableLinks } from "./navConfig";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

// Desktop and tablet navigation. Full width with labels on large screens,
// an icon rail on tablets or when collapsed.
export default function Sidebar({ collapsed, onToggle, onChat, chatOpen, unread }) {
  const location = useLocation();
  const { account, settings } = useGuild();
  const member = account && account.linked ? account.member : null;
  const wide = !collapsed; // labels show only on lg+ and only when not collapsed
  const games = gameLinks(settings);
  const [tourOpen, setTourOpen] = useState(false);

  // A dot on Fight while a tournament is open for sign-up or being fought.
  useEffect(() => {
    let alive = true;
    base44.functions.invoke("tournamentAction", { action: "status" })
      .then((res) => { if (alive) setTourOpen(!!(res.data && res.data.tournament)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed bottom-0 left-0 top-14 z-30 hidden flex-col border-r border-bronze/50 bg-[hsl(0_0%_5.5%/0.97)] transition-[width] duration-200 sm:top-16 md:flex",
        wide ? "w-[72px] lg:w-[244px]" : "w-[72px]"
      )}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        <Item item={HOME} active={isActive(HOME, location)} wide={wide} />

        <Group label="Play" wide={wide}>
          {/* Fight (the Blacklist Arena) takes Poker's place; Poker is still on the Games page */}
          <Item item={FIGHT} glyph={<GuildMark className="h-7 w-7" />} active={isActive(FIGHT, location)} wide={wide} badge={tourOpen} />
          {games.map((g) => (
            <Item key={g.id} item={g} glyph={GAME_ICONS[g.id]} active={isActive(g, location)} wide={wide} />
          ))}
          {tableLinks(settings).filter((t) => t.id !== "poker").map((t) => (
            <Item key={t.id} item={t} glyph={GAME_ICONS[t.id]} active={isActive(t, location)} wide={wide} />
          ))}
        </Group>

        <Group label="Guild" wide={wide}>
          <Item item={SHOP} active={isActive(SHOP, location)} wide={wide} />
          <Item item={RANKINGS} active={isActive(RANKINGS, location)} wide={wide} />
          <Item item={GUIDE} active={isActive(GUIDE, location)} wide={wide} />
          {member && <Item item={CHAT} onClick={onChat} active={chatOpen} badge={unread} wide={wide} />}
        </Group>

        <Group label="You" wide={wide}>
          <Item item={PROFILE} active={isActive(PROFILE, location)} wide={wide} />
          {isAdminRole(member) && <Item item={ADMIN} active={isActive(ADMIN, location)} wide={wide} />}
        </Group>
      </div>

      <div className="hidden border-t border-bronze/40 p-3 lg:block">
        <button
          onClick={onToggle}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm text-mist transition-colors hover:bg-bronze/15 hover:text-gold"
          aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
          title={collapsed ? "Expand the menu" : "Collapse the menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          {wide && <span className="hidden lg:inline">Collapse</span>}
        </button>
      </div>
    </nav>
  );
}

function Group({ label, wide, children }) {
  return (
    <div className="mt-3">
      <p className={cn("mb-1.5 px-2 text-xs font-medium text-mist/70", wide ? "hidden lg:block" : "hidden")}>{label}</p>
      <div className={cn("mx-2 mb-2 h-px bg-bronze/30", wide ? "lg:hidden" : "")} aria-hidden="true" />
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Item({ item, glyph, active, wide, onClick, badge }) {
  const Icon = item.icon;
  const inner = (
    <>
      <span
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          active ? "border-gold/80 bg-bronze/30 text-gold" : "border-transparent text-mist group-hover:text-gold"
        )}
      >
        {glyph || (Icon && <Icon className="h-[18px] w-[18px]" />)}
        {badge === true && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-crimson" />
        )}
        {typeof badge === "number" && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-[hsl(0_0%_92%)]">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className={cn("min-w-0 text-[13px] leading-tight", active ? "font-bold text-gold" : "text-[hsl(var(--foreground))]/85", wide ? "hidden lg:inline" : "sr-only")}>
        {item.label}
      </span>
    </>
  );
  const cls = cn(
    "group flex w-full items-center gap-3 rounded-md px-1.5 py-1 transition-colors hover:bg-bronze/10",
    active && "bg-bronze/10"
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} title={item.label} aria-pressed={active}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={item.to} className={cls} title={item.label} aria-current={active ? "page" : undefined}>
      {inner}
    </Link>
  );
}