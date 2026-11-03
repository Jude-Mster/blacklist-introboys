import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";

// Type or paste the code the app shows, check it, and approve it.
export default function SignInPanel({ code: initial, onDone, license }) {
  const [code, setCode] = useState(initial || "");
  const [found, setFound] = useState(null);       // what the code belongs to
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const look = useCallback(async (c) => {
    setBusy(true); setError(""); setFound(null);
    try {
      const res = await base44.functions.invoke("botAuth", { action: "describe", code: c });
      setFound(res.data);
    } catch (e) { setError(errorText(e, "Couldn't check that code.")); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (initial) look(initial); }, [initial, look]);

  const approve = async () => {
    setBusy(true); setError("");
    try {
      await base44.functions.invoke("botAuth", { action: "approve", code: found.code, deviceTag: found.device_tag });
      setDone(true); setFound(null); setCode("");
      await onDone();
    } catch (e) { setError(errorText(e, "Couldn't approve it.")); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <Panel title="Sign in the app">
        <p className="flex items-center gap-2 text-sm text-white"><CheckCircle2 className="h-5 w-5 text-gold" aria-hidden="true" /> Approved. Go back to the app, it signs in by itself in a few seconds.</p>
        <button onClick={() => setDone(false)} className="btn-bronze mt-3 h-9 px-3 text-sm">Sign in another PC</button>
      </Panel>
    );
  }
  return (
    <Panel title="Sign in the app">
      {found ? (
        <div className="space-y-3 text-sm">
          <p className="text-mist">{found.platform === "android" ? "The Assistant on a phone" : "An app on a PC"} is asking to sign in as you.</p>
          {found.mobile_off && <p className="text-ember">The phone Assistant isn&apos;t switched on for you yet, so it will sign in but not run. Ask the Guild Leader to allow it.</p>}
          <p className="rounded-md border border-bronze/50 bg-black/30 px-3 py-2 text-white">
            Device ID <b className="font-mono text-lg text-gold">{found.device_tag}</b>
            {found.app_version && <span className="ml-2 text-xs text-mist">app {found.app_version}</span>}
          </p>
          <p className="flex items-start gap-2 text-mist"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            Only approve it if the same device ID is showing in <b className="text-white">your own</b> app. If someone sent you this code, press Cancel.</p>
          {found.device && <p className="text-mist">This PC will run on <b className="text-white">{found.device}</b>.</p>}
          {found.other_device && <p className="text-ember">Every device with days is in use on another PC, so the app on this one will not run yet. Move some days to a new device (in Overview), or buy days for a new device in the shop.</p>}
          {!license.active && <p className="text-mist">You have no active days, so the app will sign in but not run until you buy some.</p>}
          {error && <p role="alert" className="text-ember">{error}</p>}
          <div className="flex gap-2">
            <button onClick={approve} disabled={busy} className="btn-seal h-10 flex-1 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}</button>
            <button onClick={() => { setFound(null); setError(""); }} disabled={busy} className="btn-bronze h-10 flex-1 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); look(code); }} className="space-y-2">
          <label htmlFor="as-code" className="label">The code shown in the app (like K7QM-4TXD)</label>
          <div className="flex gap-2">
            <input id="as-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="field font-mono tracking-widest" placeholder="XXXX-XXXX" required />
            <button type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 8} className="btn-seal h-10 px-4 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}</button>
          </div>
          {error && <p role="alert" className="text-sm text-ember">{error}</p>}
          <p className="pt-1 text-xs text-mist">Open the Assistant on your PC or phone and press <b className="text-white">Sign in with Discord</b>: the browser opens this page with the code already filled in.</p>
        </form>
      )}
    </Panel>
  );
}