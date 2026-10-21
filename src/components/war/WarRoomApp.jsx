import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Swords, Users, KeyRound, X, Copy, Check, Loader2, ScrollText, Trash2, Bell, BellOff, MessageSquare, Pencil } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Chalkboard from "./Chalkboard";
import WarChat, { Badge } from "./WarChat";
import HsbTimer from "@/components/HsbTimer";
import { WAR_MAPS, TRIBES, mapById, mapUrl } from "@/lib/warMaps";
import {
  war, warError, applyLocal, setPass, markCouncil, GUILD_COLORS, planSeen, markPlanSeen,
  warPushSupported, enableWarPush, disableWarPush, warPushStatus, warPushEndpoint
} from "@/lib/warRoom";
import { cn } from "@/lib/utils";

// 6.33: the War Room. Plans (one per battle) hold maps; each map is a shared chalkboard. Everyone in the War
// Room sees changes within a second or two; their own drawing shows at once.
const CHAT_OPEN_KEY = "bi.war.chatopen";
const wide = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(min-width: 1280px)").matches;

export default function WarRoomApp({ me, standalone = false }) {
  const command = me.access === "command";
  const [params] = useSearchParams();
  const askedPlan = params.get("plan") || "";
  const [chatOpen, setChatOpen] = useState(() => { try { const v = localStorage.getItem(CHAT_OPEN_KEY); return v ? v === "1" : wide(); } catch { return wide(); } });
  const [chatUnread, setChatUnread] = useState(0);
  const [roster, setRoster] = useState(null);
  const [seen, setSeen] = useState(planSeen);
  const toggleChat = (v) => { setChatOpen(v); try { localStorage.setItem(CHAT_OPEN_KEY, v ? "1" : "0"); } catch { /* storage off */ } };
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState("");
  const [pages, setPages] = useState([]);
  const [plan, setPlan] = useState(null);
  const [pageId, setPageId] = useState("");
  const [error, setError] = useState("");
  const [newPlan, setNewPlan] = useState(false);
  const [picker, setPicker] = useState(false);
  const [invites, setInvites] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [strength, setStrength] = useState(0.72);

  const loadPlans = useCallback(async (pick) => {
    try {
      const r = await war("plans");
      setPlans(r.plans);
      setPlanId((cur) => {
        if (pick) return pick;
        if (cur && r.plans.some((p) => p.id === cur)) return cur;
        if (askedPlan && r.plans.some((p) => p.id === askedPlan)) return askedPlan;   // opened from a notification
        return (r.plans[0] && r.plans[0].id) || "";
      });
    } catch (e) { setError(warError(e)); }
  }, [askedPlan]);
  useEffect(() => { loadPlans(); }, [loadPlans]);
  // the plan list and who is here, kept fresh (new plans and changes show with a "new" mark)
  useEffect(() => {
    let alive = true;
    const loadRoster = () => war("roster").then((r) => alive && setRoster(r.guilds)).catch(() => {});
    loadRoster();
    const t1 = setInterval(() => { if (!document.hidden) loadPlans(); }, 20000);
    const t2 = setInterval(() => { if (!document.hidden) loadRoster(); }, 30000);
    return () => { alive = false; clearInterval(t1); clearInterval(t2); };
  }, [loadPlans]);
  // the plan on screen counts as seen
  useEffect(() => {
    const p = (plans || []).find((x) => x.id === planId);
    if (p) { markPlanSeen(p.id, p.updated_at); setSeen(planSeen()); }
  }, [plans, planId]);
  const isNew = (p) => p.id !== planId && p.updated_by !== me.name && (!seen[p.id] || seen[p.id] < p.updated_at);
  const colorOf = useCallback((name) => {
    for (const g of roster || []) if (g.people.some((x) => x.name === name)) return g.color;
    return "";
  }, [roster]);

  useEffect(() => {
    if (!planId) { setPages([]); setPlan(null); setPageId(""); return; }
    let alive = true;
    war("pages", { planId }).then((r) => {
      if (!alive) return;
      setPlan(r.plan); setPages(r.pages);
      setPageId((cur) => (r.pages.some((g) => g.id === cur) ? cur : (r.pages[0] && r.pages[0].id) || ""));
    }).catch((e) => alive && setError(warError(e)));
    return () => { alive = false; };
  }, [planId]);

  const page = pages.find((g) => g.id === pageId);

  return (
    <div className={cn("war-room flex flex-col gap-4", standalone && "mx-auto max-w-[96rem]")}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-extrabold gilt-text sm:text-4xl">War Room</h1>
          <p className="mt-1 max-w-2xl text-sm text-mist">Plan the Holy Stone Battle on the real maps: chalk the routes, mark the gates and stones, and give every team its orders. Only the commanders and people the Guild Leader invites can see this.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HsbTimer />
          <PlanAlerts />
          <button type="button" onClick={() => toggleChat(!chatOpen)} aria-pressed={chatOpen} className={cn("btn-bronze h-10 px-3 text-sm", chatOpen && "xl:!border-gold xl:!text-gold")}>
            <MessageSquare className="h-4 w-4" /> Chat{chatUnread > 0 && !chatOpen ? <Badge n={chatUnread} /> : null}
          </button>
          {me.leader && <button type="button" onClick={() => setInvites(true)} className="btn-bronze h-10 px-3 text-sm"><KeyRound className="h-4 w-4" /> Invite codes</button>}
        </div>
      </header>
      {error && <p role="alert" className="text-sm text-ember">{error}</p>}

      <div className={cn("grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]", chatOpen && "xl:grid-cols-[13rem_minmax(0,1fr)_20rem] 2xl:grid-cols-[15rem_minmax(0,1fr)_24rem]")}>
        {/* plans */}
        <aside className="gw order-2 flex min-w-0 flex-col gap-2 p-3 lg:order-none" aria-label="Battle plans">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-bold uppercase tracking-[0.12em] text-mist">Battle plans</h2>
            {command && <button type="button" onClick={() => setNewPlan((v) => !v)} className="btn-bronze h-8 px-2 text-xs"><Plus className="h-3.5 w-3.5" /> New</button>}
          </div>
          {newPlan && <NewPlan onDone={(p) => { setNewPlan(false); if (p) loadPlans(p.id); }} />}
          {plans === null && <p className="flex items-center gap-2 py-3 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>}
          {plans && plans.length === 0 && <p className="py-2 text-sm text-mist">{command ? "No plans yet. Press New to start one." : "No plans yet. The commanders will open one."}</p>}
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {(plans || []).map((p) => (
              <li key={p.id} className="shrink-0 lg:shrink">
                <button type="button" onClick={() => setPlanId(p.id)} aria-current={p.id === planId}
                  className={cn("war-plan w-56 text-left lg:w-full", p.id === planId && "war-plan-on")}>
                  <span className="flex items-center gap-1.5"><span className="block min-w-0 flex-1 truncate font-bold">{p.title}</span>{isNew(p) && <span className="shrink-0 rounded bg-[#e3171d] px-1.5 text-[10px] font-bold uppercase leading-4 text-white">new</span>}</span>
                  <span className="block truncate text-xs text-mist">{isNew(p) && p.updated_by ? `changed by ${p.updated_by}` : `by ${p.by}`} · {new Date(p.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </button>
              </li>
            ))}
          </ul>
          {plan && <Orders plan={plan} onSaved={setPlan} command={command} onDeleted={() => { setPlanId(""); loadPlans(); }} />}
          <Roster guilds={roster} />
        </aside>

        {/* maps of the plan + the board */}
        <section className="flex min-w-0 flex-col gap-3" aria-label="Map board">
          {plan && (
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Maps in this plan" className="flex min-w-0 flex-wrap gap-1.5">
                {pages.map((g) => {
                  const m = mapById(g.map);
                  return (
                    <button key={g.id} type="button" role="tab" aria-selected={g.id === pageId} onClick={() => setPageId(g.id)} className={cn("war-tab", g.id === pageId && "war-tab-on")}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TRIBES[m.tribe].color }} aria-hidden="true" />{m.name}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => setPicker(true)} className="war-tab border-dashed"><Plus className="h-3.5 w-3.5" /> Add map</button>
              <span className="flex-1" />
              <label className="flex items-center gap-2 text-xs text-mist">Map
                <input type="range" min="0.25" max="1" step="0.05" value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-24 accent-[#c9a227]" aria-label="How strongly the map shows under the chalk" />
              </label>
            </div>
          )}
          {page ? (
            <Board key={page.id} pageMeta={page} me={me} command={command} colorOf={colorOf} showPins={showPins} onTogglePins={() => setShowPins((v) => !v)} strength={strength}
              onRemoved={command && pages.length > 1 ? async () => { try { await war("deletePage", { id: page.id }); setPages((ps) => ps.filter((x) => x.id !== page.id)); setPageId(""); } catch (e) { setError(warError(e)); } } : null} />
          ) : (
            <div className="war-frame"><div className="war-slate grid min-h-[22rem] place-items-center p-8 text-center">
              <p className="war-hand max-w-sm text-2xl text-[#f4f1ea]/85">{plans && plans.length ? "Pick a plan" : command ? "Start a plan for the next Holy Stone Battle" : "Waiting for the commanders"}</p>
            </div></div>
          )}
        </section>

        {/* 6.34: the chat. A column beside the board on wide screens; a panel over the page on smaller ones. */}
        <WarChat me={me} open={chatOpen} onUnread={setChatUnread} onClose={() => toggleChat(false)}
          className={cn(
            !chatOpen && "hidden",
            "fixed inset-0 z-[80] rounded-none sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(40rem,calc(100svh-6rem))] sm:w-[24rem] sm:rounded-[10px] sm:shadow-2xl",
            "xl:sticky xl:inset-auto xl:top-24 xl:z-auto xl:h-[calc(100svh-8rem)] xl:w-auto xl:shadow-none"
          )} />
      </div>
      {!chatOpen && (
        <button type="button" onClick={() => toggleChat(true)} aria-label="Open the chat"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-[60] flex h-12 items-center gap-2 rounded-full border border-gold/70 bg-[#141a17] px-4 font-heading text-sm font-bold text-gold shadow-xl md:bottom-6">
          <MessageSquare className="h-5 w-5" /> Chat{chatUnread > 0 ? <Badge n={chatUnread} /> : null}
        </button>
      )}

      {picker && plan && <MapPicker onClose={() => setPicker(false)} onPick={async (map) => {
        setPicker(false);
        try { const r = await war("addPage", { planId: plan.id, map }); setPages((ps) => [...ps, r.page]); setPageId(r.page.id); } catch (e) { setError(warError(e)); }
      }} />}
      {invites && <InvitePanel onClose={() => setInvites(false)} />}
    </div>
  );
}

// One map's chalkboard, kept in step with everyone else's.
function Board({ pageMeta, me, command, colorOf, showPins, onTogglePins, strength, onRemoved }) {
  const map = mapById(pageMeta.map);
  const [shapes, setShapes] = useState([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const v = useRef(-1);
  const queue = useRef([]);
  const sending = useRef(false);
  const timer = useRef(0);
  const [lastBy, setLastBy] = useState(pageMeta.edited_by || "");

  const flush = useCallback(async () => {
    timer.current = 0;
    if (sending.current || !queue.current.length) return;
    sending.current = true; setSaving(true);
    const ops = queue.current.splice(0, 60);
    try {
      const r = await war("edit", { id: pageMeta.id, ops });
      v.current = r.page.v;
      setShapes(applyLocal(r.page.shapes, queue.current, me.name));
      setNote("");
    } catch (e) {
      setNote(warError(e, "Couldn't save the last drawing."));
      // put the board back to what the server has
      try { const r = await war("page", { id: pageMeta.id, v: -1 }); v.current = r.page.v; setShapes(applyLocal(r.page.shapes, queue.current, me.name)); } catch { /* next poll */ }
    } finally {
      sending.current = false; setSaving(false);
      if (queue.current.length) timer.current = setTimeout(flush, 120);
    }
  }, [pageMeta.id, me.name]);

  const onOps = useCallback((ops) => {
    queue.current.push(...ops);
    setShapes((s) => applyLocal(s, ops, me.name));
    if (!timer.current) timer.current = setTimeout(flush, 200);
  }, [flush, me.name]);

  useEffect(() => {
    let alive = true, t = 0;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden && !sending.current && !queue.current.length) {
        try {
          const r = await war("page", { id: pageMeta.id, v: v.current });
          if (alive && !r.same && r.page && !sending.current && !queue.current.length) { v.current = r.page.v; setShapes(r.page.shapes); setLastBy(r.page.edited_by || ""); }
          if (alive) setReady(true);
        } catch (e) { if (alive) setNote(warError(e, "Can't reach the War Room. Trying again.")); }
      }
      t = setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; clearTimeout(t); clearTimeout(timer.current); };
  }, [pageMeta.id]);

  return (
    <div className="flex flex-col gap-2">
      {!ready ? <p className="flex items-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Opening {map.name}</p> : null}
      <Chalkboard map={map} shapes={shapes} onOps={onOps} me={me} canClear={command} saving={saving} showPins={showPins} onTogglePins={onTogglePins} mapStrength={strength} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mist">
        <span>{lastBy ? <>Last change by <b style={{ color: colorOf(lastBy) || undefined }}>{lastBy}</b></> : ""}{note ? <span className="ml-2 text-ember">{note}</span> : null}</span>
        {onRemoved && <button type="button" onClick={onRemoved} className="inline-flex items-center gap-1 underline hover:text-ember"><Trash2 className="h-3.5 w-3.5" /> Remove this map from the plan</button>}
      </div>
    </div>
  );
}

function NewPlan({ onDone }) {
  const [title, setTitle] = useState("");
  const [map, setMap] = useState("z038");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await war("createPlan", { title: title || "HSB plan", map }); onDone(r.plan); } catch (x) { setErr(warError(x)); setBusy(false); }
  };
  return (
    <form onSubmit={go} className="flex flex-col gap-2 rounded-md border border-bronze/40 bg-black/30 p-2.5">
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Wed HSB: take Lunar" className="field h-9 text-sm" aria-label="Plan name" />
      <select value={map} onChange={(e) => setMap(e.target.value)} className="field h-9 text-sm" aria-label="First map">
        {WAR_MAPS.map((m) => <option key={m.id} value={m.id}>{m.name} ({TRIBES[m.tribe].name})</option>)}
      </select>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-seal h-9 flex-1 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open plan"}</button>
        <button type="button" onClick={() => onDone(null)} className="btn-bronze h-9 px-3 text-sm">Cancel</button>
      </div>
      {err && <p className="text-xs text-ember">{err}</p>}
    </form>
  );
}

// The written orders of a plan (anyone in the War Room can edit them).
function Orders({ plan, onSaved, command, onDeleted }) {
  const [text, setText] = useState(plan.notes || "");
  const [state, setState] = useState("");
  const [ask, setAsk] = useState(false);
  useEffect(() => { setText(plan.notes || ""); }, [plan.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (text === (plan.notes || "")) return;
    setState("saving");
    try { const r = await war("updatePlan", { id: plan.id, notes: text }); onSaved(r.plan); setState("saved"); } catch (e) { setState(warError(e)); }
  };
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-bronze/30 pt-3">
      <label htmlFor="war-orders" className="flex items-center gap-1.5 font-heading text-sm font-bold uppercase tracking-[0.12em] text-mist"><ScrollText className="h-4 w-4" /> Orders</label>
      <textarea id="war-orders" value={text} onChange={(e) => { setText(e.target.value); setState(""); }} onBlur={save} rows={7} maxLength={2000}
        placeholder={"Team A: break the Ghost Valley gate\nTeam B: guardian stones, east side\nEveryone: Lunar stone at 12:20"} className="war-orders field !h-auto min-h-[11rem] resize-y text-sm" />
      <span className="text-xs text-mist">{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state || "Saved when you click away."}</span>
      {command && (ask
        ? <span className="flex items-center gap-2 text-xs">Delete “{plan.title}”? <button type="button" onClick={async () => { try { await war("deletePlan", { id: plan.id }); onDeleted(); } catch { /* shown on reload */ } }} className="font-bold text-ember underline">Delete</button><button type="button" onClick={() => setAsk(false)} className="underline">Keep</button></span>
        : <button type="button" onClick={() => setAsk(true)} className="self-start text-xs text-mist underline hover:text-ember">Delete this plan</button>)}
    </div>
  );
}

function MapPicker({ onPick, onClose }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const groups = ["wd", "bs", "gt", "none"];
  return (
    <div role="dialog" aria-modal="true" aria-label="Add a map" className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/75 p-4 sm:p-8" onClick={onClose}>
      <div className="gw w-full max-w-4xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-gold">Add a map to the plan</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border border-bronze/50"><X className="h-4 w-4" /></button>
        </div>
        {groups.map((t) => (
          <div key={t} className="mb-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: TRIBES[t].color }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: TRIBES[t].color }} />{t === "none" ? "Between the tribes" : `${TRIBES[t].name} lands`}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WAR_MAPS.filter((m) => m.tribe === t).map((m) => (
                <button key={m.id} type="button" onClick={() => onPick(m.id)} className="war-thumb group text-left">
                  <span className="block aspect-[4/3] overflow-hidden rounded bg-black"><img src={mapUrl(m.id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" /></span>
                  <span className="mt-1 block truncate text-sm font-bold">{m.name}</span>
                  <span className="block text-xs text-mist">{m.step}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The Guild Leader's invite codes and the council (people who joined with a code).
function InvitePanel({ onClose }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ code: "", label: "", guild: "", color: GUILD_COLORS[0].color, maxUses: "0", accessDays: "30", validDays: "7" });
  const [editing, setEditing] = useState(null);   // { id, guild, color }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const load = useCallback(async () => { try { setData(await war("invites")); } catch (e) { setErr(warError(e)); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const create = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await war("createInvite", { code: form.code, label: form.label, guild: form.guild, color: form.color, maxUses: Number(form.maxUses), accessDays: Number(form.accessDays), validDays: Number(form.validDays) });
      setForm({ ...form, code: "", label: "", guild: "" }); await load();
    } catch (x) { setErr(warError(x)); }
    setBusy(false);
  };
  const link = (code) => `${window.location.origin}/war?code=${encodeURIComponent(code)}`;
  const copy = async (code) => { try { await navigator.clipboard.writeText(link(code)); setCopied(code); setTimeout(() => setCopied(""), 1500); } catch { /* copy blocked */ } };
  const act = async (action, id) => { try { await war(action, { id }); await load(); } catch (e) { setErr(warError(e)); } };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const saveGuild = async () => { try { await war("updateInvite", { id: editing.id, guild: editing.guild, color: editing.color }); setEditing(null); await load(); } catch (e) { setErr(warError(e)); } };
  const byGuild = (() => {
    const m = new Map();
    for (const g of data ? data.council : []) { const k = g.guild.toLowerCase(); if (!m.has(k)) m.set(k, { guild: g.guild, color: g.color, people: [] }); m.get(k).people.push(g); }
    return [...m.values()];
  })();
  return (
    <div role="dialog" aria-modal="true" aria-label="Invite codes" className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/75 p-4 sm:p-8" onClick={onClose}>
      <div className="gw w-full max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-gold"><KeyRound className="h-5 w-5" /> Invite codes</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border border-bronze/50"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-sm text-mist">Make a code and send it (or its link) to the people you want in the War Room: allied guild leaders, or members. Someone who isn't a guild member only gets the War Room, nothing else on the site.</p>
        <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_1fr]">
          <label className="label">Code (6 to 24 letters, numbers, dashes)<input value={form.code} onChange={set("code")} maxLength={24} placeholder="TIGER-ALLY" className="field mt-1 w-full uppercase" /></label>
          <label className="label">Who it is for (optional)<input value={form.label} onChange={set("label")} maxLength={40} placeholder="Golden Tiger leaders" className="field mt-1 w-full" /></label>
          <label className="label">Their guild<input value={form.guild} onChange={set("guild")} maxLength={32} placeholder="e.g. Golden Tiger Clan" className="field mt-1 w-full" /></label>
          <div className="label">Guild colour (their names show in it)<ColorPick value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></div>
          <label className="label">Uses (0 = no limit)<input type="number" min="0" max="500" value={form.maxUses} onChange={set("maxUses")} className="field mt-1 w-full" /></label>
          <label className="label">They stay in for (days)<input type="number" min="1" max="365" value={form.accessDays} onChange={set("accessDays")} className="field mt-1 w-full" /></label>
          <label className="label">Code works for (days, 0 = no end)<input type="number" min="0" max="365" value={form.validDays} onChange={set("validDays")} className="field mt-1 w-full" /></label>
          <div className="flex items-end"><button type="submit" disabled={busy || form.code.trim().length < 6} className="btn-seal h-10 w-full text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Make code"}</button></div>
        </form>
        {err && <p role="alert" className="mt-2 text-sm text-ember">{err}</p>}
        <h3 className="mt-4 font-heading text-sm font-bold uppercase tracking-[0.12em] text-mist">Codes</h3>
        <ul className="mt-1 divide-y divide-bronze/25 text-sm">
          {(data ? data.invites : []).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <code className={cn("rounded bg-black/40 px-2 py-0.5 font-mono font-bold tracking-wider", i.revoked ? "text-mist line-through" : "text-gold")}>{i.code}</code>
              {editing && editing.id === i.id ? (
                <span className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input value={editing.guild} onChange={(e) => setEditing({ ...editing, guild: e.target.value })} maxLength={32} aria-label="Guild" className="field h-8 w-40 text-sm" />
                  <ColorPick value={editing.color} onChange={(c) => setEditing({ ...editing, color: c })} small />
                  <button type="button" onClick={saveGuild} className="btn-seal h-8 px-2 text-xs">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="text-xs underline">Cancel</button>
                </span>
              ) : (
                <button type="button" disabled={i.revoked} onClick={() => setEditing({ id: i.id, guild: i.guild, color: i.color })} title="Change the guild or its colour"
                  className="inline-flex items-center gap-1 rounded border px-1.5 text-[11px] font-bold uppercase" style={{ color: i.color, borderColor: `${i.color}80` }}>
                  {i.guild}{!i.revoked && <Pencil className="h-3 w-3" />}
                </button>
              )}
              <span className="min-w-0 flex-1 truncate text-mist">{i.label || "—"} · used {i.uses}{i.max_uses ? `/${i.max_uses}` : ""} · {i.access_days} days{i.expires_at ? ` · until ${new Date(i.expires_at).toLocaleDateString()}` : ""}</span>
              {!i.revoked && <button type="button" onClick={() => copy(i.code)} className="btn-bronze h-8 px-2 text-xs">{copied === i.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Link</button>}
              {!i.revoked && <button type="button" onClick={() => act("revokeInvite", i.id)} className="btn-bronze h-8 px-2 text-xs !text-ember">Cancel</button>}
            </li>
          ))}
          {data && !data.invites.length && <li className="py-2 text-mist">No codes yet.</li>}
        </ul>
        <h3 className="mt-4 flex items-center gap-1.5 font-heading text-sm font-bold uppercase tracking-[0.12em] text-mist"><Users className="h-4 w-4" /> Council (joined with a code)</h3>
        {byGuild.map((grp) => (
          <div key={grp.guild} className="mt-2">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: grp.color }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: grp.color }} />{grp.guild} · {grp.people.length}</h4>
            <ul className="divide-y divide-bronze/25 text-sm">
              {grp.people.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-4">
                  <span className="font-bold" style={{ color: g.color }}>{g.name}</span>
                  <span className="rounded border border-bronze/50 px-1.5 text-[11px] uppercase text-mist">{g.member ? "member" : "guest"}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-mist">via {g.via} · until {new Date(g.until).toLocaleDateString()}</span>
                  <button type="button" onClick={() => act("removeGuest", g.id)} className="btn-bronze h-8 px-2 text-xs !text-ember">Remove</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {data && !data.council.length && <p className="py-2 text-sm text-mist">Nobody has joined with a code yet.</p>}
      </div>
    </div>
  );
}

function ColorPick({ value, onChange, small }) {
  return (
    <span role="radiogroup" aria-label="Guild colour" className={cn("flex flex-wrap gap-1.5", !small && "mt-1.5")}>
      {GUILD_COLORS.map((c) => (
        <button key={c.color} type="button" role="radio" aria-checked={value === c.color} aria-label={c.label} title={c.label} onClick={() => onChange(c.color)}
          className={cn("rounded-full border-2 transition-transform", small ? "h-5 w-5" : "h-7 w-7", value === c.color ? "scale-110 border-white" : "border-transparent")} style={{ background: c.color }} />
      ))}
    </span>
  );
}

// 6.34: everyone in the War Room, grouped by guild, each guild in its colour, online people first.
function Roster({ guilds }) {
  if (!guilds) return null;
  const online = guilds.reduce((n, g) => n + g.online, 0);
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-bronze/30 pt-3">
      <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold uppercase tracking-[0.12em] text-mist"><Users className="h-4 w-4 shrink-0" /> Who's here <span className="ml-auto whitespace-nowrap font-body text-xs normal-case tracking-normal text-[#7be08b]">{online} online</span></h2>
      {guilds.map((g) => (
        <div key={g.guild} className="rounded-md border px-2 py-1.5" style={{ borderColor: `${g.color}55`, background: `${g.color}0d` }}>
          <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: g.color }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} /><span className="min-w-0 flex-1 truncate">{g.guild}</span><span className="text-mist">{g.people.length}</span>
          </h3>
          <ul className="mt-1 flex flex-col gap-0.5">
            {g.people.map((x) => (
              <li key={x.id} className="flex items-center gap-1.5 text-sm">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", x.online ? "bg-[#7be08b]" : "bg-white/15")} title={x.online ? "Online" : "Away"} />
                <span className={cn("min-w-0 truncate", !x.online && "opacity-60")} style={{ color: g.color }}>{x.name}</span>
                {(x.role === "leader" || x.role === "officer") && <span className="ml-auto shrink-0 text-[10px] uppercase text-mist">{x.role === "leader" ? "Leader" : "Vice"}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// 6.34: plan notifications on this phone or computer (new plans, new orders, maps added, drawings).
function PlanAlerts() {
  const [on, setOn] = useState(() => !!warPushEndpoint());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { let alive = true; warPushStatus().then((v) => alive && setOn(v)); return () => { alive = false; }; }, []);
  const toggle = async () => {
    setBusy(true); setMsg("");
    if (on) { await disableWarPush(); setOn(false); }
    else {
      const r = await enableWarPush();
      if (r === "on") { setOn(true); setMsg("You'll get a notification when a plan changes."); }
      else setMsg(r === "denied" ? "Notifications are blocked for this site. Allow them in the browser settings." : r === "unsupported" ? (/iPhone|iPad/.test(navigator.userAgent) ? "On iPhone: add the site to your Home Screen first, then switch alerts on there." : "This browser can't show notifications.") : "Couldn't switch alerts on. Try again.");
    }
    setBusy(false);
  };
  if (!warPushSupported() && !msg) {
    return <button type="button" onClick={toggle} className="btn-bronze h-10 px-3 text-sm" title="Plan notifications"><BellOff className="h-4 w-4" /> Plan alerts</button>;
  }
  return (
    <span className="relative">
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={on} title={on ? "Plan notifications are on for this device" : "Get a notification when a plan changes"}
        className={cn("btn-bronze h-10 px-3 text-sm", on && "!border-[#7be08b] !text-[#7be08b]")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} Plan alerts {on ? "on" : "off"}
      </button>
      {msg && <span role="status" className="absolute right-0 top-11 z-20 w-64 rounded-md border border-bronze/50 bg-black/90 p-2 text-xs text-[#e9e6dc]" onClick={() => setMsg("")}>{msg}</span>}
    </span>
  );
}

// Joining with a code. Members join as themselves; guests choose the name the board shows.
export function JoinWar({ signedIn, initialCode = "", onJoined }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await war("redeem", { code, name });
      if (r.token) setPass(r.token);
      if (signedIn) markCouncil(true);
      onJoined && onJoined();
    } catch (x) { setErr(warError(x)); setBusy(false); }
  };
  return (
    <div className="war-frame mx-auto w-full max-w-lg">
      <form onSubmit={go} className="war-slate flex flex-col gap-3 p-6 sm:p-8">
        <p className="war-hand text-3xl text-[#ffd84d]">War Room</p>
        <p className="text-sm text-[#e9e6dc]/85">The HSB planning board of BLACKLIST INTROBOYS. Enter the invite code the Guild Leader gave you.</p>
        <label className="text-sm text-[#e9e6dc]/80">Invite code
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={24} autoComplete="off" className="field mt-1 w-full font-mono uppercase tracking-wider" placeholder="TIGER-ALLY" />
        </label>
        {!signedIn && (
          <label className="text-sm text-[#e9e6dc]/80">Your name on the board
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="field mt-1 w-full" placeholder="e.g. Kaze (Golden Tiger)" />
          </label>
        )}
        <button type="submit" disabled={busy || code.trim().length < 6 || (!signedIn && name.trim().length < 2)} className="btn-seal h-11 text-base"><Swords className="h-4 w-4" /> {busy ? "Checking…" : "Enter the War Room"}</button>
        {err && <p role="alert" className="text-sm text-[#ff8b84]">{err}</p>}
      </form>
    </div>
  );
}
