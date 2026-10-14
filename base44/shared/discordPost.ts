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
// ---------- Announcements channel (tournaments) ----------
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
async function postAnnouncement(payload, username = 'Blacklist Arena') {
  const url = announceWebhookUrl();
  if (!url) return false;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, avatar_url: `${SITE}/icon-192.png`, ...payload }),
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


// ---------- Blacklist Arena tournaments ----------
const fightUrl = `${SITE}/arena?tab=tournament`;

// "Tournament open" post: prizes, entry price and the start time. `ping` adds @everyone.
export function announceTournamentOpen(t, entryCost: number, ping = false) {
  const at = t.starts_at ? Math.floor(Date.parse(t.starts_at) / 1000) : 0;
  const fields = [
    { name: 'Join', value: `${n(entryCost)} points`, inline: true },
    { name: 'Starts', value: at ? `<t:${at}:F>\n<t:${at}:R>` : 'When the Guild Leader starts it', inline: true },
    { name: 'Prizes', value: (t.prizes || []).map((p, i) => `**${PLACE[i]}** · ${clip(p.label, 80)}`).join('\n').slice(0, 1000) || '—' }
  ];
  if ((t.entrant_count || 0) > 0) fields.push({ name: 'Signed up', value: `${n(t.entrant_count)} fighters`, inline: true });
  return postAnnouncement({
    content: ping ? '@everyone' : undefined,
    allowed_mentions: { parse: ping ? ['everyone'] : [] },
    embeds: [{
      color: RED,
      title: `Tournament open: ${clip(t.title, 200)}`,
      url: fightUrl,
      description: `Joining gives you a fighter. Random stats (1, 5 or 10 at a time), weapon upgrades, skills, a pet and a mount make it stronger. Double elimination: you're out after two losses. Predict the whole bracket for the GP code pot, and bet on every match.\n[Sign up on blacklistintroboys.com](${fightUrl})`,
      fields,
      footer: { text: 'BLACKLIST INTROBOYS · Arena tournament' },
      timestamp: new Date().toISOString()
    }]
  });
}

// "Tournament over" post, tagging each prize winner.
export function announceTournamentResults(title: string, results) {
  const ids = results.map((w) => String(w.discord_id || '')).filter((x) => /^\d{5,32}$/.test(x)).slice(0, 20);
  return postAnnouncement({
    content: ids.map((id) => `<@${id}>`).join(' ') || undefined,
    allowed_mentions: { parse: [], users: ids },
    embeds: [{
      color: GOLD,
      title: `Tournament over: ${clip(title, 200)}`,
      url: fightUrl,
      description: results.map((w) => `**${PLACE[w.place - 1]}** ${w.discord_id ? `<@${w.discord_id}>` : clip(w.name, 60)}${w.prize ? ` wins ${clip(w.prize, 80)}` : ''}${w.points ? ` (**${n(w.points)}** points paid)` : ''}`).join('\n').slice(0, 3500) || 'No results.',
      footer: { text: 'BLACKLIST INTROBOYS · Arena tournament' },
      timestamp: new Date().toISOString()
    }]
  });
}

// "Tournament cancelled" post with the reason.
export function announceTournamentCancelled(title: string, reason: string) {
  return postAnnouncement({
    allowed_mentions: { parse: [] },
    embeds: [{
      color: RED,
      title: `Tournament cancelled: ${clip(title, 200)}`,
      url: fightUrl,
      description: clip(reason, 1500),
      footer: { text: 'BLACKLIST INTROBOYS · Arena tournament' },
      timestamp: new Date().toISOString()
    }]
  });
}

// "Tournament starting soon" post (about 10 minutes before), with everyone pinged.
export function announceTournamentSoon(t, minutes: number, entryCost: number) {
  const at = Math.floor(Date.parse(t.starts_at) / 1000);
  return postAnnouncement({
    content: '@everyone',
    allowed_mentions: { parse: ['everyone'] },
    embeds: [{
      color: RED,
      title: `Starting in ${minutes} minute${minutes === 1 ? '' : 's'}: ${clip(t.title, 180)}`,
      url: fightUrl,
      description: `${n(t.entrant_count || 0)} fighters signed up. Last chance to sign up (${n(entryCost)} points) or upgrade your fighter.\nStarts <t:${at}:t> (<t:${at}:R>). [Open the arena](${fightUrl})`,
      footer: { text: 'BLACKLIST INTROBOYS · Arena tournament' },
      timestamp: new Date().toISOString()
    }]
  });
}

