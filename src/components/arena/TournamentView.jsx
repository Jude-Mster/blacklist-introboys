import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trophy, Shuffle, History, Radio, Repeat, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { useGuild, errorText } from "@/lib/GuildContext";
import { PLACE } from "@/lib/prizes";
import {
  simulate, SKILLS, WEAPON, PET, MOUNT, MAX_SKILLS, UPGRADES, TOTAL_CAP, PER_STAT, petGrowth, petBonus, mountText, normValues, STAT_NAME
} from "@/lib/arenaEngine";
import { cn } from "@/lib/utils";
import {
  ArenaStage, ReplayStage, FighterCard, BetSlip, MyBets, BetBoard, RollDialog, SkillIcons, Pips, asFighter, fmt, fmtPrice, hex, lookTitle, lookColor, useServerClock, useArenaCrowd, useWide
} from "./arenaUi";
import TourLeader from "./TourLeader";
import ArenaRules from "./ArenaRules";

// Arena tournaments. Sign-up: your first entry gives you a fighter (a random character, one free re-roll),
// and everything you buy makes it stronger. At the start the bracket is drawn and every match is fought
// live: 10 seconds of betting, then the fight, then the result.
const OWED_KEY = "bi.arena.tour.owed";
const countdown = (ms) => {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 3600000) % 24, d = Math.floor(ms / 86400000);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
};

