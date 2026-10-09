import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Gift, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// A gold "You received a prize" bar, on every page, while a prize code is unopened.
// It asks the server how many unopened prizes there are (never for the codes).
const CHECK_EVERY_MS = 5 * 60000;
export default function PrizeNotice() {
  const [info, setInfo] = useState(null);
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const location = useLocation();

  const check = useCallback(async (force = false) => {
    if (!force && Date.now() - last.current < CHECK_EVERY_MS) return;
    last.current = Date.now();
    try {
      const res = await base44.functions.invoke("prizeAction", { action: "pending" });
      setInfo(res.data && res.data.count > 0 ? res.data : null);
    } catch { /* tried again later */ }
  }, []);

  useEffect(() => {
    check(true);
    const onVisible = () => { if (!document.hidden) check(); };
    const onSeen = () => { setInfo(null); last.current = Date.now(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("bi:prizes-seen", onSeen);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("bi:prizes-seen", onSeen); };
  }, [check]);

  if (!info || hidden || location.pathname.startsWith("/profile")) return null;
  const many = info.count > 1;
  return (
    <div role="status" className="mb-3 flex items-center gap-3 rounded-xl border border-[#d4a72c] bg-[#1f1508] px-3 py-2.5 sm:px-4">
      <Gift className="h-5 w-5 shrink-0 text-[#e8c15a]" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[15px] text-white">
        {many ? <>You received <b>{info.count} prizes</b>.</> : <>You received a prize: <b>{info.latest}</b>.</>}
      </p>
      <Link to="/profile#prizes" className="inline-flex h-10 shrink-0 items-center rounded-md bg-[#d4a72c] px-3 font-heading text-[15px] font-semibold tracking-[0.04em] text-[#1a1205] hover:bg-[#e8c15a]">OPEN</Link>
      <button type="button" onClick={() => setHidden(true)} aria-label="Hide for now" className="-mr-1 flex h-10 w-8 shrink-0 items-center justify-center text-[#c4c4c4] hover:text-white"><X className="h-4 w-4" /></button>
    </div>
  );
}