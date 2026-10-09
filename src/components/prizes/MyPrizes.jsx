import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Check, Copy, ExternalLink, Gift, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { errorText } from "@/lib/GuildContext";
import { PLACE, REDEEM_URL, groupCode } from "@/lib/prizes";
import { cn } from "@/lib/utils";

// Profile > My prizes: the member's own prize codes. Only the member a code was given to
// can load it (the server checks); nobody else, the Guild Leader included, ever sees it.
export default function MyPrizes() {
  const [prizes, setPrizes] = useState(null);
  const [error, setError] = useState("");
  const location = useLocation();
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("prizeAction", { action: "mine" });
      const list = (res.data && res.data.prizes) || [];
      setPrizes(list);
      setError("");
      const fresh = list.filter((p) => !p.opened_at).map((p) => p.id);
      if (fresh.length) {
        base44.functions.invoke("prizeAction", { action: "markOpened", ids: fresh })
          .then(() => { try { window.dispatchEvent(new CustomEvent("bi:prizes-seen")); } catch { /* old browser */ } })
          .catch(() => {});
      }
    } catch (e) {
      setPrizes((p) => p || []);
      setError(errorText(e, "Couldn't load your prizes."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Arriving from a "You received a prize" link: bring this section into view.
  useEffect(() => {
    if (location.hash === "#prizes" && prizes && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, prizes]);

  if (prizes === null) return null;
  if (!prizes.length && !error) return <section id="prizes" ref={ref} className="hidden" aria-hidden="true" />;

  return (
    <section id="prizes" ref={ref} aria-labelledby="my-prizes-title" className="scroll-mt-24 rounded-xl border border-[#6b5420] border-t-[3px] border-t-[#d4a72c] bg-[#111] p-4 sm:p-6">
      <h2 id="my-prizes-title" className="flex items-center gap-2 font-heading text-2xl font-bold text-white"><Gift className="h-5 w-5 text-[#e8c15a]" aria-hidden="true" /> My prizes</h2>
      <p className="mt-1 text-[15px] text-[#c4c4c4]">Only you can see these codes. Keep them private: anyone who has a code can redeem it.</p>
      {error && <p role="alert" className="mt-3 text-[15px] text-ember">{error}</p>}
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {prizes.map((p) => <PrizeCard key={p.id} prize={p} onUpdate={(np) => setPrizes((list) => list.map((x) => (x.id === np.id ? np : x)))} />)}
      </ul>
    </section>
  );
}

function PrizeCard({ prize: p, onUpdate }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const isNew = !p.opened_at;
  const redeemed = !!p.redeemed_at;

  const copy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(p.code); ok = true; } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = p.code; ta.setAttribute("readonly", ""); ta.style.position = "absolute"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); document.body.removeChild(ta);
      } catch { ok = false; }
    }
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };
  const toggleRedeemed = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("prizeAction", { action: "setRedeemed", id: p.id, value: !redeemed });
      if (res.data && res.data.prize) onUpdate(res.data.prize);
    } catch { /* stays as it was */ } finally { setBusy(false); }
  };

  const title = p.source === "raffle" ? `${PLACE[(p.place || 1) - 1]} prize · ${p.label}` : p.label;
  const sub = p.source === "raffle" ? `Raffle: ${p.raffle_title}` : p.reason ? `For: ${p.reason}` : "From the Guild Leader";

  return (
    <li className={cn("overflow-hidden rounded-xl border", redeemed ? "border-[#333] bg-[#141414]" : "border-[#6b5420] bg-[#140f06]")}>
      <div className={cn("px-4 py-3", redeemed ? "bg-[#1a1a1a]" : "bg-[#2a1f0a]")}>
        <p className="flex items-center gap-2 font-heading text-[13px] tracking-[0.16em] text-[#e8c15a]">
          {redeemed ? "REDEEMED" : p.source === "raffle" ? "YOU WON" : "YOU RECEIVED"}
          {isNew && <span className="rounded bg-crimson px-1.5 py-0.5 text-[11px] tracking-[0.1em] text-white">NEW</span>}
        </p>
        <p className="mt-1 break-words font-heading text-[22px] font-bold leading-tight text-white">{title}</p>
        <p className="mt-0.5 text-sm text-[#d6c9a8]">{sub} · {new Date(p.assigned_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
      </div>
      <div className="space-y-3 p-4">
        <div className={cn("select-all rounded-lg border-2 border-dashed bg-[#0b0b0b] px-2 py-3 text-center font-heading text-[22px] font-semibold tracking-[0.14em] sm:text-2xl", redeemed ? "border-[#444] text-[#9e9e9e]" : "border-[#d4a72c] text-white")} aria-label={p.code ? `Your code: ${p.code.split("").join(" ")}` : "Code unavailable"}>
          {p.code ? groupCode(p.code) : "Can't show this code. Ask the Guild Leader to replace it."}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} disabled={!p.code} className="btn-bronze h-12 font-heading text-[15px] tracking-[0.04em]">
            {copied ? <><Check className="h-4 w-4" aria-hidden="true" /> COPIED</> : <><Copy className="h-4 w-4" aria-hidden="true" /> COPY CODE</>}
          </button>
          <a href={p.redeem_url || REDEEM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#d4a72c] px-2 font-heading text-[15px] font-semibold tracking-[0.04em] text-[#1a1205] hover:bg-[#e8c15a]">
            REDEEM <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        {!redeemed && (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-[#d6d6d6]">
            <li>Tap Redeem (opens wuxen2.com/redeem) and sign in to your game account.</li>
            <li>Paste the code, tick the robot box, press Redeem code.</li>
          </ol>
        )}
        <label className="flex items-center gap-2.5 border-t border-white/10 pt-3 text-[15px]">
          <input type="checkbox" checked={redeemed} onChange={toggleRedeemed} disabled={busy} className="h-5 w-5 accent-[#d4a72c]" />
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} I've redeemed it
        </label>
      </div>
    </li>
  );
}