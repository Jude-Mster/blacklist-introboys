// 6.22 Hall of Fame and titles, worked out from finished tournaments and grudge matches (nothing extra is
// stored). Shared for a minute by every request in this copy of the function.
import { memo } from './memo.ts';

const E = (b) => b.asServiceRole.entities;
const tms = (s) => Date.parse(s) || 0;

// The title a member wears for their tournament wins: the most recent champion is the Reigning Champion.
export function titleFor(wins: number, reigning: boolean) {
  if (reigning) return wins > 1 ? `Reigning Champion ×${wins}` : 'Reigning Champion';
  if (wins >= 2) return `${wins}× Champion`;
  if (wins === 1) return 'Champion';
  return '';
}

export async function computeHall(b) {
  const [{ items: tours }, { items: grudges }] = await Promise.all([
    E(b).Tournament.filter({ status: 'done' }, { sort: '-created_date', limit: 200 }),
    E(b).Grudge.filter({ status: 'done' }, { sort: '-created_date', limit: 500 }).catch(() => ({ items: [] }))
  ]);
  const people = new Map();
  const who = (id, name = '', avatar = '', look = '') => {
    if (!people.has(id)) people.set(id, { member_id: id, name, avatar, look, wins: 0, finals: 0, podiums: 0, match_wins: 0, match_losses: 0, best_streak: 0, streak: 0, grudge_wins: 0, grudge_losses: 0, grudge_won_points: 0, predictions_won: 0 });
    const p = people.get(id); if (name) p.name = name; if (avatar) p.avatar = avatar; if (look) p.look = look;
    return p;
  };
  const champions = [];
  let upset = null, biggestGrudge = null;
  const sorted = tours.slice().sort((x, y) => tms(x.finished_at || x.created_date) - tms(y.finished_at || y.created_date));
  for (const t of sorted) {
    const field = t.field || [];
    const results = (t.results || []).slice().sort((x, y) => x.place - y.place);
    for (const r of results) {
      const p = who(r.member_id, r.name, r.avatar, r.look);
      if (r.place === 1) p.wins++;
      if (r.place <= 2) p.finals++;
      if (r.place <= 3) p.podiums++;
    }
    for (const m of t.matches || []) {
      if (m.skipped || m.winner == null || m.loser == null || !field[m.winner] || !field[m.loser]) continue;
      const w = who(field[m.winner].member_id, field[m.winner].name, field[m.winner].avatar, field[m.winner].look);
      const l = who(field[m.loser].member_id, field[m.loser].name, field[m.loser].avatar, field[m.loser].look);
      w.match_wins++; w.streak++; w.best_streak = Math.max(w.best_streak, w.streak);
      l.match_losses++; l.streak = 0;
      const price = m.odds ? (m.winner === m.a ? m.odds.a : m.odds.b) : 0;
      if (price > 1 && (!upset || price > upset.price)) upset = { price, winner: field[m.winner].name, loser: field[m.loser].name, title: t.title, stage: m.stage || `Match ${m.no}`, tour_id: t.id, match: m.no, at: t.finished_at || '' };
    }
    if (t.prediction && t.prediction.winner_id) who(t.prediction.winner_id, t.prediction.winner_name || '').predictions_won++;
    champions.push({
      tour_id: t.id, title: t.title, at: t.finished_at || t.created_date, fighters: field.length, format: t.format || 'single',
      places: results.slice(0, 3).map((r) => ({ place: r.place, member_id: r.member_id, name: r.name, avatar: r.avatar || '', look: r.look || '', prize: r.prize || '' })),
      prediction: t.prediction ? { perfect: t.prediction.perfect_count || 0, entries: t.prediction.entries || 0, winner: t.prediction.winner_name || '' } : null
    });
  }
  for (const g of grudges) {
    if (g.winner == null) continue;
    const ids = [g.challenger_id, g.opponent_id], names = [g.challenger_name, g.opponent_name], av = [g.challenger_avatar || '', g.opponent_avatar || ''];
    const w = who(ids[g.winner], names[g.winner], av[g.winner]), l = who(ids[1 - g.winner], names[1 - g.winner], av[1 - g.winner]);
    w.grudge_wins++; l.grudge_losses++; w.grudge_won_points += g.prize || 0;
    if (!biggestGrudge || (g.stake || 0) > biggestGrudge.stake) biggestGrudge = { stake: g.stake || 0, winner: names[g.winner], loser: names[1 - g.winner], at: g.end_at || '', id: g.id };
  }
  const list = [...people.values()].map(({ streak, ...p }) => p);
  const reigning = champions.length ? (champions[champions.length - 1].places.find((x) => x.place === 1) || null) : null;
  const titles = {};
  for (const p of list) {
    const t = titleFor(p.wins, !!reigning && reigning.member_id === p.member_id);
    if (t) titles[p.member_id] = t;
  }
  const top = (key, n = 10) => list.filter((p) => p[key] > 0).sort((x, y) => y[key] - x[key] || y.match_wins - x.match_wins).slice(0, n);
  return {
    champions: champions.reverse().slice(0, 60),
    reigning,
    titles,
    leaders: { wins: top('wins'), podiums: top('podiums'), match_wins: top('match_wins'), best_streak: top('best_streak'), grudge_wins: top('grudge_wins'), predictions_won: top('predictions_won') },
    records: { upset, biggest_grudge: biggestGrudge },
    tournaments: tours.length, grudges: grudges.length
  };
}
export const sharedHall = (b) => memo('tour:hall', 60000, () => computeHall(b));
export async function titlesOf(b) { try { return (await sharedHall(b)).titles || {}; } catch { return {}; } }