// "Tournament started" post: who is fighting and when the first match opens for bets.
export function announceTournamentStarted(title: string, field, matchCount: number, firstMs: number) {
  const at = Math.floor(firstMs / 1000);
  return postAnnouncement({
    allowed_mentions: { parse: [] },
    embeds: [{
      color: GOLD,
      title: `Tournament started: ${clip(title, 200)}`,
      url: fightUrl,
      description: `${n(field.length)} fighters, ${n(matchCount)} matches, every one fought live. The first match opens for bets <t:${at}:R>.\n[Watch and bet](${fightUrl})`,
      fields: [{ name: 'Fighters', value: field.map((f) => clip(f.name, 40)).join(', ').slice(0, 1000) || '—' }],
      footer: { text: 'BLACKLIST INTROBOYS · Arena tournament' },
      timestamp: new Date().toISOString()
    }]
  });
}
// ---------- 6.22: match results and replays ----------
// Results go to their own channel when DISCORD_REPLAY_WEBHOOK_URL is set, otherwise to the announcements
// channel.
export function replayWebhookUrl() {
  let url = '';
  try { url = secrets.get('DISCORD_REPLAY_WEBHOOK_URL') || ''; } catch { url = ''; }
  url = String(url).trim();
  if (url.startsWith('https://discord.com/api/webhooks/') || url.startsWith('https://discordapp.com/api/webhooks/')) return url;
  return announceWebhookUrl();
}
async function postReplay(payload) {
  const url = replayWebhookUrl();
  if (!url) return false;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Blacklist Arena', avatar_url: `${SITE}/icon-192.png`, allowed_mentions: { parse: [] }, ...payload }),
      signal: ctl.signal
    });
    clearTimeout(timer);
    if (!res.ok) console.error('replay post failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.ok;
  } catch (e) { console.error('replay post failed', e); return false; }
}
export const replayLink = (q: string) => `${SITE}/arena?${q}`;
// One finished fight: who won, how, and a link that plays it again on the site.
// c: { title, stage, a, b, winner (name), how, length, price (winner's price or 0), watch, note }
export function announceFightResult(c) {
  const how = c.how === 'ko' ? (c.ot ? 'by KO in overtime' : 'by KO') : 'on HP left after overtime';
  return postReplay({
    embeds: [{
      color: GOLD,
      title: clip(`${c.stage}: ${c.a} vs ${c.b}`, 250),
      url: c.watch,
      description: `**${clip(c.winner, 60)}** wins ${how} in ${Number(c.length || 0).toFixed(1)} s${c.price > 1 ? ` (was ${Number(c.price).toFixed(2)}×)` : ''}.${c.note ? `\n${clip(c.note, 300)}` : ''}\n[▶ Watch the replay](${c.watch})`,
      footer: { text: clip(c.title, 120) },
      timestamp: new Date().toISOString()
    }]
  });
}
// The final as a video file (recorded in the Guild Leader's browser). Returns true when Discord took it.
export async function postFightVideo(bytes: Uint8Array, mime: string, name: string, text: string) {
  const url = replayWebhookUrl();
  if (!url) return false;
  try {
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify({ username: 'Blacklist Arena', avatar_url: `${SITE}/icon-192.png`, content: clip(text, 1800), allowed_mentions: { parse: [] } }));
    fd.append('files[0]', new Blob([bytes], { type: mime }), name);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    const res = await fetch(url, { method: 'POST', body: fd, signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) console.error('video post failed', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return res.ok;
  } catch (e) { console.error('video post failed', e); return false; }
}
// Grudge match posts: a challenge, and its result.
export function announceGrudge(text: string, watch = '') {
  return postAnnouncement({ allowed_mentions: { parse: [] }, embeds: [{ color: RED, title: 'Grudge match', url: watch || `${SITE}/arena?tab=grudge`, description: clip(text, 1500), footer: { text: 'BLACKLIST INTROBOYS · Blacklist Arena' }, timestamp: new Date().toISOString() }] });
}
// Bracket prediction: who won the pot, or that it rolls over.
export function announcePrediction(title: string, text: string) {
  return postAnnouncement({ allowed_mentions: { parse: [] }, embeds: [{ color: GOLD, title: clip(`Bracket prediction: ${title}`, 250), url: fightUrl, description: clip(text, 2000), footer: { text: 'BLACKLIST INTROBOYS · Arena tournament' }, timestamp: new Date().toISOString() }] });
}
