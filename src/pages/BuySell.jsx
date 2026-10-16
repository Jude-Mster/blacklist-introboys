import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FullLogo } from "@/components/SealLogo";
import { useAuth } from "@/lib/AuthContext";
import BuySellChat from "@/components/buysell/BuySellChat";
import { api, setMe } from "@/lib/buysell";

// 6.25: Wuxen2 Buy and Sell, full screen, for anyone (no sign-in). Opened from the bubble on the home page
// and from "Open full screen" in the members' Market tab. Discord comes back here after a visitor links
// their account to pick a chat name (?code&state); that finishes the link and opens the name box.
let finishing = "";   // a Discord answer is used once, even if the page is drawn twice
export default function BuySell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [suggest, setSuggest] = useState(null);
  const [linkNote, setLinkNote] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const code = q.get("code"), state = q.get("state");
    if (q.get("link") === "cancelled") { setLinkNote("Discord linking was cancelled. You're still Anonymous."); navigate("/buysell", { replace: true }); return; }
    if (!code || !state || finishing === state) return;
    finishing = state;
    navigate("/buysell", { replace: true });
    api("linkFinish", { code, state })
      .then((r) => { setMe(r.me); setSuggest(r.suggest || ""); setLinkNote("Discord linked. Pick the name others will see."); })
      .catch((e) => setLinkNote((e && e.response && e.response.data && e.response.data.error) || "Linking Discord didn't work. Try again."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = document.title;
    document.title = "Wuxen2 Buy and Sell · BLACKLIST INTROBOYS";
    return () => { document.title = t; };
  }, []);

  return (
    <div className="flex h-[100svh] flex-col bg-[#050505] text-[#e9e4df]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#2a2626] bg-[#0a0909] px-3" style={{ paddingLeft: "max(12px, env(safe-area-inset-left, 0px))", paddingRight: "max(12px, env(safe-area-inset-right, 0px))" }}>
        <Link to={isAuthenticated ? "/market" : "/"} aria-label={isAuthenticated ? "Back to the Market tab" : "Back to the home page"} className="grid h-11 w-11 place-items-center rounded-md hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <FullLogo className="hidden h-[38px] w-auto sm:block" />
        <h1 className="min-w-0 truncate font-heading text-lg font-bold tracking-[0.08em] sm:text-[22px]">WUXEN2 <span className="text-[#e3171d]">BUY AND SELL</span></h1>
      </header>
      {linkNote && (
        <p role="status" className="m-0 border-b border-[#241f1f] bg-[#121010] px-4 py-2 text-sm text-[#cfc9c4]">{linkNote}</p>
      )}
      <div className="min-h-0 flex-1 p-0 sm:p-3">
        <BuySellChat className="rounded-none border-0 sm:rounded-[10px] sm:border" autoName={suggest} />
      </div>
    </div>
  );
}
