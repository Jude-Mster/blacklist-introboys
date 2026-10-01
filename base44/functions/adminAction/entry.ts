import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getSettings, getMemberByUserId, getMemberByDiscordId, changePoints } from '../../shared/points.ts';

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const caller = await getMemberByUserId(b, user.id);
    if (!caller) return Response.json({ error: 'Discord account not linked.' }, { status: 400 });
    if (!['officer', 'leader'].includes(caller.role)) return Response.json({ error: 'Not authorized.' }, { status: 403 });

    let payload; try { payload = await req.json(); } catch { payload = {}; }
    const action = payload.action;

    if (action === 'updateSettings') {
      if (caller.role !== 'leader') return Response.json({ error: 'Leader only.' }, { status: 403 });
      const s = await getSettings(b);
      const allowed = ['guild_id', 'officer_role_id', 'min_bet', 'max_bet', 'daily_bet_cap', 'house_edge_pct', 'daily_wheel_prizes', 'award_cap_per_day', 'games_enabled'];
      const update = {};
      for (const k of allowed) if (payload.settings && k in payload.settings) update[k] = payload.settings[k];
      for (const k of ['guild_id', 'officer_role_id']) if (k in update) update[k] = String(update[k] ?? '').trim();
      await b.asServiceRole.entities.Settings.update(s.id, update);
      return Response.json({ ok: true });
    }

    if (action === 'ban' || action === 'unban') {
      const target = await getMemberByDiscordId(b, String(payload.discordId));
      if (!target) return Response.json({ error: 'Member not found.' }, { status: 404 });
      await b.asServiceRole.entities.Member.update(target.id, { banned: action === 'ban' });
      return Response.json({ ok: true });
    }

    if (action === 'import') {
      if (caller.role !== 'leader') return Response.json({ error: 'Leader only.' }, { status: 403 });
      const lines = String(payload.text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const results = [];
      for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        const discordId = parts[0];
        const points = Math.floor(Number(parts[1]));
        if (!discordId || !Number.isInteger(points)) { results.push({ discordId, ok: false, error: 'bad line' }); continue; }
        const { items } = await b.asServiceRole.entities.Member.filter({ discord_id: discordId }, { limit: 1 });
        let member;
        if (items.length > 0) {
          member = items[0];
          if (member.points !== 0) { results.push({ discordId, ok: false, error: 'already has points' }); continue; }
        } else {
          member = await b.asServiceRole.entities.Member.create({
            user_id: '', discord_id: discordId, discord_name: '', avatar_url: '',
            points: 0, role: 'member', banned: false
          });
        }
        const { balance } = await changePoints(b, member.id, points, 'import', 'Starting balance import', caller.id);
        results.push({ discordId, ok: true, balance });
      }
      return Response.json({ ok: true, results });
    }

    if (action === 'search') {
      const q = String(payload.query || '').trim();
      if (!q) return Response.json({ members: [] });
      const { items } = await b.asServiceRole.entities.Member.filter(
        { $or: [{ discord_name: { $regex: q, $options: 'i' } }, { discord_id: { $regex: q, $options: 'i' } }] },
        { limit: 20, fields: ['discord_id', 'discord_name', 'avatar_url', 'points', 'role', 'banned'] }
      );
      return Response.json({ members: items });
    }

    if (action === 'totals') {
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { items } = await b.asServiceRole.entities.PointLog.filter({ created_date: { $gte: start } }, { limit: 1000 });
      const totals = { award: 0, game: 0, daily: 0, admin: 0, import: 0, count: items.length };
      for (const l of items) { totals[l.source] = (totals[l.source] || 0) + l.amount; }
      return Response.json({ totals });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}