import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { clearSession, getSessionToken } from "@/lib/session";
import { FullLogo } from "@/components/SealLogo";
import LanternSpinner from "@/components/LanternSpinner";

const FALLBACK_NOTE = "TAPOS NA YUNG INTRO, SALAMAT";
const ACCOUNT_KEY = "bi:account";

// 6.56: while the site is on maintenance the notice is the only thing that shows, and every device
// is signed out (its session token is dropped before the notice is drawn). Only the Guild Leader can
// come back in, through the small link under the note, so the site can be opened again from the
// admin hall.
function forgetDevice() {
  clearSession();
  try { window.localStorage.removeItem(ACCOUNT_KEY); } catch { /* storage blocked */ }
}

export default function MaintenanceGate({ children }) {
  const { search } = useLocation();
  const leaderWayIn = new URLSearchParams(search).get("leader") === "1";
  const [state, setState] = useState({ checking: true, on: false, note: FALLBACK_NOTE, leader: false });

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
      let leader = false;
      if (on && getSessionToken()) {
        try {
          const res = await base44.functions.invoke("getMyAccount", { detail: false, fresh: false });
          const member = res && res.data && res.data.member;
          leader = !!member && member.role === "leader";
        } catch {
          leader = false;
        }
      }
      // Everyone is logged out: the device forgets its session before it sees anything.
      if (on && !leader) forgetDevice();
      if (alive) {
        setState({
          checking: false,
          on,
          note: String(d.note || "").trim() || FALLBACK_NOTE,
          leader,
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
  if (!state.on || state.leader || leaderWayIn) return children;

  return (
    <div className="relative grid min-h-[100svh] place-items-center overflow-hidden bg-ink px-5 py-16">
      <div className="relative z-10 w-full max-w-4xl text-center">
        <FullLogo className="mx-auto w-32 sm:w-44" />
        <p className="mt-10 font-display uppercase leading-[1.05] tracking-[0.02em] text-white text-[2.5rem] sm:text-6xl md:text-7xl">
          {state.note}
        </p>
        <div className="divider-knot mx-auto mt-10 max-w-xs text-xs uppercase tracking-[0.35em]">Maintenance</div>
        <p className="mt-6 text-sm text-mist sm:text-base">
          The site is paused and everyone is signed out. Please check back later.
        </p>
        <p className="mt-10">
          <Link to="/login?leader=1" className="text-[11px] uppercase tracking-[0.25em] text-mist/50 hover:text-mist">
            Guild Leader
          </Link>
        </p>
      </div>
    </div>
  );
}