// One piece of gear in "Your fighter": its icon (the weapon glows in its aura colour), its name and level,
// what it gives, a bar of its levels, and its buttons.
function GearRow({ icon, glow, color, title, text, lv, max, children }) {
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-start gap-3">
        <img src={icon} alt="" aria-hidden="true" className="h-11 w-11 shrink-0 rounded-sm border border-gold bg-[#07080b] object-cover" style={glow ? { boxShadow: `0 0 12px ${glow}` } : undefined} />
        <div className="min-w-0">
          <p className="font-heading text-sm font-bold" style={{ color }}>{title}</p>
          <p className="text-xs text-mist">{text}</p>
        </div>
      </div>
      <div className="flex gap-1" aria-label={`Level ${lv} of ${max}`}>
        {Array.from({ length: max }, (_, k) => <span key={k} className={cn("h-1.5 flex-1 rounded-sm", k < lv ? "bg-[#d4a72c]" : "bg-white/10")} />)}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// The shop's buttons. Defined here, not inside SignUp: a component made inside another is a new one on every
// redraw, so React would throw the button away and make a new one several times a second, and a tap that
// lands mid-swap is lost (buying felt laggy).
function B({ busy, id, onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={!!busy || disabled} className="btn-bronze flex h-auto min-h-11 w-full flex-col items-start justify-center px-3 py-2 text-left text-sm normal-case tracking-normal">
      {busy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
function B2({ busy, id, onClick, disabled, quiet, children }) {
  return (
    <button type="button" onClick={onClick} disabled={!!busy || disabled} className={cn(quiet ? "btn-bronze" : "btn-seal", "h-10 px-3 text-xs sm:text-sm")}>
      {busy === id ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{id === "weapon1" ? "Forging…" : ""}</span> : children}
    </button>
  );
}

// The Character Lab's upgrade rails: every upgrade as a see-through button down the sides of the stage, so a
// member builds their fighter while watching it, with no scrolling down to the shop. Left: entries, skill,
// re-roll. Right: weapon, Iron Condor, mount. The full shop with every detail stays in "Your fighter" below.
function LabTile({ busy, id, onClick, disabled, icon, text, name, price, note, glow, gold, pips, pipColor }) {
  const on = busy === id;
  return (
    <button type="button" onClick={onClick} disabled={!!busy || disabled} title={note} aria-label={note || name} className={cn("lab-tile", gold && "gold")}>
      <span className="ic" style={glow ? { boxShadow: `0 0 0 1px ${glow}, 0 0 12px ${glow}` } : undefined}>
        {typeof icon === "string" ? <img src={icon} alt="" aria-hidden="true" /> : icon || <b>{text}</b>}
        {on && <span className="spin"><Loader2 className="h-4 w-4 animate-spin text-gold" /></span>}
      </span>
      <span className="tx">
        <span className="nm">{on && id === "weapon1" ? "Forging…" : name}</span>
        <span className="pr">{price}</span>
        {pips && <span className="pips" style={pipColor ? { "--pip": pipColor } : undefined}>{Array.from({ length: pips[1] }, (_, k) => <i key={k} className={k < pips[0] ? "on" : ""} />)}</span>}
      </span>
    </button>
  );
}
function LabRails({ me, costs, values, busy, buy, flash, used }) {
  const mt = me.mount, W = me.weapon ? WEAPON.looks[me.weapon - 1] : null, maxW = me.weapon >= WEAPON.max, nextW = !maxW ? WEAPON.looks[me.weapon] : null;
  const skillIcon = me.skills.length ? `/arena/icons/${me.skills[me.skills.length - 1]}.jpg` : "/arena/icons/spirits.jpg";
  const chance = Math.round(values.weapon.chance * 100);
  return (
    <>
      <div className="lab-rail left" role="group" aria-label="Entries and skills">
        <LabTile busy={busy} id="entry1" gold onClick={() => buy("entry", 1)} text="+1" name="1 entry" price={`${fmt(costs.entry)} pts`} pips={[used, TOTAL_CAP]} note={`Buy 1 entry (${fmt(costs.entry)} pts): rolls one upgrade and raises your halo. ${used}/${TOTAL_CAP} upgrades.`} />
        <LabTile busy={busy} id="entry5" gold onClick={() => buy("entry", 5)} text="+5" name="5 entries" price={`${fmt(costs.entry * 5)} pts`} note={`Buy 5 entries (${fmt(costs.entry * 5)} pts): five upgrade rolls at once`} />
        <LabTile busy={busy} id="skill1" onClick={() => buy("skill")} disabled={me.skills.length >= MAX_SKILLS} icon={skillIcon} name={`Skill ${me.skills.length}/${MAX_SKILLS}`}
          price={me.skills.length >= MAX_SKILLS ? "Full" : `${fmt(costs.skill)} pts`} note="Add a random buff skill you don't have yet" />
        <LabTile busy={busy} id="reroll1" onClick={() => buy("reroll")} disabled={me.rerolled} icon={<Shuffle className="h-4 w-4 text-[#9fdcff]" />} name="Re-roll"
          price={me.rerolled ? "Used" : "Free"} note="Re-roll your character (free, once)" />
      </div>
      <div className="lab-rail right" role="group" aria-label="Weapon, pet and mount">
        <LabTile busy={busy} id="weapon1" onClick={() => buy("weapon")} disabled={maxW} icon="/arena/icons/weapon.jpg" glow={W ? hex(W.color) : ""}
          name={`Weapon +${me.weapon}`} price={maxW ? "Max" : `${fmt(costs.weaponTry)} · ${chance}%`} pips={[me.weapon, WEAPON.max]} pipColor={W ? hex(W.color) : undefined}
          note={maxW ? `Weapon +${WEAPON.max}` : `Try a weapon upgrade (${fmt(costs.weaponTry)} pts, ${chance}% success): +${me.weapon + 1}, ${nextW.name} aura. Each level +${Math.round(values.weapon.atk * 100)}% ATK and +${values.weapon.crit}% Crit rate.`} />
        <LabTile busy={busy} id="pet1" onClick={() => buy("pet")} disabled={me.pet >= PET.levels} icon="/arena/icons/pet.jpg"
          name={me.pet >= PET.levels ? "Condor max" : `Condor ${petGrowth(me.pet)}%`} price={me.pet >= PET.levels ? "Max" : `${fmt(costs.pet)} pts`} pips={[me.pet, PET.levels]} pipColor="#c9a2ff"
          note={me.pet >= PET.levels ? "Iron Condor at 200%" : `Grow the Iron Condor to ${petGrowth(me.pet + 1)}% (${fmt(costs.pet)} pts): HP +${fmt(petBonus(me.pet + 1, "hp") - petBonus(me.pet, "hp"))}, ATK +${fmt(petBonus(me.pet + 1, "atk") - petBonus(me.pet, "atk"))}, DEF +${fmt(petBonus(me.pet + 1, "def") - petBonus(me.pet, "def"))}`} />
        <LabTile busy={busy} id="mount1" onClick={() => buy("mount")} disabled={mt && mt.lv >= MOUNT.levels} icon="/arena/icons/mount.jpg"
          name={mt ? `Mount Lv${mt.lv}` : "Mount"} price={mt && mt.lv >= MOUNT.levels ? "Max" : `${fmt(costs.mountLevel)} pts`} pips={[mt ? mt.lv : 0, MOUNT.levels]} pipColor="#7fc3ff"
          note={mt ? `${mountText(mt)}. Next level: +${MOUNT.per}% more to both (${fmt(costs.mountLevel)} pts)` : `Buy a mount (${fmt(costs.mountLevel)} pts): draws two stats at random`} />
        {mt && <LabTile busy={busy} id="mountReset1" onClick={() => buy("mountReset")} icon={<Shuffle className="h-4 w-4 text-[#7fc3ff]" />} name="Reset"
          price={`${fmt(costs.mountReset)} pts`} note={`Draws a new pair of mount stats and keeps the level (${fmt(costs.mountReset)} pts)`} />}
      </div>
      {flash && <p role="status" className={cn("lab-flash", flash.error && "err")}>{flash.text}</p>}
    </>
  );
}

// which price each shop item uses (sent with the purchase, so a price the Guild Leader just changed is never charged unseen)
const COST_KEY = { entry: "entry", weapon: "weaponTry", skill: "skill", pet: "pet", mount: "mountLevel", mountReset: "mountReset" };

export default function TournamentView({ balance, member }) {
  const { setBalance, reload } = useGuild();
  const { now: sn, sync, serverNow } = useServerClock();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const dataRef = useRef(null), lastPoll = useRef(0), inFlight = useRef(false), changedAt = useRef(0), loaded = useRef(false);
  const leader = member.role === "leader";

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const asked = Date.now();
    lastPoll.current = asked;
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "state" });
      const d = res.data;
      if (d && asked < changedAt.current) return;
      if (d) { sync(d.server_now); dataRef.current = d; loaded.current = true; setData(d); setLoadError(""); }
    } catch (e) {
      if (!loaded.current && !(e && e.rateLimited)) setLoadError(errorText(e, "Couldn't load the tournament."));
    } finally { inFlight.current = false; }
  }, [sync]);

  // Ask when something can change: the next match opening, betting closing (the seed), a fight ending.
  useEffect(() => {
    refresh();
    const poll = setInterval(() => {
      const d = dataRef.current, now = serverNow();
      let wait = 15000;
      const t = d && d.tournament;
      if (t && t.status === "running") {
        const marks = [];
        for (const m of t.matches) for (const k of ["open_at", "close_at", "end_at"]) if (m[k]) marks.push(Date.parse(m[k]));
        if (t.ends_at) marks.push(Date.parse(t.ends_at));
        const next = marks.filter((x) => x > now - 200).sort((a, b) => a - b)[0];
        wait = next ? Math.min(6000, Math.max(300, next - now + 350)) : 4000;
        // a match whose betting has closed but whose seed we don't have yet
        if (t.matches.some((m) => now >= Date.parse(m.close_at) && now < Date.parse(m.close_at) + 600000 && m.seed == null && m.a != null && m.b != null)) wait = Math.min(wait, 1200);
      } else if (t && t.status === "signup") {
        wait = t.starts_at ? Math.min(10000, Math.max(800, Date.parse(t.starts_at) - now + 500)) : 10000;
      } else if (t && t.status === "paying") wait = 3000;
      if (Date.now() - lastPoll.current >= wait) refresh();
    }, 250);
    return () => clearInterval(poll);
  }, [refresh, serverNow]);

  const t = data && data.tournament;
  const owed = !!(data && data.board && data.board.owed);
  const collecting = useRef(false);
  const collect = useCallback(async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "settle" });
      if (!(res.data && res.data.pending)) { try { localStorage.removeItem(OWED_KEY); } catch { /* private mode */ } }
      reload();
    } catch { /* later */ } finally { setTimeout(() => { collecting.current = false; }, 2500); }
  }, [reload]);
  useEffect(() => { if (owed) collect(); }, [owed, data, collect]);
  useEffect(() => { try { if (localStorage.getItem(OWED_KEY)) collect(); } catch { /* private mode */ } }, [collect]);

  if (!data) {
    return (
      <Panel title="Tournament">
        {loadError ? (
          <div className="py-6 text-center"><p role="alert" className="text-sm text-ember">{loadError}</p><button type="button" onClick={refresh} className="btn-bronze mx-auto mt-4 h-10 px-5 text-sm">Try again</button></div>
        ) : <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading the tournament</p>}
      </Panel>
    );
  }

  const onChanged = () => { changedAt.current = 0; refresh(); reload(); };
  // A purchase answers with the fighter as it is now: show that straight away instead of loading the whole
  // tournament again (fewer calls, so buying fast doesn't trip the server's request limit). The regular
  // check a few seconds later brings in everyone else's changes.
  const onBought = (mine) => {
    if (!mine) return;
    changedAt.current = Date.now(); lastPoll.current = Date.now();
    setData((d) => {
      if (!d) return d;
      const others = (d.entrants || []).filter((x) => x.member_id !== mine.member_id);
      const entrants = [...others, mine].sort((x, y) => y.entries - x.entries);
      const paid = entrants.reduce((a, x) => a + (x.spent || 0), 0);
      const next = { ...d, me: mine, entrants, tournament: d.tournament ? { ...d.tournament, entrant_count: entrants.length, bank_in: paid } : d.tournament };
      dataRef.current = next;
      return next;
    });
  };
  const leaderPanel = leader ? <TourLeader data={data} onChanged={onChanged} /> : null;

  if (!t) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Panel title="Tournament">
            <p className="text-sm text-mist">There is no tournament right now. The Guild Leader opens them; when one is open you can sign up here, build your fighter and bet on every match.</p>
          </Panel>
          {data.last && <LastTournament t={data.last} member={member} sn={sn} />}
          <ArenaRules mode="tour" costs={data.costs} />
        </div>
        <div className="min-w-0 space-y-4">{leaderPanel}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      {t.status === "signup"
        ? <SignUp data={data} t={t} sn={sn} balance={balance} member={member} setBalance={setBalance} onChanged={onChanged} onBought={onBought} leaderPanel={leaderPanel} />
        : <Running data={data} t={t} sn={sn} serverNow={serverNow} balance={balance} member={member} setBalance={setBalance} changedAt={changedAt} refresh={refresh} setData={setData} leaderPanel={leaderPanel} />}
    </div>
  );
}

