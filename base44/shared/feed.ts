// Public live feed of game results, shown beside every game.
export async function postFeed(b, member, entry) {
  try {
    await b.asServiceRole.entities.GameFeed.create({
      game: entry.game,
      game_name: entry.game_name || entry.game,
      member_id: member.id,
      name: member.discord_name || member.discord_id,
      avatar: member.avatar_url || '',
      role: member.role || 'member',
      wager: entry.wager || 0,
      payout: entry.payout || 0,
      net: (entry.payout || 0) - (entry.wager || 0),
      detail: String(entry.detail || '').slice(0, 120)
    });
  } catch (e) {
    console.error('feed write failed', e);
  }
}