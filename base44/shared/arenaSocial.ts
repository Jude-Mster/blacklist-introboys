// The Arena's crowd: how many members are watching, and the emojis they throw at the fighters.
// Screens ask with the "pulse" action every few seconds while the arena is open.
import { UserError } from './points.ts';

export const EMOJIS = ['😂', '🤡', '💀', '🔥', '😤', '🐔', '🧂', '🍼', '😭', '🫵', '💩', '👑'];
const SEEN_MS = 60000;        // watching = seen in the last minute
const KEEP_MS = 120000;       // reactions are kept two minutes
const SHOW_MS = 15000;        // a screen is sent the reactions of the last 15 seconds
const GAP_MS = 1200;          // one emoji per member every 1.2 seconds

const E = (b) => b.asServiceRole.entities;
export const cleanScope = (v) => { const s = String(v || 'live'); return s === 'live' || /^tour:[A-Za-z0-9_-]{1,64}$/.test(s) ? s : 'live'; };

// here = true: count this member as watching (screens send it every ~20 s, not on every pulse).
export async function pulse(b, me, scope: string, here: boolean) {
  const now = Date.now();
  if (here) {
    const { items } = await E(b).ArenaPresence.filter({ scope, member_id: me.id }, { limit: 3 });
    if (items[0]) await E(b).ArenaPresence.update(items[0].id, { seen: now }).catch(() => {});
    else await E(b).ArenaPresence.create({ scope, member_id: me.id, seen: now }).catch(() => {});
    for (const x of items.slice(1)) E(b).ArenaPresence.delete(x.id).catch(() => {});
  }
  const [{ items: seen }, { items: recent }] = await Promise.all([
    E(b).ArenaPresence.filter({ scope }, { limit: 500 }),
    E(b).ArenaReaction.filter({ scope }, { sort: '-at', limit: 40 })
  ]);
  // tidy up a few old rows each time
  for (const x of seen.filter((x) => now - (x.seen || 0) > 10 * 60000).slice(0, 5)) E(b).ArenaPresence.delete(x.id).catch(() => {});
  for (const x of recent.filter((x) => now - (x.at || 0) > KEEP_MS).slice(0, 5)) E(b).ArenaReaction.delete(x.id).catch(() => {});
  return {
    watching: seen.filter((x) => now - (x.seen || 0) < SEEN_MS).length,
    reactions: recent.filter((x) => now - (x.at || 0) < SHOW_MS).map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, side: x.side ?? -1, at: x.at, mine: x.member_id === me.id })),
    server_now: new Date(now).toISOString()
  };
}

export async function react(b, me, scope: string, emoji: string, side: number) {
  if (!EMOJIS.includes(emoji)) throw new UserError("That emoji isn't one of the arena's.");
  if (me.banned) throw new UserError('You are banned from the games.', 403);
  const now = Date.now();
  const { items } = await E(b).ArenaReaction.filter({ scope, member_id: me.id }, { sort: '-at', limit: 1 });
  if (items[0] && now - (items[0].at || 0) < GAP_MS) throw new UserError('Easy! One emoji at a time.', 429);
  const row = await E(b).ArenaReaction.create({ scope, member_id: me.id, name: String(me.discord_name || me.discord_id).slice(0, 32), emoji, side: side === 0 || side === 1 ? side : -1, at: now });
  return { id: row.id, at: now };
}