import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import nacl from 'npm:tweetnacl@1.0.3';
import { getSettings, getMemberByDiscordId, changePoints } from '../../shared/points.ts';

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function ephemeral(content) {
  return Response.json({ type: 4, data: { content, flags: 64 } });
}

export default async function(req) {
  try {
    const sig = req.headers.get('X-Signature-Ed25519');
    const ts = req.headers.get('X-Signature-Timestamp');
    const body = await req.text();
    if (!sig || !ts) return new Response('Missing signature headers.', { status: 401 });

    let key, sigBytes;
    try {
      key = hexToBytes(secrets.get('DISCORD_PUBLIC_KEY'));
      sigBytes = hexToBytes(sig);
    } catch (e) {
      return new Response('Invalid public key configuration.', { status: 401 });
    }
    const message = new TextEncoder().encode(ts + body);
    const valid = nacl.sign.detached.verify(message, sigBytes, key);
    if (!valid) return new Response('Invalid request signature.', { status: 401 });

    const data = JSON.parse(body);
    if (data.type === 1) return Response.json({ type: 1 }); // PONG
    if (data.type !== 2) return Response.json({ type: 4, data: { content: 'Unsupported interaction type.' } });

    const b = createClientFromRequest(req);
    const settings = await getSettings(b);
    const cmdName = data.data.name;
    const memberObj = data.member || data.user;
    const callerDiscordId = memberObj && memberObj.user ? memberObj.user.id : null;
    const callerRoles = (memberObj && memberObj.roles) || [];
    const opts = Object.fromEntries((data.data.options || []).map(o => [o.name, o]));
    const resolved = (data.data.resolved) || {};

    if (cmdName === 'points') {
      const opt = opts.member;
      const targetDiscordId = opt ? opt.value : callerDiscordId;
      const target = await getMemberByDiscordId(b, targetDiscordId);
      const content = target
        ? `**${target.discord_name || target.discord_id}** has **${target.points}** points.`
        : 'No member record found for that member.';
      return ephemeral(content);
    }

    if (cmdName === 'leaderboard') {
      const { items } = await b.asServiceRole.entities.Member.filter(
        { banned: false },
        { sort: '-points', limit: 10, fields: ['discord_name', 'discord_id', 'points'] }
      );
      const desc = items.length
        ? items.map((m, i) => `${i + 1}. ${m.discord_name || m.discord_id} — ${m.points} pts`).join('\n')
        : 'No members yet.';
      return Response.json({
        type: 4,
        data: { embeds: [{ title: 'BLACKLIST INTROBOYS — Leaderboard', description: desc, color: 0xB3121F }] }
      });
    }

    if (cmdName === 'award') {
      const callerMember = callerDiscordId ? await getMemberByDiscordId(b, callerDiscordId) : null;
      const isLeader = callerMember && callerMember.role === 'leader';
      const isOfficer = settings.officer_role_id && callerRoles.includes(settings.officer_role_id);
      if (!isLeader && !isOfficer) return ephemeral('You are not authorized to award points.');

      const targetDiscordId = opts.member.value;
      const amount = Math.floor(Number(opts.amount.value));
      const reason = String(opts.reason.value || '').trim();
      if (!Number.isInteger(amount) || amount === 0) return ephemeral('Amount must be a non-zero whole number.');
      if (!reason) return ephemeral('Reason is required.');
      if (!isLeader && amount < 0) return ephemeral('Officers can only award points.');

      let target = await getMemberByDiscordId(b, targetDiscordId);
      if (!target) {
        const u = (resolved.users && resolved.users[targetDiscordId]) || {};
        const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${targetDiscordId}/${u.avatar}.png` : '';
        target = await b.asServiceRole.entities.Member.create({
          user_id: '', discord_id: targetDiscordId, discord_name: u.username || '', avatar_url: avatar,
          points: 0, role: 'member', banned: false
        });
      }

      if (!isLeader && amount > 0) {
        const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { items } = await b.asServiceRole.entities.PointLog.filter(
          { by_member_id: callerMember.id, source: 'award', amount: { $gt: 0 }, created_date: { $gte: start } },
          { limit: 500 }
        );
        const total = items.reduce((s, l) => s + l.amount, 0);
        if (total + amount > settings.award_cap_per_day) return ephemeral('Daily award cap reached.');
      }

      try {
        await changePoints(b, target.id, amount, 'award', reason, callerMember ? callerMember.id : null);
      } catch (e) {
        return ephemeral(e.message);
      }
      const sign = amount > 0 ? `+${amount}` : `${amount}`;
      return Response.json({
        type: 4,
        data: { content: `${sign} points to <@${targetDiscordId}> — ${reason}` }
      });
    }

    return Response.json({ type: 4, data: { content: 'Unknown command.' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}