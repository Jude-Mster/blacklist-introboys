import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Volume2, VolumeX, X, Users, Eye, RotateCcw, FastForward, SkipForward } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { Points } from "@/components/SealLogo";
import { cn } from "@/lib/utils";
import {
  SKILLS, WEAPON, PET, MOUNT, STAT_NAME, UPGRADES, PER_STAT, TOTAL_CAP, petGrowth, petBonus, statsOf, mountText, lineLabel, lineReturn, DRAW_REFUND, LIMIT, CONFLICT
} from "@/lib/arenaEngine";
import { createArenaScene, LOOKS, lookTitle, lookColor } from "./arenaScene";
import "./arena.css";

// Shared pieces of the Blacklist Arena page: the 3D stage, a fighter's card, the bet slip and the bet lists.
export const ICON = (id) => `/arena/icons/${id}.${id === "logo" ? "png" : "jpg"}`;
export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
export const fmtPrice = (p) => (p > 0 ? `${Number(p).toFixed(2)}×` : "—");
export const hex = (n) => "#" + Number(n).toString(16).padStart(6, "0");
export const RANK = { member: "Member", guild_member: "Guild Member", officer: "Vice Guild Member", leader: "Guild Leader" };
export { lookTitle, lookColor, LOOKS };
const short = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));
const QUICK = [1, 10, 50, 100, 500, 1000, 5000];
const SOUND_KEY = "bi.arena.sound";

// A fighter as the scene and the cards want it: the build, the name, the look and the rank.
export const asFighter = (x, extra = {}) => ({ ...(x.build || x), name: x.name, look: x.look, rank: RANK[x.role] || x.rank || "Member", avatar: x.avatar, ...extra });

