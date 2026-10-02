import React from "react";
import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import SealLogo, { Points } from "@/components/SealLogo";
import { useGuild } from "@/lib/GuildContext";
import AccountMenu from "./AccountMenu";
import { cn } from "@/lib/utils";

// Slim bar across the top: logo, balance, chat and the account menu.
export default function TopBar({ onChat, chatOpen, unread }) {
  const { account } = useGuild();
  const member = account && account.linked ? account.member : null;

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-bronze/50 bg-[hsl(0_0%_6%/0.92)] backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:h-16 sm:px-4">
        <Link to="/dashboard" className="shrink-0" aria-label="Guild hall home">
          <SealLogo compact />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {member && (
            <Link
              to="/profile"
              className="flex items-center rounded-md border border-bronze/60 bg-black/35 px-3 py-1.5 transition-colors hover:border-gold/70"
              aria-label={`Balance: ${member.points} points. Open your history.`}
            >
              <Points value={member.points} className="text-sm font-bold text-gold sm:text-base" iconSize={16} />
            </Link>
          )}
          <button
            onClick={onChat}
            aria-pressed={chatOpen}
            aria-label={unread ? `Chat, ${unread} new messages` : "Chat"}
            title="Chat"
            className={cn(
              "relative hidden h-9 w-9 items-center justify-center rounded-md border transition-colors md:flex",
              chatOpen ? "border-gold bg-bronze/30 text-gold" : "border-bronze/50 text-mist hover:text-gold"
            )}
          >
            <MessageSquare className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-[hsl(0_0%_92%)]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <AccountMenu member={member} />
        </div>
      </div>
    </header>
  );
}