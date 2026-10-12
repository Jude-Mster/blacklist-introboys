// The Arena's crowd: how many members are watching, and the emojis they throw at the fighters.
// Screens ask with the "pulse" action every few seconds while the arena is open.
import { UserError } from './points.ts';
import { memo, bust } from './memo.ts';

export const EMOJIS = ['😂', '🤡', '💀', '🔥', '😤', '🐔', '🧂', '🍼', '😭', '🫵', '💩', '👑'];
const SEEN_MS = 90000;        // watching = seen in the last 90 s (6.17: screens say so every 45 s)
const KEEP_MS = 120000;       // reactions are kept two minutes
const SHOW_MS = 20000;        // a screen is sent the reactions of the last 20 seconds (screens ask every 12)
const GAP_MS = 1200;          // one emoji per member every 1.2 seconds

const E = (b) => b.asServiceRole.entities;
export const cleanScope = (v) => { const s = String(v || 'live'); return s === 'live' || /^tour:[A-Za-z0-9_-]{1,64}$/.test(s) ? s : 'live'; };

// 6.16: everyone watching a screen shares one read of the crowd (3 s), so the crowd costs about
// the same whether 3 or 30 are watching. Old rows are tidied only when that shared read is made.
const CROWD_MS = 8000; // 6.17: 8 s (emojis show within the 20 s window either way)
const crowdOf = (b, scope: string) => memo('crowd:' + scope, CROWD_MS, async () => {
  const now = Date.now();
  const [{ items: seen }, { items: recent }] = await Promise.all([
    E(b).ArenaPresence.filter({ scope }, { limit: 500 }),
    E(b).ArenaReaction.filter({ scope }, { sort: '-at', limit: 40 })
  ]);
  for (const x of seen.filter((x) => now - (x.seen || 0) > 10 * 60000).slice(0, 5)) E(b).ArenaPresence.delete(x.id).catch(() => {});
  for (const x of recent.filter((x) => now - (x.at || 0) > KEEP_MS).slice(0, 5)) E(b).ArenaReaction.delete(x.id).catch(() => {});
  return { seen, recent };
});

// here = true: count this member as watching (screens send it every ~45 s, not on every pulse).
export async function pulse(b, me, scope: string, here: boolean) {
  const crowd = await crowdOf(b, scope);
  if (here) {
    const now = Date.now();
    // the member's own row is in the shared read (no extra lookup); a new watcher gets one
    const own = crowd.seen.filter((x) => x.member_id === me.id);
    if (own[0]) {
      own[0].seen = now;
      await E(b).ArenaPresence.update(own[0].id, { seen: now }).catch(() => {});
      for (const x of own.slice(1)) E(b).ArenaPresence.delete(x.id).catch(() => {});
    } else {
      const row = await E(b).ArenaPresence.create({ scope, member_id: me.id, seen: now }).catch(() => null);
      if (row) crowd.seen.push(row);
    }
  }
  const now = Date.now();
  return {
    // members, not rows: several tabs pulsing at the same moment can leave a duplicate row for a while
    watching: new Set(crowd.seen.filter((x) => now - (x.seen || 0) < SEEN_MS).map((x) => x.member_id)).size,
    reactions: crowd.recent.filter((x) => now - (x.at || 0) < SHOW_MS).map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, side: x.side ?? -1, at: x.at, mine: x.member_id === me.id })),
    server_now: new Date(now).toISOString()
  };
}

const lastReact = new Map<string, number>();
export async function react(b, me, scope: string, emoji: string, side: number) {
  if (!EMOJIS.includes(emoji)) throw new UserError("That emoji isn't one of the arena's.");
  if (me.banned) throw new UserError('You are banned from the games.', 403);
  const now = Date.now();
  // 6.16: the one-emoji-at-a-time check is kept in memory (no database read per emoji)
  const last = lastReact.get(me.id) || 0;
  if (now - last < GAP_MS) throw new UserError('Easy! One emoji at a time.', 429);
  if (lastReact.size > 1000) lastReact.clear();
  lastReact.set(me.id, now);
  const row = await E(b).ArenaReaction.create({ scope, member_id: me.id, name: String(me.discord_name || me.discord_id).slice(0, 32), emoji, side: side === 0 || side === 1 ? side : -1, at: now });
  bust('crowd:' + scope);
  return { id: row.id, at: now };
}
