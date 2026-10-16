import React from "react";
import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useBuySell, unreadTotal } from "@/lib/buysell";

// 6.25: the floating red "Wuxen2 Buy and Sell" bubble on the home page. It opens the full-page chat and
// shows how many private messages are waiting (asked every 15 s, and not at all while the tab is hidden).
export default function BuySellBubble() {
  const s = useBuySell("lite");
  const unread = unreadTotal(s);
  if (s.off) return null;
  return (
    <Link
      to="/buysell"
      aria-label={unread ? `Open Wuxen2 Buy and Sell, ${unread} unread private message${unread === 1 ? "" : "s"}` : "Open Wuxen2 Buy and Sell"}
      className="wx-bubble fixed z-40 inline-flex min-h-[58px] items-center gap-2.5 rounded-full border border-[#ff4b4f] bg-[linear-gradient(#d41a1f,#a50c10)] pl-4 pr-[22px] font-heading text-lg font-bold tracking-[0.06em] text-white hover:brightness-110 sm:text-xl"
      style={{ right: "calc(16px + env(safe-area-inset-right, 0px))", bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
    >
      <MessageSquare className="h-6 w-6" aria-hidden="true" />
      Wuxen2 Buy and Sell
      {unread > 0 && (
        <span className="absolute -right-1 -top-1.5 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-white px-1.5 font-body text-[13px] font-bold tracking-normal text-[#c3121a]">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
