import { Home, Trophy, ScrollText, Shield, Swords, MessageSquare, Spade, Ticket, BookOpen } from "lucide-react";
import { GAMES } from "@/lib/games";

// One source of truth for every navigation surface.
export const HOME = { id: "hall", to: "/dashboard", label: "Guild hall", short: "Hall", icon: Home };
export const RANKINGS = { id: "rankings", to: "/leaderboard", label: "Rankings", short: "Ranks", icon: Trophy };
export const PROFILE = { id: "profile", to: "/profile", label: "Profile", short: "Profile", icon: ScrollText };
export const ADMIN = { id: "admin", to: "/admin", label: "Admin hall", short: "Admin", icon: Shield };
export const GAMES_HUB = { id: "games", to: "/games", label: "Games", short: "Games", icon: Swords };
export const POKER = { id: "poker", to: "/poker", label: "Poker room", short: "Poker", icon: Spade };
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

export const RAFFLE = { id: "raffle", to: "/raffle", label: "Raffle", short: "Raffle", icon: Ticket };
export const GUIDE = { id: "guide", to: "/guide", label: "Game guide", short: "Guide", icon: BookOpen };
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