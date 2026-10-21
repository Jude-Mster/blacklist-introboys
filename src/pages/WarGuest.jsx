import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { LogOut } from "lucide-react";
import LanternSpinner from "@/components/LanternSpinner";
import { FullLogo } from "@/components/SealLogo";
import WarRoomApp, { JoinWar } from "@/components/war/WarRoomApp";
import { war, setPass } from "@/lib/warRoom";
import { getSessionToken } from "@/lib/session";

// 6.33: the War Room for people outside the guild (allied guild leaders): no Discord sign-in, just the
// invite code the Guild Leader gave them. Guild members are sent to the War Room inside the guild hall.
export default function WarGuest() {
  const [params] = useSearchParams();
  const code = params.get("code") || "";
  const [me, setMe] = useState(null);
  const load = useCallback(() => war("me").then(setMe).catch(() => setMe({ access: "none" })), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = document.title; document.title = "War Room · BLACKLIST INTROBOYS"; return () => { document.title = t; }; }, []);
  if (getSessionToken()) return <Navigate to={"/warroom" + (code ? `?code=${encodeURIComponent(code)}` : "")} replace />;
  return (
    <div className="min-h-[100svh] bg-[#070908] text-[hsl(var(--foreground))]">
      <header className="flex h-14 items-center gap-3 border-b border-bronze/40 bg-black/60 px-4">
        <Link to="/" aria-label="BLACKLIST INTROBOYS"><FullLogo className="h-9 w-auto" /></Link>
        <span className="flex-1" />
        {me && me.access !== "none" && (
          <>
            <span className="min-w-0 truncate text-sm text-mist"><b style={{ color: me.color }}>{me.name}</b> · <span style={{ color: me.color }}>{me.guild}</span></span>
            <button type="button" onClick={() => { setPass(""); setMe({ access: "none" }); }} className="btn-bronze h-9 px-3 text-sm"><LogOut className="h-4 w-4" /> Leave</button>
          </>
        )}
      </header>
      <main className="px-4 py-6">
        {!me ? <LanternSpinner label="Opening the War Room" className="py-24" />
          : me.access === "none" ? <JoinWar initialCode={code} onJoined={load} />
          : <WarRoomApp me={me} standalone />}
      </main>
    </div>
  );
}
