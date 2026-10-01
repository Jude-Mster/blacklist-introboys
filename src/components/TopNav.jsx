import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Gamepad2, Trophy, User, Shield, LogOut } from "lucide-react";
import SealLogo from "./SealLogo";
import { useGuild } from "@/lib/GuildContext";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/profile", label: "Profile", icon: User }
];

export default function TopNav() {
  const { account } = useGuild();
  const location = useLocation();
  const navigate = useNavigate();
  const member = account && account.linked ? account.member : null;
  const isAdmin = member && (member.role === "officer" || member.role === "leader");

  const handleLogout = async () => {
    await base44.auth.logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gold/25 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/dashboard" className="shrink-0">
          <SealLogo compact />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} {...n} active={location.pathname === n.to} />
          ))}
          {isAdmin && <NavLink to="/admin" label="Admin" icon={Shield} active={location.pathname === "/admin"} />}
        </nav>

        <div className="flex items-center gap-3">
          {member && (
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Balance</span>
              <span className="font-heading font-bold text-gold tabular-nums text-sm">{member.points.toLocaleString()}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-muted-foreground hover:text-gold transition-colors p-2"
            aria-label="Log out"
          >
            <LogOut className="w-5 h-5" />
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
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
        active ? "text-gold bg-gold/10" : "text-muted-foreground hover:text-gold"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}