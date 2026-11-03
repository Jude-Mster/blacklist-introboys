import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Gamepad2, Gem, HelpCircle, KeyRound, MonitorSmartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import { peekPendingLink, clearPendingLink } from "@/lib/assistantLink";
import AreaTabs from "@/components/assistant/AreaTabs";
import LicenseSummary from "@/components/assistant/LicenseSummary";
import DevicesPanel from "@/components/assistant/DevicesPanel";
import SignInPanel from "@/components/assistant/SignInPanel";
import PhonePanel from "@/components/assistant/PhonePanel";
import RemotePanel from "@/components/assistant/RemotePanel";
import LootPanel from "@/components/assistant/LootPanel";
import HowItWorks from "@/components/assistant/HowItWorks";

// 6.54: the page is split into work areas, so a member opens the one thing they came for.
const AREAS = [
{ id: "overview", label: "Overview", icon: MonitorSmartphone },
{ id: "signin", label: "Sign in", icon: KeyRound },
{ id: "remote", label: "Remote control", icon: Gamepad2 },
{ id: "loot", label: "Loot", icon: Gem },
{ id: "help", label: "How it works", icon: HelpCircle }];


// IntroBoys Assistant: the license (bought in the guild shop), the device lock, and the page where
// the app's sign-in code is approved. The app itself is a program on the member's own PC or phone.
export default function Assistant() {
  const { account, loading } = useGuild();
  const linked = !!(account && account.linked);
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // 6.43: a busy moment (the site's shared database budget) is waited out: up to 4 more tries over ~15 s before an error shows
  const load = useCallback(async () => {
    for (let attempt = 0;; attempt++) {
      try {
        const res = await base44.functions.invoke("botAuth", { action: "status" });
        setData(res.data);
        setError("");
        return;
      } catch (e) {
        const text = errorText(e, "Couldn't load your Assistant license.");
        const status = e && e.response && e.response.status;
        const busy = status === 429 || status === 500 || /rate limit|busy/i.test(text);
        if (!busy || attempt >= 4) {setError(text);return;}
        await new Promise((r) => setTimeout(r, [1500, 2500, 4000, 6000][attempt]));
      }
    }
  }, []);
  useEffect(() => {if (linked) load();}, [linked, load]);

  // A code that arrived through /link-app before the member had signed in
  const [code] = useState(() => params.get("link") || peekPendingLink());
  // the work area is kept in the address, so a refresh or a link lands on the same one
  const [area, setArea] = useState(() => {
    const t = params.get("tab");
    if (code) return "signin";
    return AREAS.some((a) => a.id === t) ? t : "overview";
  });
  useEffect(() => {
    clearPendingLink();
    if (params.get("link")) {const n = new URLSearchParams(params);n.delete("link");setParams(n, { replace: true });}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id) => {
    setArea(id);
    const n = new URLSearchParams(params);
    n.set("tab", id);
    n.delete("link");
    setParams(n, { replace: true });
  };

  if (loading) return <LanternSpinner label="Opening the Assistant" className="py-24" />;
  if (!linked) return <Navigate to="/link-discord" replace />;

  const lic = data && data.license || {};
  const devices = data && data.devices || [];
  const remoteReady = !!lic.active;
  const lootReady = devices.length > 0;

  return (
    <div className="mx-auto max-w-[44rem] space-y-4">
      <header className="text-center">
        <h1 className="font-heading text-3xl font-extrabold gilt-text">IntroBoys Assistant</h1>
        <p className="mx-auto mt-1 max-w-[34rem] text-sm text-mist">The helper for your PC, and auto attack on your phone. Buy days in the guild shop, sign the app in with a code, and it runs for as long as your days last.</p>
      </header>

      <AreaTabs areas={AREAS} value={area} onChange={pick} />

      {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>}

      {!data && !error ?
      <LanternSpinner label="Checking your license" className="py-10" /> :
      data &&
      <>
          {area === "overview" &&
        <>
              <LicenseSummary license={lic} devices={devices} max={data.max_devices} appOnline={!!data.app_online} />
              <DevicesPanel data={data} onChange={load} />
              <PhonePanel allowed={!!data.mobile_allowed} />
            </>
        }

          {area === "signin" && <SignInPanel code={code} onDone={load} license={lic} />}

          {area === "remote" && (remoteReady ?
        <RemotePanel licensed /> :
        <Panel title="Remote control"><p className="text-sm text-mist">Remote control switches on once one of your devices has days. Buy days in the <Link to="/shop" className="text-gold underline">guild shop</Link> to use it.</p></Panel>)}

          {area === "loot" && (lootReady ?
        <LootPanel licensed /> :
        <Panel title="Loot"><p className="text-sm text-mist">Loot is collected once the Assistant has run on one of your devices. Sign the app in first (the <b className="text-white">Sign in</b> area).</p></Panel>)}

          {area === "help" && <HowItWorks />}
        </>
      }
    </div>);

}