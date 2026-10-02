import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import RankBadge from "@/components/RankBadge";
import { useGuild, errorText } from "@/lib/GuildContext";
import { ROLE_TITLE, RANKS } from "@/lib/ranks";

const GRANTABLE = ["member", "guild_member", "officer"];
const order = (role) => RANKS.length - RANKS.indexOf(role);

// Everyone in the guild with their rank. The Guild Leader changes ranks here.
export default function RosterSection() {
  const { account } = useGuild();
  const me = account.member;
  const isLeader = me.role === "leader";
  const [members, setMembers] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("adminAction", { action: "roster" });
      setMembers(res.data.members || []);
    } catch (e) {
      setMembers([]);
      setError(errorText(e, "Couldn't load the roster."));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (m, role) => {
    setBusy(m.discord_id);
    setError("");
    setMsg("");
    try {
      await base44.functions.invoke("adminAction", { action: "setRole", discordId: m.discord_id, role });
      setMembers((list) => list.map((x) => (x.discord_id === m.discord_id ? { ...x, role } : x)));
      setMsg(`${m.discord_name || m.discord_id} is now ${ROLE_TITLE[role]}.`);
    } catch (e) {
      setError(errorText(e, "Couldn't change that rank."));
    } finally {
      setBusy("");
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members || [])
      .filter((m) => !q || `${m.discord_name || ""} ${m.discord_username || ""} ${m.discord_id}`.toLowerCase().includes(q))
      .sort((a, b) => order(a.role) - order(b.role) || (b.points || 0) - (a.points || 0));
  }, [members, query]);

  const counts = useMemo(() => {
    const c = {};
    for (const m of members || []) c[m.role] = (c[m.role] || 0) + 1;
    return c;
  }, [members]);

  return (
    <Panel title="Guild roster and ranks">
      <p className="mb-3 text-sm text-mist">
        {isLeader
          ? "Pick a rank next to a name to promote or demote. Changes are announced in guild chat."
          : "Only the Guild Leader can change ranks."}{" "}
        Vice Guild Members can award points, ban members from games and remove chat messages.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {[...RANKS].reverse().map((r) => (
          <span key={r} className="flex items-center gap-1.5 text-xs text-mist">
            <RankBadge role={r} /> {counts[r] || 0}
          </span>
        ))}
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a member" aria-label="Find a member" className="field h-10 pl-9 text-sm" />
      </div>

      {members === null ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading the roster</p>
      ) : shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-mist">{query ? "No member matches that name." : "No members have linked Discord yet."}</p>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-bronze/25 overflow-y-auto pr-1">
          {shown.map((m) => {
            const self = m.discord_id === me.discord_id;
            const locked = !isLeader || m.role === "leader" || self;
            return (
              <li key={m.discord_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <Avatar url={m.avatar_url} name={m.discord_name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {m.discord_name || m.discord_id}
                    {self ? " (you)" : ""}
                  </p>
                  <p className="text-xs text-mist">
                    {Number(m.points || 0).toLocaleString()} points{m.banned ? " · banned from games" : ""}{m.user_id ? "" : " · hasn't logged in yet"}
                  </p>
                </div>
                {locked ? (
                  <RankBadge role={m.role} />
                ) : (
                  <span className="flex items-center gap-2">
                    {busy === m.discord_id && <Loader2 className="h-4 w-4 animate-spin text-mist" />}
                    <select
                      value={GRANTABLE.includes(m.role) ? m.role : "member"}
                      onChange={(e) => setRole(m, e.target.value)}
                      disabled={!!busy}
                      aria-label={`Rank for ${m.discord_name || m.discord_id}`}
                      className="field h-9 w-auto py-0 pr-8 text-sm"
                    >
                      {GRANTABLE.map((r) => (
                        <option key={r} value={r}>{ROLE_TITLE[r]}</option>
                      ))}
                    </select>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p role="status" className="mt-3 text-sm text-jade">{msg}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}
    </Panel>
  );
}