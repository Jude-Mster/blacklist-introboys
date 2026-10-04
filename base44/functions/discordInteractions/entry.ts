import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

import { secrets } from 'base44:runtime';
import nacl from 'npm:tweetnacl@1.0.3';
import { announcePoints } from '../../shared/discordPost.ts';
import { getSettings, getMemberByDiscordId, changePoints, withMemberLock, awardedLast24h } from '../../shared/points.ts';

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
      if (!target) return ephemeral('No points yet. Link your Discord on the guild site to get started.');
      const { items: above } = await b.asServiceRole.entities.Member.filter(
        { banned: false, points: { $gt: target.points || 0 } }, { limit: 1000, fields: ['id'] }
      );
      return Response.json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xD8B46A,
            author: { name: target.discord_name || target.discord_id, icon_url: target.avatar_url || undefined },
            description: `**${(target.points || 0).toLocaleString()}** points · rank #${above.length + 1}`
          }]
        }
      });
    }

    if (cmdName === 'leaderboard') {
      const { items } = await b.asServiceRole.entities.Member.filter(
        { banned: false },
        { sort: '-points', limit: 10, fields: ['discord_name', 'discord_id', 'points'] }
      );
      const desc = items.length
        ? items.map((m, i) => `${['🥇', '🥈', '🥉'][i] || `\`${String(i + 1).padStart(2, ' ')}\``}  ${m.discord_name || m.discord_id} — **${(m.points || 0).toLocaleString()}**`).join('\n')
        : 'No members yet.';
      return Response.json({
        type: 4,
        data: { embeds: [{ title: 'BLACKLIST INTROBOYS — Leaderboard', description: desc, color: 0xA3161F }] }
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
          user_id: '', discord_id: targetDiscordId, discord_name: u.global_name || u.username || '', discord_username: u.username || '', avatar_url: avatar,
          points: 0, role: 'member', banned: false
        });
      }

      if (!isLeader && amount > 0) {
        if (!callerMember) return ephemeral('Link your Discord on the guild site before awarding points.');
        const used = await awardedLast24h(b, callerMember.id);
        if (used + amount > settings.award_cap_per_day) {
          return ephemeral(`Award cap reached. You can give ${Math.max(0, settings.award_cap_per_day - used)} more in the next 24 hours.`);
        }
      }

      let balance;
      try {
        ({ balance } = await withMemberLock(b, target.id, () =>
          changePoints(b, target.id, amount, 'award', reason, callerMember ? callerMember.id : null)
        ));
      } catch (e) {
        return ephemeral(e.message);
      }
      // Copy the award into the points channel too, unless the command was run there.
      const here = String((data.channel && data.channel.name) || '');
      if (!here.includes('blacklist-points')) await announcePoints(target, amount, balance, reason, callerMember ? callerMember.discord_name || '' : '');
      const sign = amount > 0 ? `+${amount}` : `${amount}`;
      return Response.json({
        type: 4,
        data: {
          embeds: [{
            color: amount > 0 ? 0x3FA796 : 0xA3161F,
            description: `**${sign}** points to <@${targetDiscordId}>\n${reason}`,
            footer: { text: `New balance: ${balance.toLocaleString()}` }
          }],
          allowed_mentions: { users: [targetDiscordId] }
        }
      });
    }

    return Response.json({ type: 4, data: { content: 'Unknown command.' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}