import { UserError } from './points.ts';

// Quick emoji reactions at the card tables. They live for a few seconds on the table's
// own record ({ id, seat, emoji, at }), so showing them costs no extra reads: the
// table state every player already asks for carries them.
export const REACTIONS = ['money', 'thumbs', 'cry', 'sad', 'happy', 'laugh'];
const LIVE_MS = 6000;      // how long a reaction is handed out
const GAP_MS = 1500;       // one reaction per seat this often
const KEEP = 12;

export const liveReactions = (row) => {
  const now = Date.now();
  return (Array.isArray(row && row.reactions) ? row.reactions : [])
    .filter((r) => r && r.id && now - Number(r.at) < LIVE_MS)
    .map((r) => ({ id: r.id, seat: r.seat, emoji: r.emoji }));
};

// Only the `reactions` field is written, so this never needs the table's lock and
// can't disturb a hand in play. Two reactions landing together may lose one; that is fine.
export async function addReaction(entity, tableId: string, seat: number, emoji: unknown) {
  if (!REACTIONS.includes(String(emoji))) throw new UserError('Unknown reaction.');
  if (!(seat >= 0)) throw new UserError('Sit down at the table to react.');
  const row = await entity.get(tableId);
  const now = Date.now();
  const recent = (Array.isArray(row.reactions) ? row.reactions : []).filter((r) => r && r.id && now - Number(r.at) < LIVE_MS);
  if (recent.some((r) => r.seat === seat && now - Number(r.at) < GAP_MS)) throw new UserError('Slow down a little.', 429);
  const next = [...recent.slice(-(KEEP - 1)), { id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, seat, emoji: String(emoji), at: now }];
  await entity.update(tableId, { reactions: next });
  return liveReactions({ reactions: next });
}