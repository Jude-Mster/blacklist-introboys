import { secrets } from 'base44:runtime';

// Posts point updates into the guild's Discord points channel through a
// channel webhook. Set the secret DISCORD_POINTS_WEBHOOK_URL to turn it on.
const RED = 0xC8161D;
const GREEN = 0x3FBF7F;
const WHITE = 0xF2F2F2;

export function pointsWebhookUrl() {
  let url = '';
  try { url = secrets.get('DISCORD_POINTS_WEBHOOK_URL') || ''; } catch { url = ''; }
  return url.startsWith('https://discord.com/api/webhooks/') || url.startsWith('https://discordapp.com/api/webhooks/') ? url : '';
}

// Returns true when Discord accepted the message. Never throws.
export async function postToPointsChannel(embed, mentionIds: string[] = []) {
  const url = pointsWebhookUrl();
  if (!url) return false;
  try {
    const ids = mentionIds.filter((x) => /^\d{5,32}$/.test(String(x))).slice(0, 20);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Blacklist Points',
        content: ids.map((id) => `<@${id}>`).join(' ') || undefined,
        embeds: [embed],
        allowed_mentions: { parse: [], users: ids }
      }),
      signal: ctl.signal
    });
    clearTimeout(timer);
    if (!res.ok) console.error('points channel post failed', res.status);
    return res.ok;
  } catch (e) {
    console.error('points channel post failed', e);
    return false;
  }
}

const n = (v) => Number(v || 0).toLocaleString('en-US');

// "+500 points to @member — reason" with the new balance.
export function announcePoints(target, amount: number, balance: number, reason: string, byName = '') {
  const sign = amount > 0 ? `+${n(amount)}` : `−${n(Math.abs(amount))}`;
  return postToPointsChannel({
    color: amount > 0 ? GREEN : RED,
    description: `**${sign} points** ${amount > 0 ? 'to' : 'from'} <@${target.discord_id}>\n${String(reason || '').slice(0, 300)}`,
    footer: { text: `New balance: ${n(balance)}${byName ? ` · by ${byName}` : ''}` }
  }, [target.discord_id]);
}

export function announceRaffle(title: string, winners) {
  const place = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  return postToPointsChannel({
    color: RED,
    title: `Raffle drawn: ${String(title).slice(0, 80)}`,
    description: winners.map((w) => `**${place[w.place - 1]}** <@${w.discord_id}> wins ${w.prize}${w.points ? ` (**${n(w.points)}** points paid)` : ''}`).join('\n').slice(0, 3500)
  }, winners.map((w) => w.discord_id));
}

export function announceRankings(members) {
  const medal = ['🥇', '🥈', '🥉'];
  return postToPointsChannel({
    color: WHITE,
    title: 'BLACKLIST INTROBOYS points rankings',
    description: members.length
      ? members.map((m, i) => `${medal[i] || `\`${String(i + 1).padStart(2, ' ')}\``}  ${m.discord_name || m.discord_id}: **${n(m.points)}**`).join('\n')
      : 'No members yet.',
    footer: { text: 'Use /points to see your own balance and rank.' },
    timestamp: new Date().toISOString()
  });
}
// ---------- Announcements channel (raffles) ----------
// A second webhook, for the guild's announcements channel. Set the secret
// DISCORD_ANNOUNCE_WEBHOOK_URL to turn it on.
const SITE = 'https://blacklistintroboys.com';
const GOLD = 0xD4A72C;

export function announceWebhookUrl() {
  let url = '';
  try { url = secrets.get('DISCORD_ANNOUNCE_WEBHOOK_URL') || ''; } catch { url = ''; }
  url = String(url).trim();
  return url.startsWith('https://discord.com/api/webhooks/') || url.startsWith('https://discordapp.com/api/webhooks/') ? url : '';
}

// Returns true when Discord accepted the message. Never throws.
async function postAnnouncement(payload) {
  const url = announceWebhookUrl();
  if (!url) return false;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Blacklist Raffles', avatar_url: `${SITE}/icon-192.png`, ...payload }),
      signal: ctl.signal
    });
    clearTimeout(timer);
    if (!res.ok) console.error('announcement post failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error('announcement post failed', e);
    return false;
  }
}

const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const clip = (s, max) => String(s || '').replace(/@(everyone|here)/gi, '@​$1').slice(0, max);

// "Raffle open" post: prizes, ticket price and the draw time (Discord shows it in each
// reader's own time zone). `ping` adds @everyone.
export function announceRaffleOpen(r, ping = false) {
  const ends = Math.floor(Date.parse(r.ends_at) / 1000);
  const fields = [
    { name: 'Ticket', value: `${n(r.ticket_price)} points`, inline: true },
    { name: 'Draw', value: `<t:${ends}:F>\n<t:${ends}:R>`, inline: true },
    { name: 'Limit', value: r.max_tickets_per_member > 0 ? `${n(r.max_tickets_per_member)} per member` : 'No limit', inline: true },
    { name: 'Prizes', value: (r.prizes || []).map((p, i) => `**${PLACE[i]}** · ${clip(p, 80)}`).join('\n').slice(0, 1000) || '—' }
  ];
  if (r.pot_to_first) fields.push({ name: 'Bonus', value: '1st place also takes every point spent on tickets.' });
  if ((r.tickets_sold || 0) > 0) fields.push({ name: 'So far', value: `${n(r.tickets_sold)} tickets sold`, inline: true });
  return postAnnouncement({
    content: ping ? '@everyone' : undefined,
    allowed_mentions: { parse: ping ? ['everyone'] : [] },
    embeds: [{
      color: RED,
      title: `Raffle open: ${clip(r.title, 200)}`,
      url: `${SITE}/raffle`,
      description: `Buy tickets with guild points. Every ticket is one more slice of the wheel.\n[Buy tickets on blacklistintroboys.com](${SITE}/raffle)`,
      fields,
      footer: { text: 'BLACKLIST INTROBOYS · Guild raffle' },
      timestamp: new Date().toISOString()
    }]
  });
}

// "Raffle drawn" post, tagging each winner.
export function announceRaffleResults(title: string, winners) {
  const ids = winners.map((w) => String(w.discord_id || '')).filter((x) => /^\d{5,32}$/.test(x)).slice(0, 20);
  return postAnnouncement({
    content: ids.map((id) => `<@${id}>`).join(' ') || undefined,
    allowed_mentions: { parse: [], users: ids },
    embeds: [{
      color: GOLD,
      title: `Raffle drawn: ${clip(title, 200)}`,
      url: `${SITE}/raffle`,
      description: winners.length
        ? winners.map((w) => `**${PLACE[w.place - 1]}** ${w.discord_id ? `<@${w.discord_id}>` : clip(w.name, 60)} wins ${clip(w.prize, 80)}${w.points ? ` (**${n(w.points)}** points paid)` : ''}`).join('\n').slice(0, 3500)
        : 'No tickets were sold, so there are no winners.',
      footer: { text: 'BLACKLIST INTROBOYS · Guild raffle' },
      timestamp: new Date().toISOString()
    }]
  });
}