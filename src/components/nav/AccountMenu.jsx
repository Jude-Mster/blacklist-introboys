import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, ScrollText, Shield, ChevronDown } from "lucide-react";
import Avatar from "@/components/Avatar";
import { ROLE_TITLE } from "@/components/SealLogo";
import { base44 } from "@/api/base44Client";
import { isAdminRole } from "./navConfig";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

// Avatar button in the top bar: who you are, plus profile, admin and log out.
export default function AccountMenu({ member }) {
  const navigate = useNavigate();
  const logout = async () => {
    await base44.auth.logout();
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 text-mist transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        aria-label="Account menu"
      >
        <Avatar url={member ? member.avatar_url : ""} name={member ? member.discord_name : "?"} size={32} className="border border-bronze/70" />
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-bronze/70 bg-[hsl(192_22%_9%)]">
        {member && (
          <>
            <DropdownMenuLabel className="font-normal">
              <p className="truncate font-heading font-bold text-[hsl(var(--foreground))]">{member.discord_name}</p>
              <p className="text-xs text-gold">{ROLE_TITLE[member.role] || member.role}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-bronze/40" />
            <DropdownMenuItem asChild>
              <Link to="/profile" className="cursor-pointer">
                <ScrollText className="h-4 w-4" /> Profile and history
              </Link>
            </DropdownMenuItem>
            {isAdminRole(member) && (
              <DropdownMenuItem asChild>
                <Link to="/admin" className="cursor-pointer">
                  <Shield className="h-4 w-4" /> Admin hall
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-bronze/40" />
          </>
        )}
        <DropdownMenuItem onSelect={logout} className="cursor-pointer text-ember focus:text-ember">
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}