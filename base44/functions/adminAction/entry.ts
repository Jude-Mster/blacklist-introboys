import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, getMemberByDiscordId, changePoints, withMemberLock,
  ALL_GAMES, RANK_TITLE, UserError, errorResponse
} from '../../shared/points.ts';
import { pointsWebhookUrl, announceRankings } from '../../shared/discordPost.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { postSystem, GUILD_CHANNEL } from '../../shared/chat.ts';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSnowflake = (s: string) => /^\d{15,21}$/.test(s);

function int(v, { min = 0, max = 1e9, name = 'value' } = {}) {
  const n = Math.floor(Number(v));
  if (!Number.isInteger(n) || n < min || n > max) throw new UserError(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
}

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Sign in with Discord first.', 401);
    const caller = await getMemberByUserId(b, user.id);
    if (!caller) throw new UserError('Sign in with Discord first.');
    if (!['officer', 'leader'].includes(caller.role)) throw new UserError('Officers and the leader only.', 403);
    const leaderOnly = () => { if (caller.role !== 'leader') throw new UserError('Only the leader can do that.', 403); };

    let payload; try { payload = await req.json(); } catch { payload = {}; }
    const action = payload.action;

    if (action === 'updateSettings') {
      leaderOnly();
      const s = await getSettings(b);
      const p = payload.settings || {};
      const update: Record<string, unknown> = {};
      if ('guild_id' in p) {
        const g = String(p.guild_id ?? '').trim();
        if (g && !isSnowflake(g)) throw new UserError('Server ID should be the 17-20 digit number from "Copy Server ID".');
        update.guild_id = g;
      }
      if ('officer_role_id' in p) {
        const r = String(p.officer_role_id ?? '').trim();
        if (r && !isSnowflake(r)) throw new UserError('Officer role ID should be the 17-20 digit number from "Copy Role ID".');
        update.officer_role_id = r;
      }
      if ('discord_invite_url' in p) {
        const url = String(p.discord_invite_url ?? '').trim();
        if (url && !/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(url)) throw new UserError('Invite link should start with https://discord.gg/');
        update.discord_invite_url = url;
      }
      if ('member_role_id' in p) {
        const r = String(p.member_role_id ?? '').trim();
        if (!r) throw new UserError("Member role ID can't be blank. Paste the 17-20 digit number from \"Copy Role ID\".");
        if (!isSnowflake(r)) throw new UserError('Member role ID should be the 17-20 digit number from "Copy Role ID".');
        update.member_role_id = r;
      }
      if ('app_download_url' in p) {
        const url = String(p.app_download_url ?? '').trim();
        if (url && !/^https:\/\/[^\s]{4,500}$/.test(url)) throw new UserError('The app download link should start with https://');
        update.app_download_url = url;
      }
      if ('min_bet' in p) update.min_bet = int(p.min_bet, { min: 1, name: 'Minimum wager' });
      if ('max_bet' in p) update.max_bet = int(p.max_bet, { min: 1, name: 'Maximum wager' });
      if ('daily_bet_cap' in p) update.daily_bet_cap = int(p.daily_bet_cap, { min: 1, name: 'Daily wager limit' });
      if ('house_edge_pct' in p) update.house_edge_pct = int(p.house_edge_pct, { min: 0, max: 20, name: 'House edge' });
      if ('award_cap_per_day' in p) update.award_cap_per_day = int(p.award_cap_per_day, { min: 0, name: 'Officer award cap' });
      if ('daily_wheel_prizes' in p) {
        const prizes = (Array.isArray(p.daily_wheel_prizes) ? p.daily_wheel_prizes : String(p.daily_wheel_prizes).split(','))
          .map((x) => Math.floor(Number(String(x).trim()))).filter((n) => Number.isInteger(n) && n > 0);
        if (prizes.length < 2 || prizes.length > 12) throw new UserError('Daily wheel needs 2 to 12 prizes.');
        update.daily_wheel_prizes = prizes;
      }
      if ('chat_enabled' in p) update.chat_enabled = p.chat_enabled !== false;
      if ('games_enabled' in p) {
        update.games_enabled = (Array.isArray(p.games_enabled) ? p.games_enabled : []).filter((g) => ALL_GAMES.includes(g));
      }
      const minB = (update.min_bet ?? s.min_bet) as number;
      const maxB = (update.max_bet ?? s.max_bet) as number;
      if (minB > maxB) throw new UserError("Minimum wager can't be above the maximum.");
      await b.asServiceRole.entities.Settings.update(s.id, update);
      return Response.json({ ok: true });
    }

    if (action === 'ban' || action === 'unban') {
      const target = await getMemberByDiscordId(b, String(payload.discordId));
      if (!target) throw new UserError('Member not found.', 404);
      if (target.role === 'leader') throw new UserError("The leader can't be banned.");
      if (target.role === 'officer' && caller.role !== 'leader') throw new UserError('Only the leader can ban an officer.', 403);
      await b.asServiceRole.entities.Member.update(target.id, { banned: action === 'ban' });
      return Response.json({ ok: true });
    }

    if (action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    if (action === 'discordStatus') return Response.json({ points_channel: !!pointsWebhookUrl() });

    if (action === 'postRankings') {
      if (!pointsWebhookUrl()) throw new UserError('The points channel is not connected yet. Add the DISCORD_POINTS_WEBHOOK_URL secret first.');
      const { items } = await b.asServiceRole.entities.Member.filter(
        { banned: false },
        { sort: '-points', limit: 15, fields: ['discord_name', 'discord_id', 'points'] }
      );
      const sent = await announceRankings(items);
      if (!sent) throw new UserError('Discord did not accept the message. Check the webhook URL.');
      return Response.json({ ok: true });
    }

    if (action === 'roster') {
      const { items } = await b.asServiceRole.entities.Member.filter(
        {},
        { sort: '-points', limit: 500, fields: ['discord_id', 'discord_name', 'discord_username', 'avatar_url', 'points', 'role', 'banned', 'access_checked_at'] }
      );
      return Response.json({ members: items });
    }

    if (action === 'setRole') {
      leaderOnly();
      const role = payload.role;
      if (!['member', 'guild_member', 'officer'].includes(role)) throw new UserError('Pick Member, Guild Member or Vice Guild Member.');
      const target = await getMemberByDiscordId(b, String(payload.discordId));
      if (!target) throw new UserError('Member not found.', 404);
      if (target.id === caller.id) throw new UserError("You can't change your own role.");
      await b.asServiceRole.entities.Member.update(target.id, { role });
      const up = ['member', 'guild_member', 'officer'].indexOf(role) > ['member', 'guild_member', 'officer'].indexOf(target.role);
      await postSystem(b, GUILD_CHANNEL, `${target.discord_name || target.discord_id} is now ${RANK_TITLE[role]}.${up ? ' Congratulations!' : ''}`);
      return Response.json({ ok: true });
    }

    if (action === 'import') {
      leaderOnly();
      const lines = String(payload.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 300) throw new UserError('Import up to 300 lines at a time.');
      const results = [];
      for (const line of lines) {
        const [discordId, pts, ...nameParts] = line.split(',').map((s) => s.trim());
        const points = Math.floor(Number(pts));
        if (!isSnowflake(discordId || '') || !Number.isInteger(points) || points <= 0) {
          results.push({ discordId, ok: false, error: 'Use: discord_id,points' });
          continue;
        }
        let member = await getMemberByDiscordId(b, discordId);
        if (member && member.points !== 0) { results.push({ discordId, ok: false, error: 'Already has points' }); continue; }
        if (!member) {
          member = await b.asServiceRole.entities.Member.create({
            user_id: '', discord_id: discordId, discord_name: nameParts.join(',') || '', avatar_url: '',
            points: 0, role: 'member', banned: false
          });
        }
        const { balance } = await withMemberLock(b, member.id, () =>
          changePoints(b, member.id, points, 'import', 'Starting balance', caller.id)
        );
        results.push({ discordId, ok: true, balance });
      }
      return Response.json({ ok: true, results });
    }

    if (action === 'search') {
      const q = String(payload.query || '').trim().slice(0, 40);
      if (!q) return Response.json({ members: [] });
      const rx = { $regex: escapeRegex(q), $options: 'i' };
      const { items } = await b.asServiceRole.entities.Member.filter(
        { $or: [{ discord_name: rx }, { discord_username: rx }, { discord_id: rx }] },
        { limit: 20, fields: ['discord_id', 'discord_name', 'discord_username', 'avatar_url', 'points', 'role', 'banned'] }
      );
      return Response.json({ members: items });
    }

    if (action === 'totals') {
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ items }, bets] = await Promise.all([
        b.asServiceRole.entities.PointLog.filter({ created_date: { $gte: start } }, { limit: 5000, fields: ['source', 'amount'] }),
        b.asServiceRole.entities.Bet.filter({ created_date: { $gte: start } }, { limit: 5000, fields: ['wager', 'payout'] })
      ]);
      const totals = { award: 0, game: 0, daily: 0, admin: 0, import: 0, count: items.length, bets: 0, wagered: 0 };
      for (const l of items) totals[l.source] = (totals[l.source] || 0) + l.amount;
      for (const x of bets.items) { totals.bets += 1; totals.wagered += x.wager; }
      return Response.json({ totals });
    }

    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}