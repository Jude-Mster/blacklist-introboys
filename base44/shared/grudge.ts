// 6.22 Grudge matches: one member challenges another to a 1-on-1 fight.
//
//   * Both fighters get a fresh random build of the same size (the challenger picks 10, 25 or 50 random
//     stats); the weapon level, pet level, mount level and number of skills are the same on both sides,
//     only which stats and skills come up is luck.
//   * Both put up the same stake. The challenger's is taken when the challenge is made, the opponent's when
//     they accept. The winner gets both stakes less a 5% cut, which goes to the Arena bank.
//   * A challenge not accepted within 24 hours expires and the challenger gets their stake back. The
//     opponent can decline, and the challenger can withdraw before it's accepted (stake back either way).
//   * Once accepted, the fight is open for everyone's bets for 60 seconds, then fought from a secret seed
//     picked when betting closes (like every arena fight), and paid when it ends.
import { changePoints, withMemberLock, withRecordLock, UserError, rankedMembers } from './points.ts';
import { ENGINE_VERSION, LOOK_KEYS, LIMIT, WEAPON, PET, MOUNT, MAX_SKILLS, SKILL_IDS, rollUpgrade, drawPair, simulate, outcomeOf, priceMatch } from './arenaEngine.ts';
import { postSystem, GUILD_CHANNEL } from './chat.ts';
import { announceGrudge, announceFightResult, replayLink } from './discordPost.ts';
import { memo, bust } from './memo.ts';

export const GRUDGE = { minStake: 100, maxStake: 50000, cut: 0.05, betSeconds: 60, intro: 3, expireMs: 24 * 3600000, sizes: [10, 25, 50], resultMs: 8000 };
const E = (b) => b.asServiceRole.entities;
const iso = (ms: number) => new Date(ms).toISOString();
const tms = (s) => Date.parse(s) || 0;
const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const secretSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
const lockMember = (b, id: string, fn) => withMemberLock(b, id, fn, 15000);
const lockGrudge = (b, id: string, fn, wait?: number) => withRecordLock(b, 'Grudge', id, fn, 30000, wait);
export const betKey = (id: string) => ({ scope: 'tour' as const, tour_id: `grudge:${id}`, match_no: 1 });

// Two builds of the same size: same number of random stats, same weapon, pet and mount levels and the
// same number of skills.
export function equalBuilds(size: number, r = rand) {
  const weapon = Math.floor(r() * (WEAPON.max + 1)), pet = r() < 0.4 ? 1 + Math.floor(r() * PET.levels) : 0;
  const mountLv = r() < 0.45 ? 1 + Math.floor(r() * MOUNT.levels) : 0, nSkills = Math.floor(r() * (MAX_SKILLS + 1));
  return [0, 1].map(() => {
    const ups = {};
    for (let k = 0; k < size; k++) rollUpgrade(ups, r);
    const pool = SKILL_IDS.slice(), skills = [];
    for (let j = 0; j < nSkills; j++) skills.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return { entries: size + 1, ups, weapon, skills, pet, mount: mountLv ? { lv: mountLv, pair: drawPair(r) } : null };
  });
}
const isFought = (g) => !!(g && g.seed != null && g.outcome && g.end_at);
export function grudgeStatus(g, now: number) {
  if (g.status !== 'running') return g.status;
  if (now < tms(g.close_at)) return 'betting';
  return !isFought(g) || now < tms(g.end_at) ? 'fighting' : 'result';
}
// What members may see: the seed and result only once betting has closed / the fight has ended.
export function publicGrudge(g, now: number, titles = {}) {
  const st = grudgeStatus(g, now), shown = st === 'fighting' || st === 'result' || st === 'done';
  return {
    id: g.id, status: g.status, phase: st, stake: g.stake, size: g.size, prize: g.prize || 0,
    challenger: { member_id: g.challenger_id, name: g.challenger_name, avatar: g.challenger_avatar || '', title: titles[g.challenger_id] || '' },
    opponent: { member_id: g.opponent_id, name: g.opponent_name, avatar: g.opponent_avatar || '', title: titles[g.opponent_id] || '' },
    message: g.message || '', created_at: g.created_date, expires_at: g.expires_at || null,
    fighters: g.builds ? g.builds.map((x, i) => ({ ...x, name: i ? g.opponent_name : g.challenger_name, look: g.looks[i], rank: titles[i ? g.opponent_id : g.challenger_id] || 'Grudge match' })) : null,
    odds: g.odds || null, open_at: g.open_at || null, close_at: g.close_at || null,
    seed: shown && isFought(g) ? g.seed : null, end_at: shown && isFought(g) ? g.end_at : null,
    outcome: (st === 'result' || st === 'done') ? g.outcome : null, winner: (st === 'result' || st === 'done') ? g.winner ?? null : null,
    engine: g.engine || ENGINE_VERSION
  };
}