// ---------- the stage ----------
// spec: { key, a, b, fight, values }; clock() -> { betting, betLeft, t, idle, banner } (see arenaScene.js).
// chip: { text, live } shown at the top of the stage. crowd: from useArenaCrowd (watching count and emojis).
// controls: extra buttons for the bar under the stage (replay speed, skip).
// One camera only, the game's own view (the preview's camera buttons were taken out on purpose).
export const EMOJIS = [["😂", "LOL"], ["🤡", "Clown"], ["💀", "Dead"], ["🔥", "Fire"], ["😤", "Angry"], ["🐔", "Chicken"], ["🧂", "Salty"], ["🍼", "Baby"], ["😭", "Crying"], ["🫵", "You"], ["💩", "Trash"], ["👑", "King"]];
export function ArenaStage({ spec, clock, className, showLog = true, logTitle = "Fight log", chip, crowd, controls }) {
  const stageRef = useRef(null), glRef = useRef(null), hudRef = useRef(null), tipRef = useRef(null), fxRef = useRef(null);
  const sceneRef = useRef(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } });
  const logRef = useRef({ key: null, lines: [] });
  const [log, setLog] = useState([]);

  useEffect(() => {
    let sc = null;
    try {
      sc = createArenaScene({
        stage: stageRef.current, gl: glRef.current, hud: hudRef.current, tip: tipRef.current,
        onLog: (l) => {
          const L = logRef.current;
          if (L.key !== l.key) { L.key = l.key; L.lines = []; }
          L.lines = [{ t: l.t, html: l.html }, ...L.lines].slice(0, 200);
          setLog(L.lines);
        }
      });
    } catch (e) { console.error("arena scene failed", e); }
    if (!sc) { setFailed(true); return undefined; }
    sceneRef.current = sc;
    let alive = true;
    sc.ready.then(() => { if (alive) setReady(true); }).catch((e) => { console.error("arena pictures failed", e); if (alive) setFailed(true); });
    return () => { alive = false; sceneRef.current = null; sc.dispose(); };
  }, []);

  useEffect(() => { if (sceneRef.current) sceneRef.current.setSound(sound); try { localStorage.setItem(SOUND_KEY, sound ? "on" : "off"); } catch { /* private mode */ } }, [sound, ready]);
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc || !ready || !spec || !spec.fight) return;
    if (logRef.current.key !== spec.key) { logRef.current = { key: spec.key, lines: [] }; setLog([]); }
    sc.show({ ...spec, clock: () => clockRef.current() });
  }, [spec, ready]);

  // emojis rise from the bottom of the stage with the sender's name under them
  const throwEmoji = useCallback((e, from, mine) => {
    const box = fxRef.current, st = stageRef.current;
    if (!box || !st) return;
    const w = st.clientWidth, h = st.clientHeight;
    const el = document.createElement("div");
    el.className = "emo" + (mine ? " mine" : "");
    el.style.left = Math.round(w * (0.06 + Math.random() * 0.88)) + "px";
    el.style.setProperty("--rise", Math.round(h + 90) + "px");
    el.style.setProperty("--sw", (6 + Math.random() * 10).toFixed(0) + "px");
    el.style.setProperty("--dur", (3.6 + Math.random() * 1.4).toFixed(2) + "s");
    const bub = document.createElement("div"); bub.className = "bub";
    const sp = document.createElement("span"); sp.textContent = e; bub.append(sp);
    const nm = document.createElement("b"); nm.textContent = from;
    el.append(bub, nm); box.appendChild(el);
    el.addEventListener("animationend", (ev) => { if (ev.target === el) el.remove(); });
    while (box.children.length > 40) box.firstElementChild.remove();
  }, []);
  const shown = useRef(new Set());
  useEffect(() => {
    if (!crowd) return;
    for (const r of crowd.reactions || []) {
      if (shown.current.has(r.id)) continue;
      shown.current.add(r.id);
      if (!r.mine) setTimeout(() => throwEmoji(r.emoji, r.name, false), Math.random() * 900);
    }
    if (shown.current.size > 400) shown.current = new Set([...shown.current].slice(-200));
  }, [crowd && crowd.reactions, throwEmoji]);
  const lastTaunt = useRef(0);
  const taunt = async (e) => {
    if (!crowd || !crowd.send || Date.now() - lastTaunt.current < 1300) return;
    lastTaunt.current = Date.now();
    throwEmoji(e, "You", true);
    const id = await crowd.send(e);
    if (id) shown.current.add(id);
  };
  const btn = "flex h-8 items-center gap-1.5 rounded border border-[#2b2a33] px-2.5 text-xs uppercase tracking-wider text-[#ece6dc] arena-label hover:border-[#5a4724]";

  return (
    <div className={cn("arena-root overflow-hidden rounded-md border border-[#5a4724] bg-black shadow-[0_20px_60px_rgba(0,0,0,0.55)]", className)}>
      <div ref={stageRef} className="arena-stage">
        <canvas ref={glRef} aria-label="The arena in 3D" />
        <canvas ref={hudRef} aria-hidden="true" />
        {(chip || (crowd && crowd.watching > 0)) && (
          <div className="pointer-events-none absolute left-1/2 top-11 z-[2] flex -translate-x-1/2 gap-2">
            {chip && <span className={cn("arena-chip", chip.live && "live")}>{chip.text}</span>}
            {crowd && crowd.watching > 0 && <span className="arena-chip"><Eye className="h-3.5 w-3.5" aria-hidden="true" /> {fmt(crowd.watching)} watching</span>}
          </div>
        )}
        <div ref={fxRef} className="arena-emofx" aria-hidden="true" />
        {(!ready || failed) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm uppercase tracking-[0.14em] text-[#9b948a] arena-label">
            {failed ? "This device can't show the arena in 3D." : <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading the fighters</span>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-[#5a4724] bg-gradient-to-b from-[#16171f] to-[#0d0e13] px-2.5 py-1.5">
        {controls}
        <button type="button" onClick={() => setSound((s) => !s)} aria-pressed={sound} className={btn}>
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} {sound ? "Sound on" : "Sound off"}
        </button>
      </div>
      {crowd && crowd.send && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#2b2a33] bg-[#0d0e13] px-2.5 py-2">
          <span className="arena-label text-xs font-bold uppercase tracking-[0.18em] text-crimson">Tease</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Throw an emoji">
            {EMOJIS.map(([e, nm]) => (
              <button key={e} type="button" title={nm} aria-label={nm} onClick={() => taunt(e)} className="rounded border border-[#2b2a33] bg-[#1a1b24] px-1.5 py-1 text-xl leading-none active:scale-90">{e}</button>
            ))}
          </div>
        </div>
      )}
      {showLog && (
        <details open className="border-t border-[#2b2a33] bg-[#0d0e13] px-3 py-2">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.16em] text-[#d6ad52] arena-label">{logTitle}</summary>
          <ul className="arena-log mt-1 max-h-48 overflow-auto">
            {log.length ? log.map((l, i) => <li key={log.length - i}><span className="t">{l.t.toFixed(1)}s</span> · <span dangerouslySetInnerHTML={{ __html: l.html }} /></li>) : <li>Nothing yet.</li>}
          </ul>
        </details>
      )}
      <div ref={tipRef} className="arena-tip" role="tooltip" hidden />
    </div>
  );
}

// The crowd for one screen ("live", or "tour:<id>"): how many are watching and the emojis they throw.
// Asks every 5 seconds while the tab is open; counts this member as watching every 20 seconds.
export function useArenaCrowd(scope, enabled = true) {
  const [state, setState] = useState({ watching: 0, reactions: [] });
  const lastHere = useRef(0);
  useEffect(() => {
    if (!enabled || !scope) return undefined;
    let alive = true;
    const ask = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const here = Date.now() - lastHere.current > 20000;
      try {
        const res = await base44.functions.invoke("arenaAction", { action: "pulse", scope, ...(here ? { here: true } : {}) });
        if (here) lastHere.current = Date.now();
        if (alive && res.data) setState({ watching: res.data.watching || 0, reactions: res.data.reactions || [] });
      } catch { /* the crowd is a nicety: try again next time */ }
    };
    ask();
    const t = setInterval(ask, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [scope, enabled]);
  const send = useCallback(async (emoji) => {
    try { const res = await base44.functions.invoke("arenaAction", { action: "react", scope, emoji }); return res.data && res.data.id; } catch { return null; }
  }, [scope]);
  return useMemo(() => ({ ...state, send }), [state, send]);
}

// A replay on the page's own clock, with 2× speed, skip to the result and play again.
export function useReplayClock(length, intro = 3) {
  const [run, setRun] = useState({ started: Date.now(), speed: 1, base: 0 });
  const clock = useCallback(() => ({ t: run.base + ((Date.now() - run.started) / 1000) * run.speed - intro }), [run, intro]);
  const now = () => run.base + ((Date.now() - run.started) / 1000) * run.speed;
  const setSpeed = (speed) => setRun({ started: Date.now(), speed, base: now() });
  const skip = () => setRun({ started: Date.now(), speed: run.speed, base: intro + (length || 0) + 0.2 });
  const restart = () => setRun({ started: Date.now(), speed: run.speed, base: 0 });
  const btn = "flex h-8 items-center gap-1.5 rounded border border-[#2b2a33] px-2.5 text-xs uppercase tracking-wider text-[#ece6dc] arena-label hover:border-[#5a4724]";
  const controls = (
    <>
      <button type="button" onClick={restart} className={btn}><RotateCcw className="h-3.5 w-3.5" /> Replay</button>
      <button type="button" onClick={() => setSpeed(run.speed === 1 ? 2 : 1)} aria-pressed={run.speed === 2} className={cn(btn, run.speed === 2 && "border-[#d6ad52] text-[#f1d38c]")}><FastForward className="h-3.5 w-3.5" /> 2× speed</button>
      <button type="button" onClick={skip} className={btn}><SkipForward className="h-3.5 w-3.5" /> Skip to result</button>
    </>
  );
  return { clock, controls, restart };
}

// A past fight watched again on this page's own clock (2× speed, skip, replay). Give it key={spec.key}.
export function ReplayStage({ spec, crowd }) {
  const { clock, controls } = useReplayClock(spec.fight.length);
  return <ArenaStage spec={spec} clock={clock} chip={{ text: "Replay" }} crowd={crowd} controls={controls} logTitle="Fight log (replay)" />;
}

// ---------- skills ----------
export function SkillIcons({ skills, size = 26 }) {
  if (!skills || !skills.length) return <span className="text-mist">—</span>;
  return (
    <span className="inline-flex gap-1">
      {skills.map((id) => SKILLS[id] && (
        <img key={id} src={ICON(id)} alt={SKILLS[id].name} data-skill={id} tabIndex={0} width={size} height={size}
          className="rounded-sm border" style={{ width: size, height: size, borderColor: hex(SKILLS[id].color) }} />
      ))}
    </span>
  );
}

// ---------- a fighter's card ----------
export function FighterCard({ f, values, side, highlight, children, className }) {
  const s = statsOf(f, values);
  const up = (id) => (f.ups && f.ups[id] ? <i className="not-italic text-jade"> +{f.ups[id]}</i> : null);
  const W = f.weapon ? WEAPON.looks[f.weapon - 1] : null;
  const rows = [
    ["HP", fmt(s.hp), "hp"], ["ATK", fmt(s.atk), "atk"], ["DEF", fmt(s.def), "def"],
    ["Crit rate", `${s.crit}%`, "crit"], ["Crit defense", `${s.critdef}%`, "critdef"], ["Accuracy", `${s.acc}%`, "acc"],
    ["Evasion", `${s.eva}%`, "eva"], ["HP potions", s.pots, "pots"], ["Potion heal", `${s.potheal}%`, "potheal"], ["Attack speed", `${s.spd}%`, "spd"]
  ];
  return (
    <div className={cn("min-w-0 rounded border bg-black/30 p-3", highlight ? "border-gold" : "border-bronze/40", className)}>
      <div className="flex items-center gap-2">
        {f.avatar !== undefined && <Avatar url={f.avatar} name={f.name} size={30} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-bold leading-tight">{f.name}</p>
          <p className="truncate text-xs text-mist">
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: lookColor(f.look) }} aria-hidden="true" />
            {lookTitle(f.look)}{side ? ` · ${side}` : ""}
          </p>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-[12.5px] tabular-nums">
        {rows.map(([k, v, id]) => (<React.Fragment key={k}><dt className="text-mist">{k}</dt><dd className="text-right">{v}{up(id)}</dd></React.Fragment>))}
      </dl>
      <div className="mt-2 space-y-1 text-[12.5px]">
        <p className="flex justify-between gap-2"><span className="text-mist">Entries</span><span className="tabular-nums">{f.entries || 1}</span></p>
        <p className="flex justify-between gap-2"><span className="text-mist">Weapon</span><span style={W ? { color: hex(W.color) } : undefined}>{W ? `+${f.weapon} ${W.name}` : "+0"}</span></p>
        <p className="flex items-center justify-between gap-2"><span className="text-mist">Skills</span><SkillIcons skills={f.skills} size={22} /></p>
        <p className="flex justify-between gap-2"><span className="text-mist">Pet</span><span>{f.pet ? `Condor ${petGrowth(f.pet)}%` : "—"}</span></p>
        <p className="flex justify-between gap-2"><span className="text-mist">Mount</span><span className="truncate text-right">{f.mount ? `Lv ${f.mount.lv} · ${mountText(f.mount)}` : "—"}</span></p>
      </div>
      {children}
    </div>
  );
}

// ---------- the bet slip: pick any number of bets, one amount for each ----------
// odds: the fight's prices. names: [A, B]. draws: the Draw is offered (Live Arena only).
export function BetSlip({ fightKey, odds, names, draws, open, closedText, limit, minBet, placed, balance, onPlace, busy, error, notice, mineLines = [] }) {
  const [picks, setPicks] = useState([]);
  const [amount, setAmount] = useState("");
  const wide = useWide(640);
  const [sideOpen, setSideOpen] = useState(false);
  useEffect(() => { setPicks([]); }, [fightKey]);
  // Both sides of the same question can't be backed on one fight: picking one swaps out the other, and one
  // already placed locks the other out.
  const placedKeys = new Set((mineLines || []).map((l) => l.k));
  const locked = (k) => CONFLICT[k] && placedKeys.has(CONFLICT[k]);
  const toggle = (k) => { if (!open || locked(k)) return; setPicks((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p.filter((x) => x !== CONFLICT[k]), k])); };
  const amt = Math.floor(Number(amount) || 0);
  const priceOf = (k) => (k === "a" ? odds.a : k === "b" ? odds.b : k === "draw" ? odds.draw : ((odds.side || []).find((x) => x.id === k) || {}).price || 0);
  const total = amt * picks.length;
  const room = Math.max(0, Math.min(limit - placed, balance));
  const problem = !picks.length || !amt ? "" : amt < minBet ? `The smallest bet is ${fmt(minBet)}.` : total > balance ? "Not enough points for that." : placed + total > limit ? `You can bet up to ${fmt(limit)} on one fight (${fmt(Math.max(0, limit - placed))} left).` : "";
  const can = open && picks.length && amt >= minBet && !problem && !busy;
  const place = async () => { if (!can) return; const ok = await onPlace(picks.map((k) => ({ k, amount: amt }))); if (ok) { setPicks([]); } };
  const Btn = ({ k, label, sub }) => {
    const p = priceOf(k), on = picks.includes(k), lock = locked(k);
    const why = lock ? "You already bet on the other side" : !(p > 1) ? (k === "draw" ? `Not offered: no realistic chance of a draw in ${LIMIT} s` : "Not offered on this fight") : sub;
    return (
      <button type="button" disabled={!open || !(p > 1) || lock} onClick={() => toggle(k)} aria-pressed={on} title={lock || !(p > 1) ? why : undefined}
        className={cn("flex min-w-0 items-center justify-between gap-2 rounded border px-2.5 py-2 text-left text-[13px] transition-colors disabled:cursor-default",
          on ? "border-gold bg-gold/20" : "border-bronze/45 bg-black/30 enabled:hover:border-gold", (!(p > 1) || lock) && "opacity-40")}>
        <span className="min-w-0"><span className="block truncate">{label}</span>{why && <span className="block truncate text-[11px] text-mist">{why}</span>}</span>
        <b className="shrink-0 font-heading tabular-nums text-gold">{fmtPrice(p)}</b>
      </button>
    );
  };
  return (
    <Panel title="Bet slip">
      <div className={cn("grid gap-1.5", draws ? "grid-cols-3" : "grid-cols-2")}>
        <Btn k="a" label={names[0]} sub="to win" />
        {draws && <Btn k="draw" label="Draw" sub={`no KO in ${LIMIT} s`} />}
        <Btn k="b" label={names[1]} sub="to win" />
      </div>
      {(() => {
        const offered = (odds.side || []).filter((x) => x.price > 1);
        const chosen = picks.filter((k) => offered.some((x) => x.id === k)).length;
        const show = wide || sideOpen;
        return (
          <>
            {wide ? (
              <p className="mt-2 text-xs uppercase tracking-wider text-mist">Side bets <span className="normal-case tracking-normal">· pick as many as you like, but only one side of each</span></p>
            ) : (
              <button type="button" onClick={() => setSideOpen((v) => !v)} aria-expanded={sideOpen}
                className="mt-2 flex h-9 w-full items-center justify-between rounded border border-bronze/45 bg-black/30 px-2.5 text-xs uppercase tracking-wider text-mist">
                <span>Side bets · {offered.length}{chosen ? ` · ${chosen} picked` : ""}</span><span aria-hidden="true">{sideOpen ? "▲" : "▼"}</span>
              </button>
            )}
            {show && (
              <div className="mt-1 grid grid-cols-1 gap-1.5">
                {offered.map((x) => <Btn key={x.id} k={x.id} label={x.name} />)}
                {(odds.side || []).some((x) => !(x.price > 1)) && <p className="text-[11px] text-mist">Side bets that almost never or almost always happen in this matchup aren't offered.</p>}
              </div>
            )}
          </>
        );
      })()}
      <label className="mt-3 block text-xs text-mist" htmlFor={`amt-${fightKey}`}>Amount on each bet</label>
      <input id={`amt-${fightKey}`} type="number" inputMode="numeric" min={minBet} step={1} value={amount} disabled={!open}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9))} onKeyDown={(e) => { if (e.key === "Enter") place(); }}
        placeholder={`${fmt(minBet)} to ${fmt(limit)}`}
        className="mt-1 h-10 w-full rounded border border-bronze/50 bg-black/40 px-3 text-base tabular-nums outline-none focus:border-gold disabled:opacity-60" />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {QUICK.filter((v) => v <= limit && v >= minBet).map((v) => (
          <button key={v} type="button" disabled={!open} onClick={() => setAmount(String(Math.min(limit, amt + v)))} className="h-7 rounded border border-bronze/45 px-2 text-xs text-mist enabled:hover:border-gold">+{short(v)}</button>
        ))}
        <button type="button" disabled={!open || room < minBet || !picks.length} onClick={() => setAmount(String(Math.floor(room / Math.max(1, picks.length))))} className="h-7 rounded border border-bronze/45 px-2 text-xs text-mist enabled:hover:border-gold">Max</button>
        <button type="button" disabled={!open || !amount} onClick={() => setAmount("")} className="h-7 rounded border border-bronze/45 px-2 text-xs text-mist enabled:hover:border-gold">Clear</button>
      </div>
      {picks.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px]">
          {picks.map((k) => (
            <li key={k} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{lineLabel({ k, line: ((odds.side || []).find((x) => x.id === k) || {}).line }, names)}</span>
              <span className="shrink-0 tabular-nums text-mist">{amt ? `${fmt(amt)} → ${fmt(Math.floor(amt * priceOf(k)))}` : fmtPrice(priceOf(k))}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between text-sm"><span className="text-mist">Total stake</span><span className="tabular-nums">{total ? <Points value={total} iconSize={12} /> : "—"}</span></div>
      {(problem || error) && <p role="alert" className="mt-2 text-sm text-ember">{error || problem}</p>}
      {notice && !error && !problem && <p className="mt-2 text-sm text-jade">{notice}</p>}
      <button type="button" onClick={place} disabled={!can} className="btn-seal mt-3 h-11 w-full">
        {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : !open ? closedText || "Betting is closed" : picks.length > 1 ? `Place ${picks.length} bets` : "Place bet"}
      </button>
      <p className="mt-2 text-center text-[11px] text-mist">
        Up to {fmt(limit)} per fight · {fmt(Math.max(0, limit - placed))} left · the price includes your stake{draws ? ` · on a Draw, bets on either fighter get ${Math.round(DRAW_REFUND * 100)}% back` : ""}
      </p>
    </Panel>
  );
}

// ---------- this member's bets on the fight ----------
export function MyBets({ mine, names, outcome, open, busy, onRemove }) {
  const lines = (mine && mine.lines) || [];
  return (
    <Panel title="Your bets">
      {lines.length ? (
        <ul className="divide-y divide-bronze/25">
          {lines.map((l, i) => {
            const back = outcome ? lineReturn(l, outcome, {}) : null;
            return (
              <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{lineLabel(l, names)}</span>
                <span className="shrink-0 text-xs tabular-nums text-mist">{fmt(l.amount)} @ {fmtPrice(l.price)}</span>
                {back !== null && <span className={cn("w-16 shrink-0 text-right font-heading text-xs font-bold tabular-nums", back > l.amount ? "text-gold" : back > 0 ? "text-mist" : "text-ember")}>{back > 0 ? `+${fmt(back)}` : "lost"}</span>}
                {open && <button type="button" disabled={busy} onClick={() => onRemove({ k: l.k })} aria-label={`Take back ${lineLabel(l, names)}`} className="shrink-0 rounded p-1 text-mist hover:text-ember"><X className="h-3.5 w-3.5" /></button>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-mist">{open ? "No bets on this fight yet." : "You have no bets on this fight."}</p>}
      {lines.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-bronze/25 pt-2 text-sm">
          <span className="text-mist">Total</span>
          <span className="flex items-center gap-3">
            {open && <button type="button" disabled={busy} onClick={() => onRemove({ all: true })} className="text-xs text-mist underline hover:text-gold">Take all back</button>}
            <Points value={mine.amount || 0} iconSize={12} />
          </span>
        </div>
      )}
    </Panel>
  );
}

// ---------- everyone's bets on the fight ----------
export function BetBoard({ board, names, done }) {
  const bets = (board && board.bets) || [];
  return (
    <Panel title="Bets on this fight">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-mist"><Users className="h-3.5 w-3.5" aria-hidden="true" /> {board ? board.players : 0} betting · <Points value={board ? board.total_bet : 0} iconSize={11} /></p>
      {bets.length ? (
        <ul className="divide-y divide-bronze/25">
          {[...bets].sort((a, b) => b.amount - a.amount).slice(0, 15).map((p, i) => (
            <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
              <Avatar url={p.avatar} name={p.name} size={22} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", p.mine && "font-bold text-gold")}>{p.mine ? "You" : p.name}</span>
                <span className="block truncate text-[11px] text-mist">{(p.lines || []).map((l) => lineLabel(l, names)).join(", ")}</span>
              </span>
              <Points value={p.amount} iconSize={12} className="shrink-0 tabular-nums text-mist" />
              {done && p.done && <span className={cn("w-14 shrink-0 text-right font-heading font-bold tabular-nums", p.net > 0 ? "text-jade" : p.net < 0 ? "text-ember" : "text-mist")}>{p.net > 0 ? "+" : ""}{fmt(p.net)}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-mist">No bets yet.</p>}
    </Panel>
  );
}

// ---------- the skill and mount roll windows ----------
// mode: "skills" (all 7 skills; won = the one just drawn) or "mount" (all 6 pairs; won = pair index, old = the pair it had).
export function RollDialog({ open, onClose, mode, won, owned = [], old = null, mount, costs }) {
  const [lit, setLit] = useState(null);
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  const ids = mode === "skills" ? Object.keys(SKILLS) : MOUNT.pairs.map((_, i) => "m" + i);
  const wonId = won == null ? null : mode === "skills" ? won : "m" + won;
  useEffect(() => {
    clearTimeout(timer.current);
    setLit(null); setDone(won == null);
    if (!open || won == null) return undefined;
    const pool = ids.filter((id) => (mode === "skills" ? !owned.includes(id) || id === won : !(old != null && id === "m" + old)));
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (pool.length <= 1 || reduce) { setDone(true); return undefined; }
    const steps = 14 + pool.indexOf(wonId) + pool.length * 2;
    let k = 0, delay = 60;
    const tick = () => { if (k >= steps) { setLit(null); setDone(true); return; } setLit(pool[k % pool.length]); k++; delay = Math.min(260, delay * 1.09); timer.current = setTimeout(tick, delay); };
    tick();
    return () => clearTimeout(timer.current);
     
  }, [open, won, mode]);
  useEffect(() => { if (!open) return undefined; const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open, onClose]);
  if (!open) return null;
  const pct = (id) => ["hp", "atk", "def"].includes(id);
  const per = (pair, lv) => pair.map((id) => `${STAT_NAME[id]} +${lv}${pct(id) ? "% of total" : lv === 1 ? " point" : " points"}`).join(" · ");
  const title = mode === "skills"
    ? (won == null ? "All buff skills" : done ? `You learned ${SKILLS[won].name}` : "Rolling for a skill…")
    : (won == null ? "Mount stats" : done ? `Your mount drew ${MOUNT.pairs[won].map((id) => STAT_NAME[id]).join(" & ")}` : old != null ? "Resetting your mount's stats…" : "Drawing your mount's stats…");
  const sub = mode === "skills"
    ? `${ids.length} skills. Add skill (${fmt(costs.skill)} pts) draws one you don't have yet at random, up to 2. Hover or tab to a skill for its details.`
    : `${MOUNT.pairs.length} possible pairs, each as likely as the others. The first level (${fmt(costs.mountLevel)} pts) draws one pair at random and every level after adds 1% more to the same two, up to level ${MOUNT.levels}. A reset (${fmt(costs.mountReset)} pts) draws a new pair, never the one you had, and keeps the level. HP, ATK and DEF grow by that % of the fighter's total; Crit rate, Dodge and Crit defense by that many points.`;
  return (
    <div className="arena-root fixed inset-0 z-50 grid place-items-center bg-[rgba(5,6,9,0.78)] p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[calc(100vh-32px)] w-full max-w-[760px] overflow-auto rounded border border-[#5a4724] bg-[#13141b] p-4 sm:p-5">
        <h2 className="arena-display text-xl font-bold text-[#f1d38c]">{title}</h2>
        <p className="mb-3 mt-1 text-sm text-mist">{sub}</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
          {ids.map((id) => {
            if (mode === "skills") {
              const k = SKILLS[id], isOwned = owned.includes(id) && id !== won;
              const tag = done && id === won ? "Learned now" : isOwned ? "Learned" : won != null ? "In the draw" : owned.includes(id) ? "Learned" : "Available";
              return (
                <div key={id} data-skill={id} tabIndex={0} className={cn("rskill", isOwned && "owned", lit === id && "lit", done && id === won && "won")}>
                  <img alt="" src={ICON(id)} /><b style={{ color: hex(k.color) }}>{k.name}</b>
                  <small>{k.passive ? "" : `${Math.round(k.chance * 100)}% chance to cast · `}{k.text}</small>
                  <span className="tag">{tag}</span>
                </div>
              );
            }
            const i = Number(id.slice(1)), pair = MOUNT.pairs[i], isOld = old != null && i === old;
            const mine = mount && mount.pair === i;
            const tag = done && i === won ? `Your mount · level ${mount ? mount.lv : 1}` : isOld ? "Current pair · not in the draw" : won != null ? "In the draw" : mine ? `Your mount · level ${mount.lv}` : "Possible";
            return (
              <div key={id} className={cn("rskill", isOld && "owned", lit === id && "lit", ((done && i === won) || (won == null && mine)) && "won")}>
                <img alt="" src={ICON("mount")} /><b style={{ color: "#8fc8ff" }}>{pair.map((x) => STAT_NAME[x]).join(" & ")}</b>
                <small>Per level: {per(pair, 1)}<br />At level {MOUNT.levels}: {per(pair, MOUNT.levels)}</small>
                <span className="tag">{tag}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="arena-label text-base font-bold text-[#f1d38c]" aria-live="polite">
            {done && won != null ? (mode === "skills" ? `${SKILLS[won].name}: ${SKILLS[won].text}` : `Level ${mount ? mount.lv : 1}: ${mountText({ lv: mount ? mount.lv : 1, pair: won })}`) : ""}
          </span>
          <button type="button" onClick={onClose} className="btn-bronze h-10 px-5 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// Pips for a stat's upgrade rolls (up to PER_STAT).
export function Pips({ n, fresh }) {
  return <span className="arena-pips" aria-label={`${n} of ${PER_STAT}`}>{Array.from({ length: PER_STAT }, (_, k) => <span key={k} className={k < n ? (fresh && k === n - 1 ? "new" : "on") : ""} />)}</span>;
}
export { UPGRADES, PER_STAT, TOTAL_CAP, PET, petBonus };

// true on a computer-width screen (the bet slip sits beside the stage); false on a phone or small
// tablet, where the bet slip goes straight under the stage instead of below the stats and history.
export function useWide(min = 1024) {
  const q = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(`(min-width: ${min}px)`) : null;
  const [wide, setWide] = useState(q ? q.matches : true);
  useEffect(() => {
    if (!q) return undefined;
    const on = () => setWide(q.matches);
    q.addEventListener ? q.addEventListener("change", on) : q.addListener(on);
    return () => (q.removeEventListener ? q.removeEventListener("change", on) : q.removeListener(on));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return wide;
}

// Server time: the offset is kept from each answer, so countdowns agree with the server.
export function useServerClock() {
  const offset = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const sync = useCallback((iso) => { const v = Date.parse(iso); if (v) offset.current = v - Date.now(); }, []);
  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { now: now + offset.current, sync, serverNow };
}
export const useStable = (v) => useMemo(() => v, [JSON.stringify(v)]);