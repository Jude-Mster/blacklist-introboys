import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resilient } from '../../shared/points.ts';
import { sendPush } from '../../shared/webpush.ts';
import { eventsBetween, alertText } from '../../shared/events.ts';

// Runs on a schedule (the "Event Push Alerts" workflow, every minute) and sends the war
// and HSB push notifications that are due, using each device's own choices.
// An alert is due from "<minutes> before" until one minute after the start, so a late or
// skipped run still sends it. Each device gets each alert once.
const WORKFLOW_SECRET = '4b786cb5dd6d5dc2a3e4e08a64dc6ac53c9d26a55472d1f8';
const MIN = 60000;
const LATE_MS = 60000;

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const b = resilient(createClientFromRequest(req));
    if (!body || body.__wf_secret !== WORKFLOW_SECRET) {
      const user = await b.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized.' }, { status: user ? 403 : 401 });
    }
    const now = Number.isFinite(body.__now) && body.__wf_secret === WORKFLOW_SECRET ? body.__now : Date.now();
    const events = eventsBetween(now - LATE_MS, now + 31 * MIN);
    if (!events.length) return Response.json({ ok: true, due: 0 });

    const E = b.asServiceRole.entities.PushSub;
    const { items } = await E.filter({}, { limit: 2000 });
    let sent = 0, gone = 0, failed = 0;
    const jobs = [];
    for (const s of items) {
      const already = new Set(Array.isArray(s.sent) ? s.sent : []);
      for (const ev of events) {
        const on = ev.kind === 'war' ? s.war !== false : s.hsb !== false;
        const lead = (ev.kind === 'war' ? Number(s.war_min) || 6 : Number(s.hsb_min) || 10) * MIN;
        if (!on || already.has(ev.id) || now < ev.at - lead) continue;
        already.add(ev.id);
        jobs.push((async () => {
          // Marked first, so two overlapping runs can't both send it.
          await E.update(s.id, { sent: [...already].slice(-12) });
          const t = alertText(ev, now);
          const code = await sendPush(b, s, { title: `BLACKLIST INTROBOYS: ${t.title}`, body: t.body, tag: ev.id, url: '/dashboard', kind: ev.kind }, { ttl: Math.max(60, Math.round((ev.at + LATE_MS - now) / 1000)) });
          if (code >= 200 && code < 300) { sent++; await E.update(s.id, { fails: 0, last_ok_at: new Date().toISOString() }).catch(() => {}); }
          else if (code === 404 || code === 410) { gone++; await E.delete(s.id).catch(() => {}); }
          else { failed++; const f = (Number(s.fails) || 0) + 1; if (f >= 30) await E.delete(s.id).catch(() => {}); else await E.update(s.id, { fails: f }).catch(() => {}); }
        })());
        break; // one alert per device per run; the next one goes a minute later
      }
    }
    await Promise.all(jobs);
    console.log('pushAlerts', JSON.stringify({ devices: items.length, events: events.map((e) => e.id), sent, gone, failed }));
    return Response.json({ ok: true, devices: items.length, sent, gone, failed });
  } catch (e) {
    console.error('pushAlerts error', e);
    return Response.json({ error: 'server' }, { status: 500 });
  }
}