// Move one grudge along (expire, fight, pay). Safe to call from any request; only one does the work.
export async function tickGrudge(b, g, bankMove) {
  const now = Date.now();
  const due = (g.status === 'open' && now >= tms(g.expires_at)) || (g.status === 'running' && (!isFought(g) ? now >= tms(g.close_at) : now >= tms(g.end_at)));
  if (!due) return g;
  try {
    return await lockGrudge(b, g.id, async () => {
      let cur = await E(b).Grudge.get(g.id);
      const t = Date.now();
      if (cur.status === 'open' && t >= tms(cur.expires_at)) {
        await lockMember(b, cur.challenger_id, () => changePoints(b, cur.challenger_id, cur.stake, 'arena', `Grudge match expired, stake back: vs ${cur.opponent_name}`, null));
        cur = await E(b).Grudge.update(cur.id, { status: 'expired', finished_at: iso(t) });
        await postSystem(b, GUILD_CHANNEL, `${cur.opponent_name} didn't answer ${cur.challenger_name}'s grudge challenge in time. The stake went back.`).catch(() => {});
        return cur;
      }
      if (cur.status === 'running' && !isFought(cur) && t >= tms(cur.close_at)) {
        const seed = secretSeed();
        const fa = { ...cur.builds[0], name: cur.challenger_name }, fb = { ...cur.builds[1], name: cur.opponent_name };
        const fight = simulate(fa, fb, seed, { draws: false, frames: false, limit: LIMIT });
        const o = outcomeOf(fight);
        cur = await E(b).Grudge.update(cur.id, { seed, outcome: o, winner: o.winner, end_at: iso(tms(cur.close_at) + Math.ceil((GRUDGE.intro + fight.length) * 1000)) });
      }
      if (cur.status === 'running' && isFought(cur) && Date.now() >= tms(cur.end_at)) {
        const pot = cur.stake * 2, prize = Math.floor(pot * (1 - GRUDGE.cut)), house = pot - prize;
        const winId = cur.winner === 0 ? cur.challenger_id : cur.opponent_id, winName = cur.winner === 0 ? cur.challenger_name : cur.opponent_name, loseName = cur.winner === 0 ? cur.opponent_name : cur.challenger_name;
        const reason = `Grudge match won vs ${loseName} [${cur.id}]`;
        if (!cur.paid) {
          let already = false;
          if (cur.pay_started) already = (await E(b).PointLog.filter({ member_id: winId, reason }, { limit: 1 })).items.length > 0;
          else cur = await E(b).Grudge.update(cur.id, { pay_started: true });
          if (!already) await lockMember(b, winId, () => changePoints(b, winId, prize, 'arena', reason, null));
          await bankMove(b, house, `Grudge match cut: ${cur.challenger_name} vs ${cur.opponent_name}`).catch((e) => console.error('grudge bank cut failed', e));
        }
        cur = await E(b).Grudge.update(cur.id, { status: 'done', paid: true, prize, finished_at: iso(Date.now()) });
        bust('hall:');
        const o = cur.outcome, how = o.how === 'ko' ? (o.ot ? 'by KO in overtime' : 'by KO') : 'on HP after overtime';
        await postSystem(b, GUILD_CHANNEL, `Grudge settled: ${winName} beat ${loseName} ${how} and takes ${fmt(prize)} points.`).catch(() => {});
        const price = cur.odds ? (cur.winner === 0 ? cur.odds.a : cur.odds.b) : 0;
        await announceFightResult({ title: 'Grudge match', stage: `Grudge match · ${fmt(cur.stake)} each`, a: cur.challenger_name, b: cur.opponent_name, winner: winName, how: o.how, ot: o.ot, length: o.length, price, watch: replayLink(`tab=grudge&grudge=${cur.id}`), note: `${winName} takes ${fmt(prize)} points.` }).catch(() => {});
      }
      return cur;
    }, 0);
  } catch (e) {
    if (e instanceof UserError && (e as any).busy) return g;
    throw e;
  }
}

