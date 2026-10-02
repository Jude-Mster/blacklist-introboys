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
    description: winners.map((w) => `**${place[w.place - 1]}** <@${w.discord_id}> wins ${w.prize}${w.points ? ` plus **${n(w.points)}** points` : ''}`).join('\n').slice(0, 3500)
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