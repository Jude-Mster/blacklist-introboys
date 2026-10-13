import React from "react";
import {
  BASE, UPGRADES, PER_STAT, TOTAL_CAP, SKILLS, MAX_SKILLS, WEAPON, PET, MOUNT, STAT_NAME, LIMIT, OT, DRAW_REFUND, DEFAULT_EDGES, COSTS, PRACTICE_FIGHTS, normValues, petGrowth
} from "@/lib/arenaEngine";

// How the arena works, written from the same numbers the fights use (the preview's rules, made live).
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const B = ({ children }) => <b className="text-[hsl(var(--foreground))]">{children}</b>;
const AURA = {
  shield: "a pale blue bubble", blow: "a red orb spirals round the fighter", spirits: "pale blue wind spirals up the body", blood: "the blade bursts into flame",
  garuda: "a lilac prayer circle turns under the feet", nirvana: "purple lightning crackles round the body", bullet: "a green barrier flashes up"
};

export default function ArenaRules({ mode = "live", values, costs = COSTS, betSeconds = 15, limit = 5000, minBet = 1, maxSpend = 0 }) {
  const V = normValues(values);
  const E = DEFAULT_EDGES;
  const Rule = ({ title, children }) => (
    <div className="border-l-2 border-bronze/40 pl-3">
      <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">{title}</h3>
      <div className="mt-0.5 space-y-1 text-[13px] text-mist">{children}</div>
    </div>
  );
  return (
    <details className="rounded border border-bronze/30 bg-black/30 px-3 py-2">
      <summary className="cursor-pointer text-sm text-gold">{mode === "live" ? "How the Live Arena works" : "How tournaments work"}</summary>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mode === "live" ? (
          <>
            <Rule title="The Live Arena">
              <p>A new fight about every minute: two members of the site picked at random, each with a random build matched to the other (entries, weapon, buff skills, pet and mount). Betting is open for {betSeconds} seconds, then the fight is fought: the server picks its dice the moment betting closes (nothing is decided before), and every screen plays that same fight.</p>
            </Rule>
            <Rule title="Betting">
              <p>Bet {fmt(minBet)} to {fmt(limit)} on one fight. Back one fighter, a Draw, and any side bets. You can't back <B>both fighters</B> or <B>both over and under</B> the same line on the same fight. Bets can be taken back until betting closes.</p>
              <p>Side bets: ends without a critical; over or under the potions drunk, the critical hits, and how long the fight lasts (in seconds).</p>
              <p>Prices come from {fmt(PRACTICE_FIGHTS)} practice fights between these two exact fighters (every stat, upgrade, weapon level, skill, pet and mount), fought exactly like the real one, priced cautiously and with a house edge on every bet. The two fighters are matched to be close in strength (similar entries, and neither wins much more than about 70% of practice fights).</p>
              <p>The price is what you get back per point, your stake included: 100 at 1.80× returns 180. Fighters pay at most {E.maxPrice}× and side bets at most {E.maxSide}×: a long shot whose fair price would be higher isn't offered at all. Side bets that come up less than {Math.round(E.minP * 100)}% or more than {Math.round(E.maxP * 100)}% of the time in that matchup aren't offered.</p>
            </Rule>
            <Rule title="Draw">
              <p>There is no Draw bet: both fighters attack at the same time, so a fight practically always ends in a knockout well inside the {LIMIT} seconds. If one ever reaches {LIMIT} seconds it is a Draw, and bets on either fighter get {Math.round(DRAW_REFUND * 100)}% of the stake back (prices allow for that).</p>
            </Rule>
          </>
        ) : (
          <>
            <Rule title="Sign-up">
              <p>Your first entry ({fmt(costs.entry)} points) gives you a fighter: one of the guild's 50 characters at random. One free re-roll, never the same one back. Fighters are removed when the tournament ends. Every point paid goes into the Arena bank; no refunds once paid, unless only one fighter signs up or the Guild Leader cancels with refunds.{maxSpend > 0 ? ` In this tournament each member can spend up to ${fmt(maxSpend)} points on their fighter (bets on matches aren't counted).` : ""}</p>
            </Rule>
            <Rule title="The bracket">
              <p>Drawn at random at the start, with byes when the number of fighters isn't a power of two. 2 fighters play a single 1v1; 1 fighter cancels and refunds. The semi-final losers fight for 3rd place. Every match is live: 10 seconds of betting, the fight, the result. No knockout at the {LIMIT}-second limit means <b>overtime</b>: sudden death with no potions, where every hit does ×{OT.start} damage, rising by one every {OT.every} seconds. If neither fighter is down after {OT.max} seconds of overtime (practically never), the larger share of HP left wins. Anyone can bet, fighters included, but never on both fighters or both sides of a side bet.</p>
            </Rule>
          </>
        )}
        <Rule title="Base fighter">
          <p>Everyone starts the same: HP {fmt(BASE.hp)} · ATK {fmt(BASE.atk)} · DEF {fmt(BASE.def)} · Crit rate {BASE.crit}% · Crit defense {BASE.critdef}% · Accuracy {BASE.acc}% · Evasion {BASE.eva}% · Speed {BASE.spd}% · {BASE.pots} HP potions that heal {BASE.potheal}%.</p>
        </Rule>
        <Rule title="Entry upgrades">
          <p>Each entry after the first rolls one: {UPGRADES.map((u) => `${u.name} +${fmt(V.ups[u.id])}${u.unit}`).join(" · ")}. Crit rate comes up 1 roll in 15, Crit defense 1 in 9, the others about 1 in 8.5 each. Potions always heal 100% (there is no Potion heal upgrade). Up to {PER_STAT} per stat and {TOTAL_CAP} in all; entries after that still raise the halo.</p>
        </Rule>
        <Rule title="Weapon upgrade">
          <p>{fmt(costs.weaponTry)} points per try, {Math.round(V.weapon.chance * 100)}% success rate. A failed try is not credited as an entry, but its points count toward the fighter's total spent. Each level adds {Math.round(V.weapon.atk * 100)}% ATK and {V.weapon.crit}% Crit rate and lights the weapon: {WEAPON.looks.map((l) => l.name.toLowerCase()).join(", ")}. Up to +{WEAPON.max}.</p>
        </Rule>
        <Rule title="Buff skills">
          <p>Add skill ({fmt(costs.skill)} points) teaches one at random that the fighter doesn't have, up to {MAX_SKILLS}. Every skill off cooldown rolls its chance before each of the fighter's attacks; all that come up are cast and stack.</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {Object.entries(SKILLS).map(([id, k]) => <li key={id}><B>{k.name}</B> · {k.passive ? "passive" : `${Math.round(k.chance * 100)}% chance to cast`} · {k.text} · {AURA[id]}</li>)}
          </ul>
        </Rule>
        <Rule title="Pet and mount">
          <p>{PET.name}: {fmt(costs.pet)} points per 25% of growth, up to {petGrowth(PET.levels)}%. At 200%: HP +{fmt(PET.full.hp)}, ATK +{fmt(PET.full.atk)}, DEF +{fmt(PET.full.def)}.</p>
          <p>Mount: {fmt(costs.mountLevel)} points per level, up to {MOUNT.levels}. The first level draws one pair ({MOUNT.pairs.map((p) => p.map((id) => STAT_NAME[id]).join(" & ")).join(", ")}); each level adds {MOUNT.per}% to both. A reset ({fmt(costs.mountReset)} points) draws a new pair and keeps the level; it is not credited as an entry, but its points count toward the total spent. The site asks you to confirm first.</p>
        </Rule>
        <Rule title="Combat">
          <p><B>Skyfall</B> (the 360° slash) lands with Accuracy − the target's Evasion. <B>Crimson LightningCharger</B>, the buff every fighter casts before each Skyfall, charges it for 1× to 2× damage (it costs MP but isn't counted in the buff side bets). MP only goes down when a skill or buff is cast. A <B>critical</B> (chance = Crit rate, at most 60%) does 2× to 10×: 2× to 7× are the usual rolls (15% each), while the big ones are rare (8× 5%, 9× 3%, 10× 2%). That is less the target's <B>Crit defense</B>: each % of Crit defense takes 1% off the critical's damage (up to 80%). An <B>HP potion</B> is drunk at the start of the fighter's next attack after a hit leaves them at 85% HP or less. Both fighters attack at the same time, each at their own pace: nobody waits for a turn. <B>Speed</B> sets that pace: a faster fighter casts, charges and swings quicker, so it attacks more often (up to about twice as often at 182% Speed). Spirits Within adds {Math.round(SKILLS.spirits.spd * 100)}% Speed from the moment it is cast.</p>
        </Rule>
        <Rule title="Halo">
          <p>The ring of light over a fighter's head: one level per entry, and its look changes every 8 levels. It is for show only.</p>
        </Rule>
      </div>
    </details>
  );
}