// 6.23: two reads (open and running together, then the recent finished ones), shared for up to 8 s but
// read again the moment one of their times passes (betting closing, a fight ending, a challenge expiring)
async function list(b) {
  const [live, done] = await Promise.all([
    E(b).Grudge.filter({ status: { $in: ['open', 'running'] } }, { sort: '-created_date', limit: 60 }).catch(async () => {
      const [o, r] = await Promise.all(['open', 'running'].map((s) => E(b).Grudge.filter({ status: s }, { sort: '-created_date', limit: 40 })));
      return { items: [...o.items, ...r.items] };
    }),
    E(b).Grudge.filter({ status: 'done' }, { sort: '-created_date', limit: 12 })
  ]);
  return [...live.items.filter((g) => g.status === 'open'), ...live.items.filter((g) => g.status === 'running'), ...done.items];
}
const marksOf = (g) => (g.status === 'open' ? [g.expires_at] : g.status === 'running' ? [g.close_at, g.end_at] : []).map(tms).filter(Boolean);
const noMarkPassed = (rows, at) => { const now = Date.now(); return !rows.some((g) => marksOf(g).some((m) => m > at && m <= now)); };
export const sharedGrudges = (b) => memo('grudges:', 20000, () => list(b), (rows, at) => noMarkPassed(rows, at) && (Date.now() - at < 8000 || !rows.some((g) => g.status === 'running')));