// ---------- the header: name, prizes, start ----------
const REPEAT_TEXT = { daily: "Repeats every day", weekly: "Repeats every week" };
function Header({ t, sn, children, crowd }) {
  const starts = t.starts_at ? Date.parse(t.starts_at) : 0;
  return (
    <div className="rounded-md border border-[#5a4724] bg-gradient-to-b from-[#1a1b24] to-[#13141b] p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-crimson arena-label">{t.status === "signup" ? "Tournament · sign-up open" : t.status === "running" ? "Tournament · live" : "Tournament"}</p>
      <h2 className="arena-display mt-1 text-2xl font-black text-[#f1d38c] sm:text-3xl">{t.title}</h2>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {t.status === "signup" && <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Starts</dt><dd className="font-heading text-lg font-bold tabular-nums text-[#f1d38c]">{starts ? (starts > sn ? `in ${countdown(starts - sn)}` : "now") : "When the Guild Leader starts it"}</dd></div>}
        <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Fighters</dt><dd className="font-heading text-lg font-bold tabular-nums text-[#f1d38c]">{fmt(t.status === "signup" ? t.entrant_count : t.field.length)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Paid into the bank</dt><dd className="font-heading text-lg font-bold tabular-nums text-[#f1d38c]">{fmt(t.bank_in)}</dd></div>
        {crowd && <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Watching</dt><dd className="flex items-center gap-1.5 font-heading text-lg font-bold tabular-nums text-white"><Eye className="h-4 w-4" aria-hidden="true" />{fmt(crowd.watching)}</dd></div>}
        {REPEAT_TEXT[t.repeat] && <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Schedule</dt><dd className="flex items-center gap-1.5 font-heading text-lg font-bold text-[#f1d38c]"><Repeat className="h-4 w-4" aria-hidden="true" />{REPEAT_TEXT[t.repeat]}</dd></div>}
      </dl>
      {t.prizes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {t.prizes.map((p, i) => (
            <li key={i} className="rounded border border-bronze/45 bg-black/30 px-2.5 py-1 text-sm"><b className="mr-1.5 font-heading text-gold">{PLACE[i]}</b>{p.label}{p.from_bank ? <span className="text-xs text-mist"> · from the bank</span> : ""}</li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

// ---------- sign-up: build your fighter ----------
function SignUp({ data, t, sn, balance, member, setBalance, onChanged, onBought, leaderPanel }) {
  const values = normValues(t.values);
  const costs = data.costs;
  const me = data.me;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rolled, setRolled] = useState("");
  // the last result also shows for a few seconds on the stage
  const [flash, setFlash] = useState(null);
  useEffect(() => { if (rolled) setFlash({ text: rolled, at: Date.now() }); }, [rolled]);
  useEffect(() => { if (!flash) return undefined; const id = setTimeout(() => setFlash(null), 6000); return () => clearTimeout(id); }, [flash]);
  const [fresh, setFresh] = useState(null);
  const [roll, setRoll] = useState(null);  // { mode, won, old, owned }

  const myFighter = me ? asFighter({ ...me, role: member.role }) : null;
  // The stage shows your fighter (or the two biggest builds) standing in the ring.
  const pair = useMemo(() => {
    const list = (data.entrants || []).map((x) => asFighter(x));
    const a = myFighter || list[0] || null;
    const b = list.find((x) => !myFighter || x.name !== myFighter.name) || null;
    if (!a) return null;
    const sparring = { name: "Sparring partner", look: a.look === "juts" ? "judy" : "juts", rank: "Member", entries: 1, ups: {}, weapon: 0, skills: [], pet: 0, mount: null };
    return [a, b || sparring];
  }, [data.entrants, me && JSON.stringify(me)]);  
  // With a fighter of your own the stage becomes the Character Lab: just your character on a test
  // platform, trying out its buffs, its charge and Skyfall. Before that, the ring with the biggest builds.
  const labKey = myFighter ? `lab-${JSON.stringify([myFighter.look, myFighter.entries, myFighter.ups, myFighter.weapon, myFighter.skills, myFighter.pet, myFighter.mount])}` : "";
  const spec = useMemo(() => {
    if (!pair) return null;
    if (myFighter) return { key: labKey, setup: true, a: myFighter, b: pair[1], values, fight: true };
    return { key: `signup-${pair[0].look}-${pair[1].look}`, a: pair[0], b: pair[1], values, fight: simulate(pair[0], pair[1], 1, { draws: false, limit: 0.2, values }) };
  }, [pair, labKey, JSON.stringify(values)]);  
  const stageClock = useCallback(() => ({ idle: true, banner: me ? "" : "Buy an entry to get your own fighter" }), [me]);
  const crowd = useArenaCrowd(`tour:${t.id}`);

  // The weapon forge on the stage: the blade soaks up the next aura while the try goes to the server (at
  // least FORGE_MS, so it can be seen), then keeps it or loses it; the result shows once that has played.
  const forge = (detail) => { try { document.dispatchEvent(new CustomEvent("bi:forge", { detail })); } catch { /* old browser */ } };
  const FORGE_MS = 1700, FORGE_END_MS = 1000;
  const buy = async (item, count = 1) => {
    setBusy(item + count); setError(""); setRolled("");
    const forging = item === "weapon" && me && me.weapon < WEAPON.max, began = Date.now();
    if (forging) forge({ phase: "start", level: me.weapon + 1 });
    try {
      const res = await base44.functions.invoke("tournamentAction", item === "reroll" ? { action: "reroll", tour_id: t.id } : { action: "buy", tour_id: t.id, item, count, price: costs[COST_KEY[item]] });
      const d = res.data, r = d.rolled || {};
      if (forging) {
        await new Promise((ok) => setTimeout(ok, Math.max(0, FORGE_MS - (Date.now() - began))));
        forge({ phase: "end", success: !!r.success, level: r.weapon });
        await new Promise((ok) => setTimeout(ok, FORGE_END_MS));
      }
      if (typeof d.balance === "number") setBalance(d.balance);
      if (item === "reroll") setRolled(`Your new character: ${lookTitle(d.me.look)}.`);
      else if (item === "entry") {
        const got = (r.ups || []).filter(Boolean).map((id) => { const u = UPGRADES.find((x) => x.id === id); return `${u.name} +${fmt(values.ups[id])}${u.unit}`; });
        setFresh((r.ups || []).filter(Boolean).slice(-1)[0] || null);
        setRolled(r.joined ? `You're in! Your character is ${lookTitle(d.me.look)}.${got.length ? ` Rolled: ${got.join(" · ")}` : ""}` : got.length ? `Rolled: ${got.join(" · ")}` : `You have ${TOTAL_CAP} upgrades. More entries still raise your halo.`);
      } else if (item === "weapon") setRolled(r.success ? `Upgrade worked: weapon +${r.weapon}, ${WEAPON.looks[r.weapon - 1].name} aura.` : `Upgrade failed (${Math.round(values.weapon.chance * 100)}% success rate). The weapon stays at +${r.weapon}; the points still go to the bank.`);
      else if (item === "skill") { setRoll({ mode: "skills", won: r.skill, owned: d.me.skills }); setRolled(`You learned ${SKILLS[r.skill].name}.`); }
      else if (item === "pet") setRolled(`Iron Condor grew to ${petGrowth(r.pet)}%: HP +${fmt(petBonus(r.pet, "hp"))} · ATK +${fmt(petBonus(r.pet, "atk"))} · DEF +${fmt(petBonus(r.pet, "def"))} in total.`);
      else if (item === "mount") { if (r.drew) setRoll({ mode: "mount", won: r.mount.pair, old: null }); setRolled(r.drew ? `Your mount drew ${MOUNT.pairs[r.mount.pair].map((id) => STAT_NAME[id]).join(" and ")}: ${mountText(r.mount)}.` : `Mount level ${r.mount.lv}: ${mountText(r.mount)}.`); }
      else if (item === "mountReset") { setRoll({ mode: "mount", won: r.mount.pair, old: r.old }); setRolled(`Mount reset: now ${mountText(r.mount)}.`); }
      onBought(d.me);
    } catch (e) { if (forging) forge({ phase: "end", success: false }); const m = errorText(e, "That didn't go through. Try again."); setError(m); setFlash({ text: m, error: true, at: Date.now() }); onChanged(); }
    finally { setBusy(""); }
  };

  const used = me ? Object.values(me.ups || {}).reduce((a, b) => a + b, 0) : 0;
  const mt = me && me.mount;

  return (
    <>
      <div className="min-w-0 space-y-4">
        <Header t={t} sn={sn} crowd={crowd} />
        <ArenaStage spec={spec} clock={stageClock} showLog={false} crowd={myFighter ? null : crowd} chip={myFighter ? null : { text: "Sign-up open" }}
          overlay={me ? <LabRails me={me} costs={costs} values={values} busy={busy} buy={buy} flash={flash} used={used} /> : null} />

        <Panel title="Your fighter">
          {!me ? (
            <div className="space-y-3">
              <p className="text-sm">Your first entry ({fmt(costs.entry)} points) gives you a fighter: one of the guild's characters, picked at random. You get one free re-roll, and it never gives you the same one back.</p>
              <button type="button" onClick={() => buy("entry", 1)} disabled={!!busy || balance < costs.entry} className="btn-seal h-11 px-5">{busy === "entry1" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Sign up · ${fmt(costs.entry)} pts`}</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-10 w-10 rounded-full border-2 border-gold" style={{ background: `radial-gradient(circle at 35% 35%, #fff8, ${lookColor(me.look)} 60%, #000 120%)` }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-lg font-bold">{lookTitle(me.look)}</p>
                  <p className="text-xs text-mist">{fmt(me.entries)} {me.entries === 1 ? "entry" : "entries"} · {used}/{TOTAL_CAP} upgrades · paid {fmt(me.spent)}</p>
                </div>
                <button type="button" onClick={() => buy("reroll")} disabled={!!busy || me.rerolled} className="btn-bronze h-10 px-3 text-sm">
                  {busy === "reroll1" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Shuffle className="h-4 w-4" /> {me.rerolled ? "Re-roll used" : "Re-roll character (free, once)"}</>}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1.5 text-[13px] sm:grid-cols-2">
                {UPGRADES.map((u) => (
                  <div key={u.id} className="flex items-center gap-2"><span className="w-28 shrink-0 text-mist">{u.name}</span><Pips n={(me.ups || {})[u.id] || 0} fresh={fresh === u.id} /><span className="ml-auto tabular-nums">+{fmt(((me.ups || {})[u.id] || 0) * values.ups[u.id])}{u.unit}</span></div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <B busy={busy} id="entry1" onClick={() => buy("entry", 1)}><b>Buy 1 entry · {fmt(costs.entry)} pts</b><span className="text-xs text-mist">Rolls one upgrade (up to {PER_STAT} per stat, {TOTAL_CAP} in all) and raises your halo</span></B>
                <B busy={busy} id="entry5" onClick={() => buy("entry", 5)}><b>Buy 5 entries · {fmt(costs.entry * 5)} pts</b><span className="text-xs text-mist">Five upgrade rolls at once</span></B>
                <B busy={busy} id="skill1" onClick={() => buy("skill")} disabled={me.skills.length >= MAX_SKILLS}>
                  <b>{me.skills.length >= MAX_SKILLS ? `${MAX_SKILLS} skills (max)` : `Add skill · ${fmt(costs.skill)} pts`}</b>
                  <span className="flex items-center gap-2 text-xs text-mist">A random buff skill you don't have yet, up to {MAX_SKILLS} <SkillIcons skills={me.skills} size={20} /></span>
                </B>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setRoll({ mode: "skills", won: null, owned: me.skills })} className="btn-bronze h-10 px-3 text-sm">See all skills</button>
                  <button type="button" onClick={() => setRoll({ mode: "mount", won: null, old: null })} className="btn-bronze h-10 px-3 text-sm">See all mount stats</button>
                </div>
              </div>
              {/* weapon, pet and mount, each with its icon, its level bar and what the next one gives */}
              <div className="divide-y divide-bronze/25 rounded border border-bronze/40 bg-black/25">
                <GearRow icon="/arena/icons/weapon.jpg" glow={me.weapon ? hex(WEAPON.looks[me.weapon - 1].color) : ""} color={me.weapon ? hex(WEAPON.looks[me.weapon - 1].color) : "#f3ead7"}
                  title={`Weapon · ${me.weapon ? `+${me.weapon} · ${WEAPON.looks[me.weapon - 1].name} aura` : "not upgraded"}`}
                  text={`Each level: ATK +${Math.round(values.weapon.atk * 100)}% and Crit rate +${values.weapon.crit}%, and an aura. ${me.weapon_tries} ${me.weapon_tries === 1 ? "try" : "tries"} so far.`}
                  lv={me.weapon} max={WEAPON.max}>
                  <B2 busy={busy} id="weapon1" onClick={() => buy("weapon")} disabled={me.weapon >= WEAPON.max}>{me.weapon >= WEAPON.max ? `Weapon +${WEAPON.max} (max)` : `Try upgrade · ${fmt(costs.weaponTry)} pts · ${Math.round(values.weapon.chance * 100)}% success rate`}</B2>
                  {me.weapon < WEAPON.max && <span className="text-xs text-mist">Next: +{me.weapon + 1} · {WEAPON.looks[me.weapon].name} aura</span>}
                </GearRow>
                <GearRow icon="/arena/icons/pet.jpg" color="#c9a2ff" title={`${PET.name} · Growth ${petGrowth(me.pet)}%`}
                  text={me.pet ? `HP +${fmt(petBonus(me.pet, "hp"))} · ATK +${fmt(petBonus(me.pet, "atk"))} · DEF +${fmt(petBonus(me.pet, "def"))}. Each 25% of growth adds an eighth of the full 200% bonus.` : "No pet yet. Each 25% of growth adds an eighth of the full 200% bonus."}
                  lv={me.pet} max={PET.levels}>
                  <B2 busy={busy} id="pet1" onClick={() => buy("pet")} disabled={me.pet >= PET.levels}>{me.pet >= PET.levels ? "Pet at 200% growth" : `${me.pet ? "Grow to" : "Buy at"} ${petGrowth(me.pet + 1)}% growth · ${fmt(costs.pet)} pts`}</B2>
                  {me.pet < PET.levels && <span className="text-xs text-mist">Next: HP +{fmt(petBonus(me.pet + 1, "hp") - petBonus(me.pet, "hp"))} · ATK +{fmt(petBonus(me.pet + 1, "atk") - petBonus(me.pet, "atk"))} · DEF +{fmt(petBonus(me.pet + 1, "def") - petBonus(me.pet, "def"))}</span>}
                </GearRow>
                <GearRow icon="/arena/icons/mount.jpg" color="#7fc3ff" title={`Mount · ${mt ? `level ${mt.lv} · ${mountText(mt)}` : "none yet"}`}
                  text={`The first level draws two stats at random; every level after adds ${MOUNT.per}% more to the same two.`}
                  lv={mt ? mt.lv : 0} max={MOUNT.levels}>
                  <B2 busy={busy} id="mount1" onClick={() => buy("mount")} disabled={mt && mt.lv >= MOUNT.levels}>{!mt ? `Buy mount (draws 2 stats) · ${fmt(costs.mountLevel)} pts` : mt.lv >= MOUNT.levels ? `Mount at level ${MOUNT.levels} (max)` : `Level up to ${mt.lv + 1} (+${(mt.lv + 1) * MOUNT.per}% each) · ${fmt(costs.mountLevel)} pts`}</B2>
                  <B2 busy={busy} id="mountReset1" onClick={() => buy("mountReset")} disabled={!mt} quiet>Reset stats · {fmt(costs.mountReset)} pts</B2>
                </GearRow>
              </div>
              {rolled && <p className="text-sm text-gold" aria-live="polite">{rolled}</p>}
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
          <p className="mt-3 text-xs text-mist">Every point paid goes into the Arena bank. There are no refunds once paid, unless only one fighter signs up.</p>
        </Panel>

        <Panel title={`Fighters (${fmt((data.entrants || []).length)})`} bodyClassName="px-0 sm:px-0">
          {(data.entrants || []).length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist"><th className="px-3 py-1.5">Fighter</th><th>Weapon</th><th>Skills</th><th className="text-right">Entries</th><th className="text-right">Upgrades</th><th className="text-right">Pet</th><th className="text-right">Mount</th><th className="px-3 text-right">Paid</th></tr></thead>
                <tbody className="divide-y divide-bronze/25">
                  {data.entrants.map((x) => {
                    const W = x.weapon ? WEAPON.looks[x.weapon - 1] : null;
                    return (
                      <tr key={x.member_id} className={x.member_id === member.id ? "bg-gold/10" : ""}>
                        <td className="px-3 py-1.5"><span className="flex items-center gap-2"><Avatar url={x.avatar} name={x.name} size={22} /><span className="h-2 w-2 rounded-full" style={{ background: lookColor(x.look) }} aria-hidden="true" /><span className="truncate">{x.name}{x.member_id === member.id ? " (you)" : ""}</span></span></td>
                        <td style={W ? { color: hex(W.color) } : undefined}>{W ? `+${x.weapon} ${W.name}` : "—"}</td>
                        <td><SkillIcons skills={x.skills} size={20} /></td>
                        <td className="text-right tabular-nums">{fmt(x.entries)}</td>
                        <td className="text-right tabular-nums">{Object.values(x.ups || {}).reduce((a, b) => a + b, 0)}</td>
                        <td className="text-right">{x.pet ? `${petGrowth(x.pet)}%` : "—"}</td>
                        <td className="text-right">{x.mount ? `Lv ${x.mount.lv}` : "—"}</td>
                        <td className="px-3 text-right tabular-nums">{fmt(x.spent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="px-4 text-sm text-mist">No one has signed up yet. Be the first.</p>}
        </Panel>
        <ArenaRules mode="tour" costs={costs} values={values} />
      </div>
      <div className="min-w-0 space-y-4">
        {myFighter && <FighterCard f={myFighter} values={values} side="You" />}
        {leaderPanel}
      </div>
      <RollDialog open={!!roll} onClose={() => setRoll(null)} mode={roll ? roll.mode : "skills"} won={roll ? roll.won : null} owned={roll && roll.owned ? roll.owned : []} old={roll ? roll.old : null} mount={me && me.mount} costs={costs} />
    </>
  );
}

// ---------- the tournament being fought ----------
function Running({ data, t, sn, serverNow, balance, member, setBalance, changedAt, refresh, setData, leaderPanel }) {
  const values = normValues(t.values);
  const field = useMemo(() => t.field.map((x) => asFighter(x)), [t.id]);  
  const ms = t.matches;
  const RESULT_MS = (data.result_seconds || 10) * 1000;
  // the match on screen: the one open or being fought, else the last one's result, else the next one
  // (a match only gets its betting window once the one before it has been fought: nothing is decided ahead)
  const cur = ms.find((m) => m.open_at && sn >= Date.parse(m.open_at) && (!m.end_at || sn < Date.parse(m.end_at) + RESULT_MS))
    || ms.find((m) => m.open_at && sn < Date.parse(m.open_at)) || ms.find((m) => !m.outcome) || ms[ms.length - 1];
  const known = cur && cur.a != null && cur.b != null;
  const fa = known ? field[cur.a] : null, fb = known ? field[cur.b] : null;
  const seed = cur ? cur.seed : null;
  const fight = useMemo(() => {
    if (!fa || !fb) return null;
    return seed != null ? simulate(fa, fb, seed, { draws: false, values }) : simulate(fa, fb, 1, { draws: false, limit: 0.2, values });
  }, [cur && cur.no, seed, fa, fb]);  
  const spec = useMemo(() => (fight ? { key: `tour-${t.id}-${cur.no}-${seed != null ? "f" : "s"}`, a: fa, b: fb, fight, values } : null), [fight]);  
  const curRef = useRef(cur); curRef.current = cur;
  const stageClock = useCallback(() => {
    const m = curRef.current, now = serverNow();
    if (!m) return { idle: true };
    if (!m.open_at) return { idle: true, banner: `Match ${m.no} · waiting for the match before it` };
    const open = Date.parse(m.open_at), close = Date.parse(m.close_at);
    if (now < open) return { idle: true, banner: `Match ${m.no} · betting opens in ${Math.ceil((open - now) / 1000)} s` };
    if (now < close) return { betting: true, betLeft: (close - now) / 1000 };
    if (m.seed == null) return { idle: true, banner: "Betting is closed · the fight is about to start" };
    return { t: (now - close) / 1000 - (data.intro || 3) };
  }, [serverNow, data.intro]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { setError(""); setNotice(""); }, [cur && cur.no]);
  const crowd = useArenaCrowd(`tour:${t.id}`);
  // a finished match watched again from its seed
  const [replay, setReplay] = useState(null);
  const replaySpec = useMemo(() => (replay ? replaySpecOf(t, field, ms.find((m) => m.no === replay.no), values, replay.started) : null), [replay]);  
  const board = data.board && cur && data.board.match_no === cur.no ? data.board : null;
  const status = cur ? (!cur.open_at || sn < Date.parse(cur.open_at) ? "waiting" : sn < Date.parse(cur.close_at) ? "betting" : cur.outcome ? "done" : "fighting") : "";
  const open = status === "betting" && Date.parse(cur.close_at) - sn > 500;
  const names = known ? [fa.name, fb.name] : ["", ""];

  const place = async (lines) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "bet", match: cur.no, lines });
      try { localStorage.setItem(OWED_KEY, "1"); } catch { /* */ }
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      changedAt.current = Date.now();
      setData((d) => (d ? { ...d, board: { ...(d.board && d.board.match_no === cur.no ? d.board : { match_no: cur.no, bets: [], players: 0, total_bet: 0 }), mine: res.data.mine } } : d));
      setNotice(lines.length > 1 ? `${lines.length} bets are on.` : "Your bet is on.");
      refresh();
      return true;
    } catch (e) { setError(errorText(e, "That bet didn't go on.")); changedAt.current = Date.now(); setTimeout(refresh, 300); return false; }
    finally { setBusy(false); }
  };
  const remove = async (payload) => {
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("tournamentAction", { action: "remove", match: cur.no, ...payload });
      if (typeof res.data.balance === "number") setBalance(res.data.balance);
      changedAt.current = Date.now();
      setData((d) => (d && d.board ? { ...d, board: { ...d.board, mine: res.data.mine } } : d));
      refresh();
    } catch (e) { setError(errorText(e, "That bet couldn't be taken back.")); }
    finally { setBusy(false); }
  };

  const outcome = cur && cur.outcome;
  const wide = useWide();
  const mine = board ? board.mine : null;
  const nameOf = (i) => (i == null ? null : field[i].name);
  const refName = refNameOf(field);

  // the bet slip and this member's bets: beside the stage on a computer, straight under it on a phone
  const slip = known ? (
    <>
      {cur.odds && (
        <BetSlip fightKey={`${t.id}-${cur.no}`} odds={cur.odds} names={names} draws={false} open={open} mineLines={mine ? mine.lines : []}
          closedText={status === "waiting" ? "Betting opens soon" : status === "betting" ? "Betting is closing" : "Wait for the next match"}
          limit={data.limit || 5000} minBet={data.min_bet || 1} placed={mine ? mine.amount || 0 : 0} balance={balance} onPlace={place} busy={busy} error={error} notice={notice} />
      )}
      <MyBets mine={mine} names={names} outcome={status === "done" ? outcome : null} open={open} busy={busy} onRemove={remove} />
    </>
  ) : null;
  return (
    <>
      <div className="min-w-0 space-y-4">
        <Header t={t} sn={sn} crowd={crowd} />
        {replaySpec ? (
          <>
            <ReplayStage key={replaySpec.key} spec={replaySpec} crowd={crowd} />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/50 bg-gold/10 px-3 py-2 text-sm">
              <span>Replay of match {replay.no}: {replaySpec.a.name} vs {replaySpec.b.name}</span>
              <button type="button" onClick={() => setReplay(null)} className="btn-seal h-9 px-4 text-sm"><Radio className="h-4 w-4" /> Back to live</button>
            </div>
          </>
        ) : spec ? <ArenaStage spec={spec} clock={stageClock} crowd={crowd} chip={status === "betting" ? { text: "Bets open" } : status === "fighting" ? { text: "Live", live: true } : status === "done" ? { text: "Result" } : { text: "Next match" }} />
          : <Panel><p className="text-sm text-mist">Waiting for the next match.</p></Panel>}
        {cur && (
          <div className="rounded-md border border-bronze/45 bg-black/40 px-3 py-2.5" aria-live="polite">
            <p className="font-heading text-base font-bold text-gold">
              {cur.stage} · match {cur.no} of {ms.length}: {known ? `${fa.name} vs ${fb.name}` : `${refName(cur.refs[0])} vs ${refName(cur.refs[1])}`}
            </p>
            <p className="text-sm text-mist">
              {status === "waiting" && (cur.open_at ? `Betting opens in ${countdown(Date.parse(cur.open_at) - sn)}` : "Betting opens after the match before it")}
              {status === "betting" && `Betting closes in ${Math.max(0, Math.ceil((Date.parse(cur.close_at) - sn) / 1000))} s`}
              {status === "fighting" && "Fight in progress"}
              {status === "done" && `${nameOf(cur.winner)} wins ${outcome.how === "ko" ? "by KO" : "on time (more HP left)"} in ${outcome.length.toFixed(1)} s`}
            </p>
          </div>
        )}
        {!wide && <div className="space-y-3">{slip}</div>}
        {known && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[fa, fb].map((f, i) => (
              <FighterCard key={i} f={f} values={values} highlight={status === "done" && cur.winner === (i ? cur.b : cur.a)}>
                {cur.odds && <p className="mt-2 flex items-center justify-between border-t border-bronze/25 pt-2 text-sm"><span className="text-mist">To win</span><b className="font-heading text-gold">{fmtPrice(i ? cur.odds.b : cur.odds.a)}</b></p>}
              </FighterCard>
            ))}
          </div>
        )}
        <Bracket t={t} field={field} sn={sn} curNo={cur ? cur.no : 0} memberId={member.id} watching={replay ? replay.no : 0} onWatch={(m) => { setReplay({ no: m.no, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </div>
      <div className="min-w-0 space-y-4">
        {wide && slip}
        {known && <BetBoard board={board} names={names} done={status === "done"} />}
        {leaderPanel}
      </div>
    </>
  );
}

// ---------- the bracket (tap a finished match to watch it again) ----------
const refNameOf = (field) => (ref) => (ref.s !== undefined ? field[ref.s].name : ref.w !== undefined ? `Winner of match ${ref.w}` : `Loser of match ${ref.l}`);
function replaySpecOf(t, field, m, values, started) {
  if (!m || m.seed == null || m.a == null || m.b == null) return null;
  const a = field[m.a], b = field[m.b];
  return { key: `tour-replay-${t.id}-${m.no}-${started}`, a, b, values, fight: simulate(a, b, m.seed, { draws: false, values }) };
}
function Bracket({ t, field, sn, curNo, memberId, watching, onWatch }) {
  const ms = t.matches || [];
  const refName = refNameOf(field);
  const rounds = [...new Set(ms.map((m) => m.round))];
  return (
    <Panel title="Bracket">
      <p className="-mt-1 mb-3 text-xs text-mist">Tap Watch on a finished match to see it again.</p>
      <div className="space-y-4">
        {rounds.map((r) => (
          <div key={r}>
            <p className="mb-1.5 text-xs uppercase tracking-[0.16em] text-mist">{ms.find((m) => m.round === r && !m.bronze) ? ms.find((m) => m.round === r && !m.bronze).stage : ""}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
              {ms.filter((m) => m.round === r).map((m) => {
                const st = !m.open_at || sn < Date.parse(m.open_at) ? "waiting" : sn < Date.parse(m.close_at) ? "betting" : m.outcome ? "done" : "fighting";
                const side = (k) => {
                  const i = k ? m.b : m.a, ref = m.refs[k];
                  const name = i != null ? field[i].name : refName(ref);
                  const win = st === "done" && m.winner === i, lose = st === "done" && m.winner !== i;
                  return (
                    <div className={cn("flex items-center gap-2 px-2.5 py-1.5", k && "border-t border-bronze/25", win && "font-bold text-gold", lose && "text-mist")}>
                      {i != null && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: lookColor(field[i].look) }} aria-hidden="true" />}
                      <span className={cn("min-w-0 flex-1 truncate", i == null && "italic text-mist")}>{name}{i != null && t.field[i].member_id === memberId ? " (you)" : ""}</span>
                      {m.odds && i != null && st !== "done" && <span className="shrink-0 text-xs tabular-nums text-mist">{fmtPrice(k ? m.odds.b : m.odds.a)}</span>}
                      {win && <Trophy className="h-3.5 w-3.5 shrink-0" />}
                    </div>
                  );
                };
                return (
                  <div key={m.no} className={cn("overflow-hidden rounded border bg-black/30 text-sm", curNo === m.no || watching === m.no ? "border-gold ring-1 ring-gold" : "border-bronze/40")}>
                    <div className="flex items-center justify-between gap-2 bg-black/40 px-2.5 py-1 text-[11px] uppercase tracking-wider text-mist">
                      <span>{m.bronze ? "Third place" : `Match ${m.no}`}</span>
                      <span className="flex items-center gap-2">
                        <span className={cn(st === "betting" && "text-gold", st === "fighting" && "text-crimson")}>{st === "waiting" ? (m.open_at ? new Date(Date.parse(m.open_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Later") : st === "betting" ? "Bets open" : st === "fighting" ? "Live" : m.outcome.how === "ko" ? "KO" : "Time"}</span>
                        {st === "done" && m.seed != null && onWatch && (
                          <button type="button" onClick={() => onWatch(m)} className="flex items-center gap-1 rounded border border-bronze/45 px-1.5 py-0.5 normal-case tracking-normal text-mist hover:border-gold hover:text-gold"><History className="h-3 w-3" /> Watch</button>
                        )}
                      </span>
                    </div>
                    {side(0)}{side(1)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------- the last tournament's result ----------
function LastTournament({ t, member, sn }) {
  const field = useMemo(() => (t.field || []).map((x) => asFighter(x)), [t.id]);  
  const values = normValues(t.values);
  const [replay, setReplay] = useState(null);
  const replaySpec = useMemo(() => (replay ? replaySpecOf(t, field, (t.matches || []).find((m) => m.no === replay.no), values, replay.started) : null), [replay]);  
  if (t.status === "cancelled") {
    return <Panel title={`"${t.title}" was cancelled`}><p className="text-sm">{t.cancel_reason}</p></Panel>;
  }
  return (
    <div className="space-y-4">
      <Panel title={`"${t.title}": results`}>
        <ol className="space-y-2">
          {(t.results || []).map((r) => (
            <li key={r.place} className={cn("flex items-center gap-3 rounded border px-3 py-2", r.place === 1 ? "border-gold bg-gold/10" : "border-bronze/40 bg-black/30")}>
              <span className="w-10 font-heading text-lg font-bold text-gold">{PLACE[r.place - 1]}</span>
              <Avatar url={r.avatar} name={r.name} size={28} />
              <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
              <span className="text-sm text-mist">{r.prize || ""}{r.kind === "points" && r.paid ? " · paid" : r.kind === "code" ? (r.code_status === "delivered" ? " · code sent" : "") : r.kind === "item" ? " · from the Guild Leader" : ""}</span>
            </li>
          ))}
        </ol>
      </Panel>
      {replaySpec && <ReplayStage key={replaySpec.key} spec={replaySpec} />}
      {(t.matches || []).length > 0 && <Bracket t={t} field={field} sn={sn} curNo={0} memberId={member.id} watching={replay ? replay.no : 0} onWatch={(m) => { setReplay({ no: m.no, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </div>
  );
}