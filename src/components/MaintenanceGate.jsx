import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/lib/session";
import { FullLogo } from "@/components/SealLogo";
import LanternSpinner from "@/components/LanternSpinner";

const FALLBACK_NOTE = "TAPOS NA YUNG INTRO, SALAMAT";
// The Guild Leader and the Vice Guild Members keep the site while it is on maintenance, so it can
// be switched back off from the admin hall.
const STAFF = ["leader", "officer"];

export default function MaintenanceGate({ children }) {
  const [state, setState] = useState({ checking: true, on: false, note: FALLBACK_NOTE, staff: false });

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
      let staff = false;
      if (d.maintenance === true && getSessionToken()) {
        try {
          const res = await base44.functions.invoke("getMyAccount", { detail: false, fresh: false });
          const member = res && res.data && res.data.member;
          staff = !!member && STAFF.includes(member.role);
        } catch {
          staff = false;
        }
      }
      if (alive) {
        setState({
          checking: false,
          on: d.maintenance === true,
          note: String(d.note || "").trim() || FALLBACK_NOTE,
          staff,
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
  if (!state.on || state.staff) return children;

  return (
    <div className="relative grid min-h-[100svh] place-items-center overflow-hidden bg-ink px-5 py-16">
      <div className="relative z-10 w-full max-w-4xl text-center">
        <FullLogo className="mx-auto w-32 sm:w-44" />
        <p className="mt-10 font-display uppercase leading-[1.05] tracking-[0.02em] text-white text-[2.5rem] sm:text-6xl md:text-7xl">
          {state.note}
        </p>
        <div className="divider-knot mx-auto mt-10 max-w-xs text-xs uppercase tracking-[0.35em]">Maintenance</div>
        <p className="mt-6 text-sm text-mist sm:text-base">
          The site is paused for now. Please check back later.
        </p>
      </div>
    </div>
  );
}