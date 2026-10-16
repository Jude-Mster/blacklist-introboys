// 6.25: Wuxen2 Buy and Sell under load. 600 visitors and 20 members, all at the same time, for two
// simulated minutes: chat screens poll every 4 s, bubbles every 15 s, 40 people keep trading (open
// messages, private messages and pictures), and the data store now and then answers "rate limit".
// Checks that: nobody sees an error, every message reaches everyone, private messages reach only the
// two people in them, and the database work stays flat however many people are watching.
import { E, member, settings, advance, ok, done } from './h.ts';
import fn from '../base44/functions/buysellAction/entry.ts';

const g = globalThis as any;
g.__llm = async (p) => { await new Promise((r) => setTimeout(r, 2)); const t = /"""([\s\S]*)"""/.exec(p.prompt)?.[1] || ''; return { lang: 'en', en: t, tl: t, th: t, es: t, pt: t, id: t }; };
g.__byOp = {};

const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map((x) => x.toString(16).padStart(2, '0')).join('');
let ipN = 0;
async function call(who, body) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': who.ip };
  if (who.token) headers['x-guild-session'] = who.token;
  const res = await fn(new Request('http://x/', { method: 'POST', headers, body: JSON.stringify({ ...(who.a ? { _a: who.a } : {}), ...body }) }));
  return { status: res.status, ...(await res.json()) };
}

await settings();
const VISITORS = 600, MEMBERS = 20, TRADERS = 40, SECONDS = 120;
const people: any[] = [];
for (let i = 0; i < VISITORS; i++) people.push({ a: hex(), ip: `10.1.${Math.floor(i / 200)}.${++ipN % 250}`, open: i % 3 !== 0 }); // 2/3 have the chat open, 1/3 only the bubble
for (let i = 0; i < MEMBERS; i++) { const m = await member(`Member${i}`, 1000, i === 0 ? 'leader' : 'member'); people.push({ ...m, ip: `10.9.0.${i}`, open: true }); }
for (const p of people) {
  const h = await call(p, { action: 'hello' });
  p.vid = h.me.vid; p.seen = new Set(); p.dms = new Set(); p.since = ''; p.dmSince = ''; p.next = Math.floor(Math.random() * 4000);
}
const traders = people.slice(0, TRADERS - 5).concat(people.slice(VISITORS, VISITORS + 5));

// Busy moments: 3% of database calls are refused with "rate limit" (they are retried, see resilient()).
g.__gate = () => { if (Math.random() < 0.03) { const e: any = new Error('Rate limit exceeded'); e.status = 429; throw e; } };

let polls = 0, sends = 0, dmsSent = 0, errors = 0, slow = 0;
const sentOpen: string[] = [];
const sentDm: { id: string; from: string; to: string }[] = [];
const png = 'data:image/png;base64,' + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, ...new Array(200).fill(7)));
g.__byOp = {};
const t0 = Date.now();
for (let ms = 0; ms < SECONDS * 1000; ms += 500) {
  const jobs: Promise<void>[] = [];
  for (const p of people) {
    if (p.next > ms) continue;
    p.next = ms + (p.open ? 4000 : 15000);
    polls++;
    jobs.push((async () => {
      const r = await call(p, { action: 'poll', lite: !p.open, since: p.since, dmSince: p.dmSince });
      if (!r.ok) { errors++; return; }
      for (const m of r.items) { p.seen.add(m.id); if (m.at > p.since) p.since = m.at; }
      for (const d of r.dms) { p.dms.add(d.id); if (d.at > p.dmSince) p.dmSince = d.at; if (d.from !== p.vid && d.to !== p.vid) p.leak = true; }
    })());
  }
  // every trader sends about every 10 s: open messages, some private, some with a picture
  for (const t of traders) {
    if (Math.random() > 0.05) continue;
    const toDm = Math.random() < 0.35;
    const peer = people[Math.floor(Math.random() * people.length)];
    if (toDm && peer.vid === t.vid) continue;
    jobs.push((async () => {
      const body: any = toDm ? { action: 'send', to: peer.vid, text: `pm ${sends} how much?` } : { action: 'send', text: `WTS item ${sends} 1500000 gold` };
      if (Math.random() < 0.1) body.image = png;
      const r = await call(t, body);
      if (r.status === 429) { slow++; return; }      // "one message every 3 s": the visitor's own pace
      if (!r.ok) { errors++; console.error('send failed', r); return; }
      if (r.dm) { dmsSent++; sentDm.push({ id: r.dm.id, from: r.dm.from, to: r.dm.to }); } else { sends++; sentOpen.push(r.message.id); }
    })());
  }
  await Promise.all(jobs);
  advance(500);
}
g.__gate = null;
// one more round so everyone catches up
advance(20000);
for (const p of people) {
  if (!p.open) continue;
  const r = await call(p, { action: 'poll', since: p.since, dmSince: p.dmSince });
  for (const m of r.items) p.seen.add(m.id);
  for (const d of r.dms) p.dms.add(d.id);
}
const wall = Date.now() - t0;

const ops = g.__byOp;
const reads = (ops['BuySellMessage.filter'] || 0) + (ops['BuySellDM.filter'] || 0) + (ops['BuySellUser.filter'] || 0);
console.log(JSON.stringify({ polls, sends, dmsSent, slow, errors, ops, wallMs: wall }, null, 1));

ok(errors === 0, `no visitor saw an error in ${polls} polls and ${sends + dmsSent} sends (with 3% of database calls refused)`);
ok(sends > 200 && dmsSent > 100, 'plenty of trading happened');
// Database work: polls share reads. Without sharing this would be 2 reads per poll.
const perPoll = reads / polls;
ok(perPoll < 0.08, `database reads per poll ${perPoll.toFixed(3)} (shared, not per visitor)`);
const pollReadsPerSec = reads / SECONDS;
ok(pollReadsPerSec < 3 * ((sends + dmsSent) / SECONDS) + 2, `database reads per second ${pollReadsPerSec.toFixed(2)}: follow the messages sent, not the ${people.length} people watching`);
ok((ops['Member.get'] || 0) < 120, `member rows are reused by polls (${ops['Member.get'] || 0} reads for ${MEMBERS} members)`);
const openAll = people.filter((p) => p.open);
const missedOpen = openAll.filter((p) => sentOpen.slice(-60).some((id) => !p.seen.has(id))).length;
ok(missedOpen === 0, `every open chat shows every recent message (${openAll.length} screens)`);
const missedDm = sentDm.filter((d) => { const to = people.find((p) => p.vid === d.to); return to && to.open && !to.dms.has(d.id); }).length;
ok(missedDm === 0, `every private message reached its receiver (${sentDm.length})`);
ok(!people.some((p) => p.leak), 'nobody ever received someone else\'s private message');
ok((ops['llm'] || 0) <= sends + dmsSent, 'each message was translated at most once (no translation on reading)');
done();
