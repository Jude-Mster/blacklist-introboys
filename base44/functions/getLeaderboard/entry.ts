import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const { items } = await b.asServiceRole.entities.Member.filter(
      { banned: false },
      { sort: '-points', limit: 20, fields: ['discord_id', 'discord_name', 'avatar_url', 'points', 'role'] }
    );
    return Response.json({ leaderboard: items });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}