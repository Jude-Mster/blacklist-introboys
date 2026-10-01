import React from "react";
import Avatar from "@/components/Avatar";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Swords, Trophy, ScrollText, Shield, LogOut } from "lucide-react";
import SealLogo, { Points } from "./SealLogo";
import { useGuild } from "@/lib/GuildContext";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/dashboard", label: "Hall", icon: Home },
  { to: "/games", label: "Games", icon: Swords },
  { to: "/leaderboard", label: "Rankings", icon: Trophy },
  { to: "/profile", label: "Profile", icon: ScrollText }
];

export default function TopNav() {
  const { account } = useGuild();
  const location = useLocation();
  const navigate = useNavigate();
  const member = account && account.linked ? account.member : null;
  const isAdmin = member && (member.role === "officer" || member.role === "leader");

  const handleLogout = async () => {
    await base44.auth.logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-bronze/50 bg-[hsl(192_26%_6%/0.88)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:h-16">
        <Link to="/dashboard" className="shrink-0" aria-label="Guild hall home">
          <SealLogo compact />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} {...n} active={location.pathname.startsWith(n.to) || (n.to === "/games" && location.pathname.startsWith("/poker"))} />
          ))}
          {isAdmin && <NavLink to="/admin" label="Admin" icon={Shield} active={location.pathname === "/admin"} />}
        </nav>

        <div className="flex items-center gap-2">
          {member && (
            <Link
              to="/profile"
              className="flex items-center gap-2 rounded-full border border-bronze/60 bg-black/30 py-1 pl-1 pr-3"
              aria-label={`Your balance: ${member.points} points`}
            >
              <Avatar url={member.avatar_url} name={member.discord_name} size={28} />
              <Points value={member.points} className="text-sm font-bold text-gold" iconSize={15} />
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="rounded-md p-2 text-mist transition-colors hover:text-gold"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, label, icon: Icon, active }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-bronze/20 text-gold" : "text-mist hover:text-gold"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}