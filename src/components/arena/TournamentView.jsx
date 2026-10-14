import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trophy, Shuffle, History, Radio, Repeat, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { useGuild, errorText } from "@/lib/GuildContext";
import { PLACE } from "@/lib/prizes";
import {
  simulate, ENGINE_VERSION, SKILLS, WEAPON, PET, MOUNT, MAX_SKILLS, UPGRADES, TOTAL_CAP, PER_STAT, petGrowth, petBonus, mountText, normValues, STAT_NAME, ROLL_PACKS
} from "@/lib/arenaEngine";
import { cn } from "@/lib/utils";
import {
  ArenaStage, ReplayStage, FighterCard, BetSlip, MyBets, BetBoard, RollDialog, SkillIcons, Pips, asFighter, fmt, fmtPrice, hex, lookTitle, lookColor, useServerClock, useArenaCrowd, useWide
} from "./arenaUi";
import TourLeader from "./TourLeader";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import ArenaRules from "./ArenaRules";
import { TitleTag, DoubleBracket, PredictView, MyPrediction, PredictionResult, LinkReplay, sendFinalVideo } from "./TourExtras";

// Arena tournaments. Sign-up: joining gives you a fighter (a random character, one free re-roll),
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
// member builds their fighter while watching it, with no scrolling down to the shop. Left: random stats and skill
// (the character re-roll is only under "Your fighter"). Right: weapon, Iron Condor, mount. The full shop with every detail stays in "Your fighter" below.
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
        {pips && (pips[1] > 12
          ? <span className="pips bar" style={pipColor ? { "--pip": pipColor } : undefined}><i className="on" style={{ flex: "none", width: `${Math.min(100, (pips[0] / pips[1]) * 100)}%` }} /></span>
          : <span className="pips" style={pipColor ? { "--pip": pipColor } : undefined}>{Array.from({ length: pips[1] }, (_, k) => <i key={k} className={k < pips[0] ? "on" : ""} />)}</span>)}
      </span>
    </button>
  );
}
function LabRails({ me, costs, values, busy, buy, flash, used, over = () => false }) {
  const mt = me.mount, W = me.weapon ? WEAPON.looks[me.weapon - 1] : null, maxW = me.weapon >= WEAPON.max, nextW = !maxW ? WEAPON.looks[me.weapon] : null;
  const skillIcon = me.skills.length ? `/arena/icons/${me.skills[me.skills.length - 1]}.jpg` : "/arena/icons/spirits.jpg";
  const chance = Math.round(values.weapon.chance * 100);
  return (
    <>
      <div className="lab-rail left" role="group" aria-label="Random stats and skills">
        {ROLL_PACKS.map((n) => (
          <LabTile key={n} busy={busy} id={`roll${n}`} gold onClick={() => buy("roll", n)} disabled={used + n > TOTAL_CAP || over(costs.roll * n)} text={`+${n}`} name={`${n} random stat${n === 1 ? "" : "s"}`}
            price={`${fmt(costs.roll * n)} pts`} pips={n === 1 ? [used, TOTAL_CAP] : null}
            note={used + n > TOTAL_CAP ? `Room for ${TOTAL_CAP - used} more random stats` : `${fmt(costs.roll * n)} points for ${n} random stat${n === 1 ? "" : "s"} (${fmt(costs.roll)} each). ${used}/${TOTAL_CAP} so far.`} />
        ))}
        <LabTile busy={busy} id="skill1" onClick={() => buy("skill")} disabled={me.skills.length >= MAX_SKILLS || over(costs.skill)} icon={skillIcon} name={`Skill ${me.skills.length}/${MAX_SKILLS}`}
          price={me.skills.length >= MAX_SKILLS ? "Full" : `${fmt(costs.skill)} pts`} note="Add a random buff skill you don't have yet" />
      </div>
      <div className="lab-rail right" role="group" aria-label="Weapon, pet and mount">
        <LabTile busy={busy} id="weapon1" onClick={() => buy("weapon")} disabled={maxW || over(costs.weaponTry)} icon="/arena/icons/weapon.jpg" glow={W ? hex(W.color) : ""}
          name={`Weapon +${me.weapon}`} price={maxW ? "Max" : `${fmt(costs.weaponTry)} · ${chance}%`} pips={[me.weapon, WEAPON.max]} pipColor={W ? hex(W.color) : undefined}
          note={maxW ? `Weapon +${WEAPON.max}` : `Try a weapon upgrade (${fmt(costs.weaponTry)} pts): +${me.weapon + 1}, ${nextW.name} aura. Each level +${Math.round(values.weapon.atk * 100)}% ATK and +${values.weapon.crit}% Crit rate. ${weaponNote(chance)}`} />
        <LabTile busy={busy} id="pet1" onClick={() => buy("pet")} disabled={me.pet >= PET.levels || over(costs.pet)} icon="/arena/icons/pet.jpg"
          name={me.pet >= PET.levels ? "Condor max" : `Condor ${petGrowth(me.pet)}%`} price={me.pet >= PET.levels ? "Max" : `${fmt(costs.pet)} pts`} pips={[me.pet, PET.levels]} pipColor="#c9a2ff"
          note={me.pet >= PET.levels ? "Iron Condor at 200%" : `Grow the Iron Condor to ${petGrowth(me.pet + 1)}% (${fmt(costs.pet)} pts): HP +${fmt(petBonus(me.pet + 1, "hp") - petBonus(me.pet, "hp"))}, ATK +${fmt(petBonus(me.pet + 1, "atk") - petBonus(me.pet, "atk"))}, DEF +${fmt(petBonus(me.pet + 1, "def") - petBonus(me.pet, "def"))}`} />
        <LabTile busy={busy} id="mount1" onClick={() => buy("mount")} disabled={(mt && mt.lv >= MOUNT.levels) || over(costs.mountLevel)} icon="/arena/icons/mount.jpg"
          name={mt ? `Mount Lv${mt.lv}` : "Mount"} price={mt && mt.lv >= MOUNT.levels ? "Max" : `${fmt(costs.mountLevel)} pts`} pips={[mt ? mt.lv : 0, MOUNT.levels]} pipColor="#7fc3ff"
          note={mt ? `${mountText(mt)}. Next level: +${MOUNT.per}% more to both (${fmt(costs.mountLevel)} pts)` : `Buy a mount (${fmt(costs.mountLevel)} pts): draws two stats at random`} />
        {mt && <LabTile busy={busy} id="mountReset1" onClick={() => buy("mountReset")} disabled={over(costs.mountReset)} icon={<Shuffle className="h-4 w-4 text-[#7fc3ff]" />} name="Reset"
          price={`${fmt(costs.mountReset)} pts`} note={`Draws a new pair of mount stats and keeps the level (${fmt(costs.mountReset)} pts). ${NOT_ENTRY}`} />}
      </div>
      {flash && <p role="status" className={cn("lab-flash", flash.error && "err")}>{flash.text}</p>}
    </>
  );
}

