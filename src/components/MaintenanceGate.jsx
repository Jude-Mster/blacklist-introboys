import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { clearSession } from "@/lib/session";
import { FullLogo } from "@/components/SealLogo";
import LanternSpinner from "@/components/LanternSpinner";

const FALLBACK_NOTE = "TAPOS NA YUNG INTRO, SALAMAT";
const ACCOUNT_KEY = "bi:account";

// 6.56: while the site is on maintenance this notice replaces every page, the landing page and the
// sign-in included, and every device is signed out (its session token is dropped before anything is
// drawn). Nothing here is interactive: no links, no buttons, nothing to press.
function forgetDevice() {
  clearSession();
  try { window.localStorage.removeItem(ACCOUNT_KEY); } catch { /* storage blocked */ }
}

export default function MaintenanceGate({ children }) {
  const [state, setState] = useState({ checking: true, on: false, note: FALLBACK_NOTE });

  useEffect(() => {
    let alive = true;
    (async () => {
      let d = {};
      try {
        const res = await base44.functions.invoke("siteStatus", {});
        d = (res && res.data) || {};
      } catch {
        d = {};
      }
      const on = d.maintenance === true;
      if (on) forgetDevice();
      if (alive) {
        setState({
          checking: false,
          on,
          note: String(d.note || "").trim() || FALLBACK_NOTE,
        });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state.checking) {
    return (
      <div className="grid min-h-[100svh] place-items-center bg-ink">
        <LanternSpinner label="Opening" className="py-24" />
      </div>
    );
  }
  if (!state.on) return children;

  return (
    <div
      aria-disabled="true"
      className="pointer-events-none grid min-h-[100svh] select-none place-items-center overflow-hidden bg-ink px-5 py-16"
    >
      <div className="w-full max-w-4xl text-center">
        <FullLogo className="mx-auto w-32 sm:w-44" />
        <p className="mt-10 font-display uppercase leading-[1.05] tracking-[0.02em] text-white text-[2.5rem] sm:text-6xl md:text-7xl">
          {state.note}
        </p>
        <div className="divider-knot mx-auto mt-10 max-w-xs text-xs uppercase tracking-[0.35em]">Maintenance</div>
        <p className="mt-6 text-sm text-mist sm:text-base">
          The site is paused and everyone is signed out. Please check back later.
        </p>
      </div>
    </div>
  );
}