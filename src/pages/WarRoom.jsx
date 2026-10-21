import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LanternSpinner from "@/components/LanternSpinner";
import WarRoomApp, { JoinWar } from "@/components/war/WarRoomApp";
import { war, markCouncil } from "@/lib/warRoom";

// 6.33: the War Room inside the guild hall (members). Commanders get straight in; others need a code.
export default function WarRoom() {
  const [params] = useSearchParams();
  const [me, setMe] = useState(null);
  const load = useCallback(() => war("me").then((r) => { setMe(r); markCouncil(r.access === "council"); }).catch(() => setMe({ access: "none" })), []);
  useEffect(() => { load(); }, [load]);
  if (!me) return <LanternSpinner label="Opening the War Room" className="py-24" />;
  if (me.access === "none") return <div className="py-6"><JoinWar signedIn initialCode={params.get("code") || ""} onJoined={load} /></div>;
  return <WarRoomApp me={me} />;
}
