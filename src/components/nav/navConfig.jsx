import React from "react";
import { Home, Trophy, ScrollText, Shield, Swords, MessageSquare, Spade, BookOpen, Store, Download, Flag } from "lucide-react";
import { GAMES } from "@/lib/games";

// One source of truth for every navigation surface.
export const HOME = { id: "hall", to: "/dashboard", label: "Guild hall", short: "Hall", icon: Home };
export const RANKINGS = { id: "rankings", to: "/leaderboard", label: "Rankings", short: "Ranks", icon: Trophy };
export const PROFILE = { id: "profile", to: "/profile", label: "Profile", short: "Profile", icon: ScrollText };
export const ADMIN = { id: "admin", to: "/admin", label: "Admin hall", short: "Admin", icon: Shield };
export const GAMES_HUB = { id: "games", to: "/games", label: "Games", short: "Games", icon: Swords };
export const POKER = { id: "poker", to: "/poker", label: "Poker room", short: "Poker", icon: Spade };
export const PUSOY = { id: "pusoy", to: "/pusoy", label: "Pusoy Dos", short: "Pusoy", icon: Spade };
export const DERBY = { id: "derby", to: "/derby", label: "Blacklist Derby", short: "Derby", icon: Flag };
// Live tables with their own pages, shown after the other games when they're open.
export function tableLinks(settings) {
  const open = (settings && settings.games_enabled) || ["poker", "pusoy"];
  return [POKER, PUSOY, DERBY].filter((t) => open.includes(t.id));
}
export const CHAT = { id: "chat", label: "Chat", short: "Chat", icon: MessageSquare };

// Games shown in the sidebar, in the order members see them.
export function gameLinks(settings) {
  const open = (settings && settings.games_enabled) || GAMES.map((g) => g.id);
  return GAMES.filter((g) => open.includes(g.id) && !g.href).map((g) => ({
    id: g.id,
    to: `/games?game=${g.id}`,
    label: g.name
  }));
}

// The guild's own mark, used as the icon of the Blacklist Arena ("Fight").
export function GuildMark({ className = "", style }) {
  return <img src="/arena/guild-mark.png" alt="" aria-hidden="true" draggable="false" className={`object-contain ${className}`} style={style} />;
}
export const FIGHT = { id: "arena", to: "/arena", label: "Fight", short: "Fight", icon: GuildMark };
export const SHOP = { id: "shop", to: "/shop", label: "Guild shop", short: "Shop", icon: Store };
export const GUIDE = { id: "guide", to: "/guide", label: "Game guide", short: "Guide", icon: BookOpen };
// External link to the Android APK. Shown in the mobile "More" sheet only, never in app mode.
export const DOWNLOAD = { id: "download", label: "Download app", short: "App", icon: Download, href: true };
export const isAdminRole = (m) => !!m && (m.role === "officer" || m.role === "leader");

// Is a nav item the current page?
export function isActive(item, location) {
  const { pathname, search } = location;
  if (item.id === "games") return pathname === "/games";
  if (item.id === "poker") return pathname.startsWith("/poker");
  if (item.to && item.to.startsWith("/games?game=")) {
    const want = item.to.split("=")[1];
    const have = new URLSearchParams(search).get("game");
    return pathname === "/games" && (have === want);
  }
  return item.to ? pathname.startsWith(item.to) : false;
}