// The member actions. Returns the JSON to send.
export async function grudgeAction(b, p, me, deps) {
  const { bankMove, titles, settings } = deps;
  const action = p.action;
  if (action === 'grudges') {
    let rows = await sharedGrudges(b);
    // the clock work for any grudge that needs it (also done by the Tournament Clock schedule)
    let moved = false;
    for (const g of rows) { const n = await tickGrudge(b, g, bankMove); if (n !== g) moved = true; }
    if (moved) { bust('grudges:'); bust('bets:'); rows = await sharedGrudges(b); }
    const now = Date.now();
    const out: any = { server_now: iso(now), rules: GRUDGE, grudges: rows.map((g) => publicGrudge(g, now, titles)) };
    if (p.members) {
      const ms = await rankedMembers(b, 200, ['discord_name', 'discord_id', 'avatar_url', 'role']);
      out.members = ms.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.discord_name || m.discord_id, avatar: m.avatar_url || '' }));
    }
    return out;
  }
  if (me.banned) throw new UserError('You are banned from the games.', 403);
  if (action === 'challenge') {
    const stake = Number(p.stake), size = Number(p.size);
    if (!Number.isInteger(stake) || stake < GRUDGE.minStake || stake > GRUDGE.maxStake) throw new UserError(`The stake must be a whole number from ${fmt(GRUDGE.minStake)} to ${fmt(GRUDGE.maxStake)} points.`);
    if (!GRUDGE.sizes.includes(size)) throw new UserError('Pick 10, 25 or 50 random stats.');
    const opp = await E(b).Member.get(String(p.opponent || '')).catch(() => null);
    if (!opp || opp.id === me.id) throw new UserError('Pick someone else to challenge.');
    if (opp.banned) throw new UserError("That member can't play right now.");
    const message = String(p.message || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return lockMember(b, me.id, async () => {
      const { items } = await E(b).Grudge.filter({ challenger_id: me.id, status: 'open' }, { limit: 20 });
      if (items.some((g) => g.opponent_id === opp.id)) throw new UserError(`You already have a challenge waiting for ${opp.discord_name || 'them'}.`);
      if (items.length >= 5) throw new UserError('You have 5 challenges waiting already. Wait for answers first.');
      let balance;
      try { ({ balance } = await changePoints(b, me.id, -stake, 'arena', `Grudge match stake: challenge to ${opp.discord_name || opp.discord_id}`, null)); }
      catch (e) { throw /not enough/i.test(String(e && e.message)) ? new UserError('Not enough points for that stake.') : e; }
      let g;
      try {
        g = await E(b).Grudge.create({
          status: 'open', challenger_id: me.id, challenger_name: String(me.discord_name || me.discord_id).slice(0, 32), challenger_avatar: me.avatar_url || '',
          opponent_id: opp.id, opponent_name: String(opp.discord_name || opp.discord_id).slice(0, 32), opponent_avatar: opp.avatar_url || '',
          stake, size, message, expires_at: iso(Date.now() + GRUDGE.expireMs), engine: ENGINE_VERSION
        });
      } catch (e) {
        await changePoints(b, me.id, stake, 'arena', 'Grudge match stake back: the challenge was not saved', null).catch(() => {});
        throw new UserError("The challenge couldn't be saved, so your stake was returned. Try again.");
      }
      const text = `${g.challenger_name} challenges ${g.opponent_name} to a grudge match! ${fmt(stake)} points each, ${size} random stats.${message ? ` "${message}"` : ''} ${g.opponent_name} has 24 hours to accept.`;
      await postSystem(b, GUILD_CHANNEL, text.slice(0, 300)).catch(() => {});
      await announceGrudge(`<@${opp.discord_id}> ${text}`.replace(/^<@>\s*/, ''), replayLink('tab=grudge')).catch(() => {});
      return { ok: true, balance, id: g.id };
    });
  }
  const g0 = await E(b).Grudge.get(String(p.id || '')).catch(() => null);
  if (!g0) throw new UserError('That grudge match is gone.');
  if (action === 'grudge_accept') {
    if (g0.opponent_id !== me.id) throw new UserError('Only the member who was challenged can accept.');
    return lockGrudge(b, g0.id, async () => {
      const g = await E(b).Grudge.get(g0.id);
      if (g.status !== 'open') throw new UserError('That challenge is no longer open.');
      if (Date.now() >= tms(g.expires_at)) throw new UserError('That challenge has expired.');
      const { balance } = await lockMember(b, me.id, async () => {
        try { return await changePoints(b, me.id, -g.stake, 'arena', `Grudge match stake: vs ${g.challenger_name}`, null); }
        catch (e) { throw /not enough/i.test(String(e && e.message)) ? new UserError(`You need ${fmt(g.stake)} points to accept.`) : e; }
      });
      const builds = equalBuilds(g.size);
      const pool = LOOK_KEYS.slice(), looks = [0, 1].map(() => pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      const odds = priceMatch({ ...builds[0], name: g.challenger_name }, { ...builds[1], name: g.opponent_name }, secretSeed(), { draws: false, limit: LIMIT });
      const open = Date.now();
      let row;
      try { row = await E(b).Grudge.update(g.id, { status: 'running', builds, looks, odds, open_at: iso(open), close_at: iso(open + GRUDGE.betSeconds * 1000), accepted_at: iso(open), engine: ENGINE_VERSION }); }
      catch (e) {
        await lockMember(b, me.id, () => changePoints(b, me.id, g.stake, 'arena', `Grudge match stake back: accepting failed (vs ${g.challenger_name})`, null)).catch(() => {});
        throw new UserError("Accepting didn't save, so your stake was returned. Try again.");
      }
      await postSystem(b, GUILD_CHANNEL, `${g.opponent_name} accepted ${g.challenger_name}'s grudge match! ${fmt(g.stake)} points each. Bets are open for ${GRUDGE.betSeconds} seconds on the Grudge tab.`).catch(() => {});
      await announceGrudge(`**${g.opponent_name}** accepted **${g.challenger_name}**'s grudge match: ${fmt(g.stake)} points each. Bets are open for ${GRUDGE.betSeconds} seconds.`, replayLink(`tab=grudge&grudge=${g.id}`)).catch(() => {});
      return { ok: true, balance, grudge: publicGrudge(row, Date.now(), titles) };
    });
  }
  if (action === 'grudge_decline' || action === 'grudge_cancel') {
    const decline = action === 'grudge_decline';
    if (decline ? g0.opponent_id !== me.id : g0.challenger_id !== me.id) throw new UserError(decline ? 'Only the member who was challenged can decline.' : 'Only the challenger can withdraw it.');
    return lockGrudge(b, g0.id, async () => {
      const g = await E(b).Grudge.get(g0.id);
      if (g.status !== 'open') throw new UserError('That challenge is no longer open.');
      await lockMember(b, g.challenger_id, () => changePoints(b, g.challenger_id, g.stake, 'arena', `Grudge match ${decline ? 'declined' : 'withdrawn'}, stake back: vs ${g.opponent_name}`, null));
      await E(b).Grudge.update(g.id, { status: decline ? 'declined' : 'cancelled', finished_at: iso(Date.now()) });
      if (decline) await postSystem(b, GUILD_CHANNEL, `${g.opponent_name} declined ${g.challenger_name}'s grudge match.`).catch(() => {});
      return { ok: true };
    });
  }
  throw new UserError('Unknown grudge action.');
}