// The security wall before a change that can't be undone: it says exactly what is about to happen and
// asks the member to tick that they understand before the button works.
function ConfirmChange({ confirm, me, costs, balance, onCancel, onConfirm }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { setSure(false); }, [confirm]);
  if (!confirm || !me) return null;
  // 6.18: the weapon try's wall is a simple "are you sure" with its success chance (no checkbox)
  if (confirm.item === "weapon") {
    const wcost = costs.weaponTry, wshort = wcost > (balance || 0);
    return (
      <AlertDialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
        <AlertDialogContent className="max-w-md border-bronze bg-panel">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-gold">Try a weapon upgrade?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-mist">
                <p className="font-heading text-2xl font-bold text-white">{confirm.chance}% chance of success</p>
                <p>Weapon +{me.weapon} → +{me.weapon + 1}. Cost: <b className="text-white">{fmt(wcost)} points</b>, paid win or lose.</p>
                <p>A failed try doesn't give a random stat, but its points count toward your total spent.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {wshort && <p className="text-sm text-ember">You need {fmt(wcost - (balance || 0))} more points.</p>}
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="btn-bronze h-10 px-4 text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={wshort} onClick={() => onConfirm("weapon")} className="btn-seal h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-45">
              Try it · {fmt(wcost)} pts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  const reroll = confirm.item === "reroll", mt = me.mount;
  const cost = reroll ? 0 : costs.mountReset, short = cost > (balance || 0);
  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-md border-bronze bg-panel">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-gold">{reroll ? "Re-roll your character?" : "Reset your mount stats?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-mist">
              {reroll ? (
                <>
                  <p>You are about to swap <b className="text-white">{lookTitle(me.look)}</b> for another of the guild's characters, picked at random. You can't choose it and you can't get {lookTitle(me.look)} back.</p>
                  <p>Your random stats, weapon, skills, pet and mount all stay. It's free, but you only get <b className="text-white">one</b> re-roll per tournament.</p>
                </>
              ) : (
                <>
                  <p>You are about to throw away your mount's stats: <b className="text-white">{mt ? mountText(mt) : ""}</b>.</p>
                  <p>It keeps level {mt ? mt.lv : 0} but draws a new pair at random (never the same pair). The new pair could be worse, and you can't get this one back except by luck on another reset.</p>
                  <p>Cost: <b className="text-white">{fmt(cost)} points</b>, not refunded. A reset <b className="text-white">doesn't give a random stat</b>, but the points count toward your total spent.</p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-2 rounded-md border border-bronze/50 bg-black/30 px-3 py-2 text-sm text-white">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--crimson))]" />
          {reroll ? "I understand my character changes and this can't be undone." : `I understand my mount stats change, it costs ${fmt(cost)} points and can't be undone.`}
        </label>
        {short && <p className="text-sm text-ember">You need {fmt(cost - (balance || 0))} more points.</p>}
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="btn-bronze h-10 px-4 text-sm">No, keep it</AlertDialogCancel>
          <AlertDialogAction disabled={!sure || short} onClick={() => onConfirm(confirm.item)} className="btn-seal h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-45">
            {reroll ? "Yes, re-roll" : `Yes, reset · ${fmt(cost)} pts`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// What a weapon try and a mount reset do and don't count for (shown wherever they are bought).
const NOT_ENTRY = "It doesn't give a random stat, but the points count toward your total spent.";
const weaponNote = (chance) => `${chance}% success rate per try. A failed try doesn't give a random stat, but its points count toward your total spent.`;

// which price each shop item uses (sent with the purchase, so a price the Guild Leader just changed is never charged unseen)
const COST_KEY = { join: "join", roll: "roll", weapon: "weaponTry", skill: "skill", pet: "pet", mount: "mountLevel", mountReset: "mountReset" };

export default function TournamentView({ balance, member, link, onCloseLink }) {
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
      if (d) { sync(d.server_now, asked); dataRef.current = d; loaded.current = true; setData(d); setLoadError(""); }
    } catch (e) {
      if (!loaded.current && !(e && e.rateLimited)) setLoadError(errorText(e, "Couldn't load the tournament."));
    } finally { inFlight.current = false; }
  }, [sync]);

  const jitter = useRef(Math.floor(Math.random() * 750));
  // Ask when something can change: the next match opening, betting closing (the seed), a fight ending.
  useEffect(() => {
    refresh();
    const poll = setInterval(() => {
      if (document.hidden) return; // 6.16: a hidden tab makes no calls; it catches up when shown
      const d = dataRef.current, now = serverNow();
      let wait = 15000;
      const t = d && d.tournament;
      if (t && t.status === "running") {
        const marks = [];
        for (const m of t.matches) for (const k of ["open_at", "close_at", "end_at"]) if (m[k]) marks.push(Date.parse(m[k]));
        if (t.ends_at) marks.push(Date.parse(t.ends_at));
        const next = marks.filter((x) => x > now - 200).sort((a, b) => a - b)[0];
        // 6.17: each screen adds its own 0.25-1.1 s, so a crowd doesn't arrive in the same second
        wait = next ? Math.min(6000, Math.max(300, next - now + 350 + jitter.current)) : 4000;
        // a match whose betting has closed but whose seed we don't have yet
        if (t.matches.some((m) => now >= Date.parse(m.close_at) && now < Date.parse(m.close_at) + 600000 && m.seed == null && m.a != null && m.b != null)) wait = Math.min(wait, 1200);
      } else if (t && t.status === "predict") {
        wait = t.predict_until ? Math.min(8000, Math.max(800, Date.parse(t.predict_until) - now + 500)) : 8000;
      } else if (t && t.status === "signup") {
        wait = t.starts_at ? Math.min(10000, Math.max(800, Date.parse(t.starts_at) - now + 500)) : 10000;
      } else if (t && t.status === "paying") wait = 3000;
      if (Date.now() - lastPoll.current >= wait) refresh();
    }, 250);
    const onShow = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onShow); };
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
  const linkReplay = link ? <div className="lg:col-span-2"><LinkReplay q={link} onClose={onCloseLink} /></div> : null;

  if (!t) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {linkReplay}
        <div className="min-w-0 space-y-4">
          <Panel title="Tournament">
            <p className="text-sm text-mist">There is no tournament right now. The Guild Leader opens them; when one is open you can sign up here, build your fighter and bet on every match.</p>
          </Panel>
          {data.last && <LastTournament t={data.last} member={member} sn={sn} leader={leader} />}
          <ArenaRules mode="tour" costs={data.costs} />
        </div>
        <div className="min-w-0 space-y-4">{leaderPanel}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      {linkReplay}
      {t.status === "signup"
        ? <SignUp data={data} t={t} sn={sn} balance={balance} member={member} setBalance={setBalance} onChanged={onChanged} onBought={onBought} leaderPanel={leaderPanel} />
        : t.status === "predict" ? <PredictView data={data} t={t} sn={sn} member={member} refresh={refresh} Header={Header} leaderPanel={leaderPanel} />
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
      <p className="text-xs uppercase tracking-[0.22em] text-crimson arena-label">{t.status === "signup" ? "Tournament · sign-up open" : t.status === "predict" ? "Tournament · bracket drawn · predictions open" : t.status === "running" ? "Tournament · live" : "Tournament"}{t.format === "double" || t.status === "signup" ? " · double elimination" : ""}</p>
      <h2 className="arena-display mt-1 text-2xl font-black text-[#f1d38c] sm:text-3xl">{t.title}</h2>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {t.status === "signup" && <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Starts</dt><dd className="font-heading text-lg font-bold tabular-nums text-[#f1d38c]">{starts ? (starts > sn ? `in ${countdown(starts - sn)}` : "now") : "When the Guild Leader starts it"}</dd></div>}
        <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">Fighters</dt><dd className="font-heading text-lg font-bold tabular-nums text-[#f1d38c]">{fmt(t.status === "signup" ? t.entrant_count : t.field.length)}</dd></div>
        {t.status === "predict" && t.predict_until && <div><dt className="text-[11px] uppercase tracking-[0.16em] text-mist">First match</dt><dd className="font-heading text-lg font-bold tabular-nums text-[#f1d38c]">in {countdown(Date.parse(t.predict_until) - sn + 10000)}</dd></div>}
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
  // the Guild Leader's spending limit for this tournament: what is left for this member (Infinity = no limit)
  const cap = t.max_spend > 0 ? t.max_spend : 0;
  const capLeft = cap ? Math.max(0, cap - ((me && me.spent) || 0)) : Infinity;
  const over = (cost) => cost > capLeft;
  const capText = (cost) => (capLeft <= 0 ? `You've reached this tournament's spending limit of ${fmt(cap)} points.` : `Over this tournament's spending limit: ${fmt(capLeft)} of ${fmt(cap)} points left, and that costs ${fmt(cost)}.`);
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
    return { key: `signup-${pair[0].look}-${pair[1].look}`, a: pair[0], b: pair[1], values, fight: simulate(pair[0], pair[1], 1, { draws: false, ot: false, limit: 0.2, values }) };
  }, [pair, labKey, JSON.stringify(values)]);  
  const stageClock = useCallback(() => ({ idle: true, banner: me ? "" : "Join to get your own fighter" }), [me]);
  const crowd = useArenaCrowd(`tour:${t.id}`);

  // The weapon forge on the stage: the blade soaks up the next aura while the try goes to the server (at
  // least FORGE_MS, so it can be seen), then keeps it or loses it; the result shows once that has played.
  const forge = (detail) => { try { document.dispatchEvent(new CustomEvent("bi:forge", { detail })); } catch { /* old browser */ } };
  const FORGE_MS = 1700, FORGE_END_MS = 1000;
  // Re-roll and mount reset can't be undone: they ask first (see ConfirmChange).
  const [confirm, setConfirm] = useState(null);
  const COST_OF = { join: costs.join, roll: costs.roll, skill: costs.skill, weapon: costs.weaponTry, pet: costs.pet, mount: costs.mountLevel, mountReset: costs.mountReset };
  const buy = (item, count = 1) => {
    const cost = item === "reroll" ? 0 : (COST_OF[item] || 0) * (item === "roll" ? count : 1);
    if (cost && over(cost)) { const m = capText(cost); setError(m); setFlash({ text: m, error: true, at: Date.now() }); return undefined; }
    if (item === "reroll" || item === "mountReset") { if (!busy) setConfirm({ item }); return undefined; }
    // 6.18: a weapon try asks first too, showing its success chance
    if (item === "weapon") { if (!busy) setConfirm({ item, chance: Math.round(values.weapon.chance * 100) }); return undefined; }
    return doBuy(item, count);
  };
  const doBuy = async (item, count = 1) => {
    setBusy(item + count); setError(""); setRolled("");
    const forging = item === "weapon" && me && me.weapon < WEAPON.max, began = Date.now();
    if (forging) { forge({ phase: "start", level: me.weapon + 1 }); setFlash({ text: weaponNote(Math.round(values.weapon.chance * 100)), at: Date.now() }); }
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
      else if (item === "join") setRolled(`You're in! Your character is ${lookTitle(d.me.look)}. Now buy random stats, skills and gear to make it stronger.`);
      else if (item === "roll") {
        const got = (r.ups || []).filter(Boolean).map((id) => { const u = UPGRADES.find((x) => x.id === id); return `${u.name} +${fmt(values.ups[id])}${u.unit}`; });
        setFresh((r.ups || []).filter(Boolean).slice(-1)[0] || null);
        setRolled(got.length ? `Rolled: ${got.join(" · ")}` : `Your fighter has all ${TOTAL_CAP} random stats.`);
      } else if (item === "weapon") setRolled(r.success ? `Upgrade worked: weapon +${r.weapon}, ${WEAPON.looks[r.weapon - 1].name} aura.` : `Upgrade failed (${Math.round(values.weapon.chance * 100)}% success rate). The weapon stays at +${r.weapon}. A failed try doesn't give a random stat, but the ${fmt(costs.weaponTry)} points count toward your total spent.`);
      else if (item === "skill") { setRoll({ mode: "skills", won: r.skill, owned: d.me.skills }); setRolled(`You learned ${SKILLS[r.skill].name}.`); }
      else if (item === "pet") setRolled(`Iron Condor grew to ${petGrowth(r.pet)}%: HP +${fmt(petBonus(r.pet, "hp"))} · ATK +${fmt(petBonus(r.pet, "atk"))} · DEF +${fmt(petBonus(r.pet, "def"))} in total.`);
      else if (item === "mount") { if (r.drew) setRoll({ mode: "mount", won: r.mount.pair, old: null }); setRolled(r.drew ? `Your mount drew ${MOUNT.pairs[r.mount.pair].map((id) => STAT_NAME[id]).join(" and ")}: ${mountText(r.mount)}.` : `Mount level ${r.mount.lv}: ${mountText(r.mount)}.`); }
      else if (item === "mountReset") { setRoll({ mode: "mount", won: r.mount.pair, old: r.old }); setRolled(`Mount reset: now ${mountText(r.mount)}. ${NOT_ENTRY}`); }
      onBought(d.me);
    } catch (e) { if (forging) forge({ phase: "end", success: false }); const m = errorText(e, "That didn't go through. Try again."); setError(m); setFlash({ text: m, error: true, at: Date.now() }); onChanged(); }
    finally { setBusy(""); }
  };

  const used = me ? Object.values(me.ups || {}).reduce((a, b) => a + b, 0) : 0;
  const mt = me && me.mount;

  return (
    <>
      <div className="min-w-0 space-y-4">
        <Header t={t} sn={sn} crowd={crowd}>
          <p className="mt-3 text-sm text-mist">Double elimination, seeded by strength: you're out after two losses. When the bracket is drawn there are {t.predict_minutes ? `${t.predict_minutes} minutes` : "no minutes"} to predict it{(data.pot || []).length ? <>: a perfect bracket wins <b className="text-gold">{data.pot.map((x) => x.label).join(" + ")}</b></> : ""}.</p>
        </Header>
        <ArenaStage spec={spec} clock={stageClock} showLog={false} crowd={myFighter ? null : crowd} chip={myFighter ? null : { text: "Sign-up open" }}
          overlay={me ? <LabRails me={me} costs={costs} values={values} busy={busy} buy={buy} flash={flash} used={used} over={over} /> : null} />

        <Panel title="Your fighter">
          {!me ? (
            <div className="space-y-3">
              <p className="text-sm">Joining ({fmt(costs.join)} points) gives you a fighter: one of the guild's characters, picked at random. You get one free re-roll, and it never gives you the same one back. Then make it stronger with random stats ({fmt(costs.roll)} points each, in packs of {ROLL_PACKS.join(", ")}), skills and gear.</p>
              {cap > 0 && <p className="text-sm text-[#f1d38c]">Spending limit in this tournament: {fmt(cap)} points per member, for everything bought for your fighter (bets on matches aren't counted).</p>}
              <button type="button" onClick={() => buy("join", 1)} disabled={!!busy || balance < costs.join || over(costs.join)} className="btn-seal h-11 px-5">{busy === "join1" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Join the tournament · ${fmt(costs.join)} pts`}</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-10 w-10 rounded-full border-2 border-gold" style={{ background: `radial-gradient(circle at 35% 35%, #fff8, ${lookColor(me.look)} 60%, #000 120%)` }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-lg font-bold">{lookTitle(me.look)}</p>
                  <p className="text-xs text-mist">{used}/{TOTAL_CAP} random stats · total spent {fmt(me.spent)}{cap ? ` of ${fmt(cap)}` : ""} pts</p>
                  {cap > 0 && (
                    <div className="mt-1 max-w-xs" aria-label={`Spending limit: ${fmt(me.spent || 0)} of ${fmt(cap)} points used`}>
                      <div className="h-1.5 overflow-hidden rounded-sm bg-white/10"><div className={cn("h-full", capLeft <= 0 ? "bg-ember" : "bg-[#d4a72c]")} style={{ width: `${Math.min(100, ((me.spent || 0) / cap) * 100)}%` }} /></div>
                      <p className="mt-0.5 text-[11px] text-mist">{capLeft > 0 ? `${fmt(capLeft)} points left to spend in this tournament` : "Spending limit reached for this tournament"}</p>
                    </div>
                  )}
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
                {ROLL_PACKS.map((n) => (
                  <B key={n} busy={busy} id={`roll${n}`} onClick={() => buy("roll", n)} disabled={used + n > TOTAL_CAP || over(costs.roll * n)}>
                    <b>{fmt(costs.roll * n)} points for {n === 1 ? "a random stat" : `${n} random stats`}</b>
                    <span className="text-xs text-mist">{used + n > TOTAL_CAP ? `Room for ${TOTAL_CAP - used} more` : n === 1 ? `One random stat (up to ${PER_STAT} per stat, ${TOTAL_CAP} in all); raises your halo` : `${n} random stats at once, ${fmt(costs.roll)} each`}</span>
                  </B>
                ))}
                <B busy={busy} id="skill1" onClick={() => buy("skill")} disabled={me.skills.length >= MAX_SKILLS || over(costs.skill)}>
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
                  <B2 busy={busy} id="weapon1" onClick={() => buy("weapon")} disabled={me.weapon >= WEAPON.max || over(costs.weaponTry)}>{me.weapon >= WEAPON.max ? `Weapon +${WEAPON.max} (max)` : `Try upgrade · ${fmt(costs.weaponTry)} pts · ${Math.round(values.weapon.chance * 100)}% success rate`}</B2>
                  {me.weapon < WEAPON.max && <span className="text-xs text-mist">Next: +{me.weapon + 1} · {WEAPON.looks[me.weapon].name} aura</span>}
                  {me.weapon < WEAPON.max && <span className="w-full text-xs text-[#f1d38c]">{weaponNote(Math.round(values.weapon.chance * 100))}</span>}
                </GearRow>
                <GearRow icon="/arena/icons/pet.jpg" color="#c9a2ff" title={`${PET.name} · Growth ${petGrowth(me.pet)}%`}
                  text={me.pet ? `HP +${fmt(petBonus(me.pet, "hp"))} · ATK +${fmt(petBonus(me.pet, "atk"))} · DEF +${fmt(petBonus(me.pet, "def"))}. Each 25% of growth adds an eighth of the full 200% bonus.` : "No pet yet. Each 25% of growth adds an eighth of the full 200% bonus."}
                  lv={me.pet} max={PET.levels}>
                  <B2 busy={busy} id="pet1" onClick={() => buy("pet")} disabled={me.pet >= PET.levels || over(costs.pet)}>{me.pet >= PET.levels ? "Pet at 200% growth" : `${me.pet ? "Grow to" : "Buy at"} ${petGrowth(me.pet + 1)}% growth · ${fmt(costs.pet)} pts`}</B2>
                  {me.pet < PET.levels && <span className="text-xs text-mist">Next: HP +{fmt(petBonus(me.pet + 1, "hp") - petBonus(me.pet, "hp"))} · ATK +{fmt(petBonus(me.pet + 1, "atk") - petBonus(me.pet, "atk"))} · DEF +{fmt(petBonus(me.pet + 1, "def") - petBonus(me.pet, "def"))}</span>}
                </GearRow>
                <GearRow icon="/arena/icons/mount.jpg" color="#7fc3ff" title={`Mount · ${mt ? `level ${mt.lv} · ${mountText(mt)}` : "none yet"}`}
                  text={`The first level draws two stats at random; every level after adds ${MOUNT.per}% more to the same two.`}
                  lv={mt ? mt.lv : 0} max={MOUNT.levels}>
                  <B2 busy={busy} id="mount1" onClick={() => buy("mount")} disabled={(mt && mt.lv >= MOUNT.levels) || over(costs.mountLevel)}>{!mt ? `Buy mount (draws 2 stats) · ${fmt(costs.mountLevel)} pts` : mt.lv >= MOUNT.levels ? `Mount at level ${MOUNT.levels} (max)` : `Level up to ${mt.lv + 1} (+${(mt.lv + 1) * MOUNT.per}% each) · ${fmt(costs.mountLevel)} pts`}</B2>
                  <B2 busy={busy} id="mountReset1" onClick={() => buy("mountReset")} disabled={!mt || over(costs.mountReset)} quiet>Reset stats · {fmt(costs.mountReset)} pts</B2>
                  {mt && <span className="w-full text-xs text-[#f1d38c]">A reset doesn't give a random stat, but its points count toward your total spent.</span>}
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
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mist"><th className="px-3 py-1.5">Fighter</th><th>Weapon</th><th>Skills</th><th className="text-right">Random stats</th><th className="text-right">Pet</th><th className="text-right">Mount</th><th className="px-3 text-right">Total spent</th></tr></thead>
                <tbody className="divide-y divide-bronze/25">
                  {data.entrants.map((x) => {
                    const W = x.weapon ? WEAPON.looks[x.weapon - 1] : null;
                    return (
                      <tr key={x.member_id} className={x.member_id === member.id ? "bg-gold/10" : ""}>
                        <td className="px-3 py-1.5"><span className="flex items-center gap-2"><Avatar url={x.avatar} name={x.name} size={22} /><span className="h-2 w-2 rounded-full" style={{ background: lookColor(x.look) }} aria-hidden="true" /><span className="truncate">{x.name}{x.member_id === member.id ? " (you)" : ""}</span>{data.titles && data.titles[x.member_id] && <TitleTag text={data.titles[x.member_id]} />}</span></td>
                        <td style={W ? { color: hex(W.color) } : undefined}>{W ? `+${x.weapon} ${W.name}` : "—"}</td>
                        <td><SkillIcons skills={x.skills} size={20} /></td>
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
        <ArenaRules mode="tour" costs={costs} values={values} maxSpend={t.max_spend || 0} />
      </div>
      <div className="min-w-0 space-y-4">
        {myFighter && <FighterCard f={myFighter} values={values} side="You" />}
        {leaderPanel}
      </div>
      <ConfirmChange confirm={confirm} me={me} costs={costs} balance={balance} onCancel={() => setConfirm(null)} onConfirm={(item) => { setConfirm(null); doBuy(item); }} />
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
  const real = ms.filter((m) => !m.skipped);   // 6.22: a grand final reset that wasn't needed is never on screen
  const cur = real.find((m) => m.open_at && sn >= Date.parse(m.open_at) && (!m.end_at || sn < Date.parse(m.end_at) + RESULT_MS))
    || real.find((m) => m.open_at && sn < Date.parse(m.open_at)) || real.find((m) => !m.outcome) || real[real.length - 1];
  const known = cur && cur.a != null && cur.b != null;
  const fa = known ? field[cur.a] : null, fb = known ? field[cur.b] : null;
  const seed = cur ? cur.seed : null;
  const fight = useMemo(() => {
    if (!fa || !fb) return null;
    return seed != null ? simulate(fa, fb, seed, { draws: false, values }) : simulate(fa, fb, 1, { draws: false, ot: false, limit: 0.2, values });
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
              {cur.stage} · match {cur.no} of {real.length}: {known ? `${fa.name} vs ${fb.name}` : `${refName(cur.refs[0])} vs ${refName(cur.refs[1])}`}
            </p>
            <p className="text-sm text-mist">
              {status === "waiting" && (cur.open_at ? `Betting opens in ${countdown(Date.parse(cur.open_at) - sn)}` : "Betting opens after the match before it")}
              {status === "betting" && `Betting closes in ${Math.max(0, Math.ceil((Date.parse(cur.close_at) - sn) / 1000))} s`}
              {status === "fighting" && "Fight in progress"}
              {status === "done" && `${nameOf(cur.winner)} wins ${outcome.how === "ko" ? (outcome.ot ? "by KO in overtime" : "by KO") : "on HP left after overtime"} in ${outcome.length.toFixed(1)} s`}
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
        {t.format === "double"
          ? <Panel title="Bracket"><DoubleBracket t={t} field={field} sn={sn} curNo={cur ? cur.no : 0} memberId={member.id} watching={replay ? replay.no : 0} myPicks={data.my_prediction ? data.my_prediction.picks : null} onWatch={(m) => { setReplay({ no: m.no, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></Panel>
          : <Bracket t={t} field={field} sn={sn} curNo={cur ? cur.no : 0} memberId={member.id} watching={replay ? replay.no : 0} onWatch={(m) => { setReplay({ no: m.no, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      </div>
      <div className="min-w-0 space-y-4">
        {wide && slip}
        {t.format === "double" && <MyPrediction t={t} mine={data.my_prediction} sn={sn} />}
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
  return { key: `tour-replay-${t.id}-${m.no}-${started}`, a, b, values, fight: simulate(a, b, m.seed, { draws: false, values }), label: `BLACKLIST INTROBOYS · ${t.title} · ${m.bronze ? "Third place" : m.stage === "Final" || t.format === "double" ? m.stage : `Match ${m.no}`}: ${a.name} vs ${b.name}`, fileName: `${t.title}-match-${m.no}-${a.name}-vs-${b.name}` };
}
// The bracket as a real tree: one column per round, every match sitting between the two it comes from,
// lines that light up gold along the path of each winner, byes shown where a fighter skipped round 1,
// the champion at the end and the match for third place under the final. It scrolls sideways on a phone
// and brings the match on now into view.
const BK = { cw: 216, gap: 44, row: 92, bye: 40, head: 30 };
function matchState(m, sn) {
  return !m.open_at || sn < Date.parse(m.open_at) ? "waiting" : sn < Date.parse(m.close_at) ? "betting" : m.outcome ? "done" : "fighting";
}
function bracketLayout(ms) {
  const byNo = new Map(ms.map((m) => [m.no, m]));
  const main = ms.filter((m) => !m.bronze), bronze = ms.find((m) => m.bronze) || null;
  const final = main.reduce((a, m) => (!a || m.no > a.no ? m : a), null);
  const nodes = [], edges = [];
  let leaves = 0;
  const placeMatch = (m) => {
    let y;
    const kids = m.round > 1 ? m.refs.map((r) => {
      if (r.w !== undefined && byNo.get(r.w)) return { y: placeMatch(byNo.get(r.w)), from: r.w };
      const by = leaves++;
      nodes.push({ kind: "bye", s: r.s, col: m.round - 1, y: by, key: `bye-${m.no}-${r.s}` });
      return { y: by, bye: r.s };
    }) : null;
    if (!kids) y = leaves++;
    else { y = (kids[0].y + kids[1].y) / 2; kids.forEach((k, i) => edges.push({ from: k.from, bye: k.bye, fromY: k.y, fromCol: m.round - 1, to: m.no, toY: y, toCol: m.round, slot: i })); }
    nodes.push({ kind: "match", m, col: m.round, y, key: `m-${m.no}` });
    return y;
  };
  if (final) placeMatch(final);
  const cols = final ? final.round : 1;
  return { nodes, edges, leaves: Math.max(1, leaves), cols, final, bronze };
}
function Bracket({ t, field, sn, curNo, memberId, watching, onWatch }) {
  const ms = t.matches || [];
  const refName = refNameOf(field);
  const L = useMemo(() => bracketLayout(ms), [ms]);
  // a match fought by an older fight engine can't be replayed faithfully by this page
  const watchable = !!onWatch && (t.engine || ENGINE_VERSION) === ENGINE_VERSION;
  const scroller = useRef(null);
  const focusNo = curNo || watching || 0;
  const X = (c) => (c - 1) * (BK.cw + BK.gap), Y = (y) => BK.head + 40 + y * BK.row;
  const championCol = L.cols + 1;
  const width = X(championCol) + BK.cw;
  const height = BK.head + 40 + (L.leaves - 1) * BK.row + (L.bronze ? BK.row + 80 : 44);
  const finalDone = L.final && matchState(L.final, sn) === "done";
  const champ = finalDone ? field[L.final.winner] : null;
  const mineIdx = field.findIndex((f) => f.member_id === memberId);
  const stageOf = (c) => { const m = ms.find((x) => x.round === c && !x.bronze); return m ? m.stage : c < L.cols ? "" : "Final"; };
  // bring the live match (or the one being re-watched) into view, once per match
  // a finished tournament opens on the final and the champion
  useEffect(() => {
    const box = scroller.current;
    if (box && finalDone && !focusNo) box.scrollLeft = box.scrollWidth;
  }, [finalDone, focusNo]);
  useEffect(() => {
    const box = scroller.current;
    if (!box || !focusNo) return;
    const el = box.querySelector(`[data-match="${focusNo}"]`);
    if (el) box.scrollTo({ left: Math.max(0, el.offsetLeft - box.clientWidth / 2 + BK.cw / 2), behavior: "smooth" });
  }, [focusNo]);
  const doneWinnerOf = (no) => { const m = ms.find((x) => x.no === no); return m && matchState(m, sn) === "done" ? m.winner : null; };
  const card = (m, x, y) => {
    const st = matchState(m, sn), live = st === "fighting" || st === "betting";
    const side = (k) => {
      const i = k ? m.b : m.a, ref = m.refs[k];
      const name = i != null ? field[i].name : refName(ref);
      const win = st === "done" && m.winner === i, lose = st === "done" && m.winner !== i;
      const mine = i != null && i === mineIdx;
      return (
        <div className={cn("bk-side", k && "b", win && "win", lose && "lose", mine && "mine")}>
          {i != null ? <span className="dot" style={{ background: lookColor(field[i].look) }} aria-hidden="true" /> : <span className="dot empty" aria-hidden="true" />}
          <span className={cn("nm", i == null && "tbd")}>{name}{mine ? " (you)" : ""}</span>
          {m.odds && i != null && st !== "done" && <span className="px">{fmtPrice(k ? m.odds.b : m.odds.a)}</span>}
          {win && <Trophy className="h-3.5 w-3.5 shrink-0" aria-label="winner" />}
        </div>
      );
    };
    const status = st === "waiting" ? (m.open_at ? new Date(Date.parse(m.open_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Later") : st === "betting" ? "Bets open" : st === "fighting" ? "Live" : m.outcome.how === "ko" ? (m.outcome.ot ? "KO · OT" : "KO") : "OT · HP";
    return (
      <div key={m.no} data-match={m.no} className={cn("bk-card", live && "live", (curNo === m.no || watching === m.no) && "focus", m.bronze && "bronze")} style={{ left: x, top: y - 32, width: BK.cw }}>
        <div className="bk-head">
          <span>{m.bronze ? "Third place" : m === L.final ? "Final" : `Match ${m.no}`}</span>
          <span className="flex items-center gap-1.5">
            <span className={cn("st", st)}>{st === "fighting" && <i className="pulse" aria-hidden="true" />}{status}</span>
            {st === "done" && m.seed != null && watchable && (
              <button type="button" onClick={() => onWatch(m)} className="bk-watch" aria-label={`Watch match ${m.no} again`}><History className="h-3 w-3" /> Watch</button>
            )}
          </span>
        </div>
        {side(0)}{side(1)}
      </div>
    );
  };
  return (
    <Panel title="Bracket">
      <div className="-mt-1 mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-mist">
        <span>{field.length} fighters · {ms.length} matches.{watchable ? " Tap Watch on a finished match to see it again or download it." : ""}</span>
        <span className="flex items-center gap-3"><span className="flex items-center gap-1"><i className="bk-key gold" />winner's path</span><span className="flex items-center gap-1"><i className="bk-key live" />on now</span></span>
      </div>
      <div ref={scroller} className="bk-scroll" role="region" aria-label="Tournament bracket" tabIndex={0}>
        <div className="bk-board" style={{ width, height }}>
          {Array.from({ length: L.cols }, (_, c) => (
            <div key={c} className="bk-col-head" style={{ left: X(c + 1), width: BK.cw }}>{stageOf(c + 1) || (c === 0 ? "Round 1" : `Round ${c + 1}`)}</div>
          ))}
          <div className="bk-col-head" style={{ left: X(championCol), width: BK.cw }}>Champion</div>
          <svg className="bk-lines" width={width} height={height} aria-hidden="true">
            {L.edges.map((e) => {
              const x1 = X(e.fromCol) + BK.cw, y1 = Y(e.fromY) + (e.bye != null ? -12 : 0), x2 = X(e.toCol), y2 = Y(e.toY) + (e.slot ? 21 : -1), mx = x1 + BK.gap / 2;
              const w = e.bye != null ? e.bye : doneWinnerOf(e.from);
              const lit = w != null && w !== undefined;
              return <path key={`${e.to}-${e.slot}`} d={`M${x1} ${y1} H${mx} V${y2} H${x2}`} className={cn("bk-line", lit && "lit")} />;
            })}
            {L.final && <path d={`M${X(L.cols) + BK.cw} ${Y(L.final ? L.nodes.find((n) => n.m === L.final).y : 0)} H${X(championCol)}`} className={cn("bk-line", finalDone && "lit")} />}
          </svg>
          {L.nodes.map((n) => n.kind === "bye" ? (
            <div key={n.key} className={cn("bk-bye", n.s === mineIdx && "mine")} style={{ left: X(n.col), top: Y(n.y) - 26, width: BK.cw }}>
              <span className="dot" style={{ background: lookColor(field[n.s].look) }} aria-hidden="true" />
              <span className="nm">{field[n.s].name}{n.s === mineIdx ? " (you)" : ""}</span>
              <span className="tag">bye</span>
            </div>
          ) : card(n.m, X(n.col), Y(n.y)))}
          {L.final && (
            <div className={cn("bk-champ", champ && "won")} style={{ left: X(championCol), top: Y(L.nodes.find((n) => n.m === L.final).y) - 34, width: BK.cw }}>
              <Trophy className="h-5 w-5 shrink-0" aria-hidden="true" />
              {champ ? <><span className="dot" style={{ background: lookColor(champ.look) }} aria-hidden="true" /><span className="nm">{champ.name}{champ.member_id === memberId ? " (you)" : ""}</span></> : <span className="nm tbd">Winner of the final</span>}
            </div>
          )}
          {L.bronze && card(L.bronze, X(L.cols), Y(L.leaves - 1) + BK.row + 40)}
        </div>
      </div>
    </Panel>
  );
}

// ---------- the last tournament's result ----------
function LastTournament({ t, member, sn, leader }) {
  const field = useMemo(() => (t.field || []).map((x) => asFighter(x)), [t.id]);  
  const values = normValues(t.values);
  const [replay, setReplay] = useState(null);
  const replaySpec = useMemo(() => (replay ? replaySpecOf(t, field, (t.matches || []).find((m) => m.no === replay.no), values, replay.started) : null), [replay]);  
  const finalNo = ((t.matches || []).filter((m) => !m.skipped && m.outcome).pop() || { no: 0 }).no;
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
      <PredictionResult t={t} />
      {replaySpec && <ReplayStage key={replaySpec.key} spec={replaySpec} onVideo={leader && finalNo === replay.no ? (blob, ext) => sendFinalVideo(t.id, blob, ext) : undefined} videoLabel="Send the final to Discord" />}
      {leader && finalNo > 0 && !replaySpec && (t.engine || ENGINE_VERSION) === ENGINE_VERSION && (
        <Panel title="The final on Discord">
          <p className="text-sm text-mist">Every match's result went to Discord with a link to watch it. For the final you can also send a video: open it here, then press <b className="text-white">Send the final to Discord</b>. It plays once at normal speed while it records (keep this tab open), then posts it.</p>
          <button type="button" onClick={() => { setReplay({ no: finalNo, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="btn-seal mt-3 h-10 px-4 text-sm">Open the final</button>
        </Panel>
      )}
      {(t.matches || []).length > 0 && t.format === "double" && <Panel title="Bracket"><DoubleBracket t={t} field={field} sn={sn} memberId={member.id} watching={replay ? replay.no : 0} onWatch={(m) => { setReplay({ no: m.no, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></Panel>}
      {(t.matches || []).length > 0 && t.format !== "double" && <Bracket t={t} field={field} sn={sn} curNo={0} memberId={member.id} watching={replay ? replay.no : 0} onWatch={(m) => { setReplay({ no: m.no, started: Date.now() }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </div>
  );
}
