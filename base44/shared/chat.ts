// Chat helpers shared by chatSend and the poker table.

import { secrets } from 'base44:runtime';

export const GUILD_CHANNEL = 'guild';
export const tableChannel = (tableId: string) => `table:${tableId}`;

export async function postSystem(b, channel: string, text: string) {
  try {
    await b.asServiceRole.entities.ChatMessage.create({
      channel,
      member_id: '',
      discord_id: '',
      name: 'Guild hall',
      avatar: '',
      role: 'system',
      text: text.slice(0, 300),
      kind: 'system',
      deleted: false
    });
  } catch (e) {
    console.error('system chat failed', e);
  }
}

// Post a message to the linked Discord channel through a webhook.
// No-op unless the DISCORD_CHAT_WEBHOOK_URL secret is set to a Discord webhook.
export async function postToDiscord(content: string, opts?: { username?: string; avatarUrl?: string }) {
  let url = '';
  try { url = secrets.get('DISCORD_CHAT_WEBHOOK_URL') || ''; } catch { url = ''; }
  if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) return;
  try {
    const body: any = { content: content.slice(0, 1900), allowed_mentions: { parse: [] } };
    if (opts?.username) body.username = opts.username.slice(0, 60);
    if (opts?.avatarUrl && opts.avatarUrl.startsWith('https://')) body.avatar_url = opts.avatarUrl;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) console.error('discord post failed', res.status);
  } catch (e) {
    console.error('discord post failed', e);
  }
}

// Tell the Discord channel about a loss at the tables. Sent for every loss of at least
// `big_loss_threshold` points (a guild setting; when it isn't set, every loss is sent).
export async function announceLoss(name: string, gameName: string, amount: number, detail?: string) {
  const n = Math.max(0, Math.round(amount)).toLocaleString();
  const extra = detail ? ` — ${detail}` : '';
  await postToDiscord(`💸 **${name}** lost **${n}** points on **${gameName}**${extra}`);
}
export const lossWorthTelling = (settings, lost: number) => lost > 0 && lost >= (Number(settings && settings.big_loss_threshold) || 0);

// Announce a massive win to the Discord channel. Called from the roulette and
// poker settle code when the win meets the big_win_threshold setting.
export async function announceBigWin(name: string, gameName: string, amount: number, detail?: string) {
  const n = Math.max(0, Math.round(amount)).toLocaleString();
  const extra = detail ? ` — ${detail}` : '';
  await postToDiscord(`💰 **${name}** hit a massive win on **${gameName}** — **+${n}** points${extra}`);
}