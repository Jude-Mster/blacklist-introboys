import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import ChatBox from "@/components/chat/ChatBox";
import BuySellChat from "@/components/buysell/BuySellChat";
import { useBuySell, unreadTotal } from "@/lib/buysell";
import { cn } from "@/lib/utils";

const TAB_KEY = "bi.chat.tab";

// Guild chat as a panel that slides in from the right on every page.
// It stays mounted while closed so new-message counts keep working.
// 6.26: two tabs: the guild chat and Market (Wuxen2 Buy and Sell, the open chat everyone on the site shares).
export default function ChatDrawer({ open, onClose, onIncoming }) {
  const [tab, setTab] = useState(() => { try { return window.localStorage.getItem(TAB_KEY) === "market" ? "market" : "guild"; } catch { return "guild"; } });
  const pick = (t) => { setTab(t); try { window.localStorage.setItem(TAB_KEY, t); } catch { /* not kept */ } };
  const marketUnread = unreadTotal(useBuySell("lite"));
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      aria-label="Chat"
      aria-hidden={!open}
      inert={open ? undefined : ""}
      className={cn(
        "fixed right-0 top-14 z-40 flex w-full flex-col border-l border-bronze/60 bg-[hsl(0_0%_7%/0.98)] shadow-[-20px_0_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md transition-transform duration-200 sm:top-16",
        tab === "market" ? "md:w-[420px]" : "md:w-[360px]",
        "bottom-[calc(76px+var(--safe-bottom))] md:bottom-0",
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-bronze/50 bg-gradient-to-b from-bronze/25 to-transparent pl-2 pr-3">
        <div role="tablist" aria-label="Chats" className="flex h-full flex-1 items-stretch">
          <DrawerTab on={tab === "guild"} onClick={() => pick("guild")}>Guild chat</DrawerTab>
          <DrawerTab on={tab === "market"} onClick={() => pick("market")}>
            Market
            {marketUnread > 0 && <span className="ml-1.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-crimson px-1 font-body text-[10px] font-bold text-white">{marketUnread > 9 ? "9+" : marketUnread}</span>}
          </DrawerTab>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-mist hover:text-gold" aria-label="Close chat">
          <X className="h-5 w-5" />
        </button>
      </div>
      {/* the guild chat stays mounted so new-message counts keep working while Market is showing */}
      <div className={cn("min-h-0 flex-1 p-4", tab !== "guild" && "hidden")}>
        {/* 6.16: closed, it only checks once a minute (new messages still arrive live) */}
        <ChatBox frameless onIncoming={onIncoming} className="h-full" height="flex-1 min-h-0" pollMs={open && tab === "guild" ? 12000 : 60000} />
      </div>
      {/* Market asks the server only while it is open on screen */}
      {open && tab === "market" && (
        <div className="min-h-0 flex-1">
          <BuySellChat member compact className="rounded-none border-0" />
        </div>
      )}
    </aside>
  );
}
function DrawerTab({ on, onClick, children }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick}
      className={cn("flex items-center px-3 font-heading text-[15px] font-bold transition-colors", on ? "text-gold shadow-[inset_0_-2px_0_hsl(var(--gold))]" : "text-mist hover:text-gold")}>
      {children}
    </button>
  );
}
