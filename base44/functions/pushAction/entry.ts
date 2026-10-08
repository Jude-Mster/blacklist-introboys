import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getMemberByUserId, UserError, errorResponse, resilient } from '../../shared/points.ts';
import { getVapid, validSubscription, sendPush } from '../../shared/webpush.ts';
import { WAR_MIN_CHOICES, HSB_MIN_CHOICES } from '../../shared/events.ts';

// A member's phone or browser asking for (or changing) war and HSB push alerts.
//   key          -> the site's public push key, needed to subscribe
//   subscribe    -> save this device for the signed-in member, with their choices
//   prefs        -> change the choices for this device
//   unsubscribe  -> stop alerts on this device
//   test         -> send one test notification to this device now
const MAX_DEVICES = 8;

function cleanPrefs(p) {
  p = p || {};
  return {
    war: p.war !== false,
    hsb: p.hsb !== false,
    war_min: WAR_MIN_CHOICES.includes(Number(p.warMin)) ? Number(p.warMin) : 6,
    hsb_min: HSB_MIN_CHOICES.includes(Number(p.hsbMin)) ? Number(p.hsbMin) : 10
  };
}

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    const E = b.asServiceRole.entities.PushSub;

    if (p.action === 'key') return Response.json({ public_key: (await getVapid(b)).publicKey });

    const endpoint = String((p.sub && p.sub.endpoint) || p.endpoint || '');
    const mine = async () => {
      const { items } = await E.filter({ endpoint }, { limit: 5 });
      return items.find((s) => s.member_id === me.id) || null;
    };

    if (p.action === 'subscribe') {
      if (!validSubscription(p.sub)) throw new UserError('This device gave an address we cannot send to.');
      const fields = { member_id: me.id, endpoint, p256dh: p.sub.keys.p256dh, auth: p.sub.keys.auth, ...cleanPrefs(p.prefs), fails: 0, device: String(p.device || '').slice(0, 80) };
      const { items: same } = await E.filter({ endpoint }, { limit: 5 });
      // A device belongs to whoever signed in on it last.
      if (same.length) { await E.update(same[0].id, fields); await Promise.all(same.slice(1).map((s) => E.delete(s.id).catch(() => {}))); }
      else await E.create({ ...fields, sent: [] });
      const { items: all } = await E.filter({ member_id: me.id }, { limit: 50 });
      if (all.length > MAX_DEVICES) {
        const old = all.filter((s) => s.endpoint !== endpoint).sort((x, y) => String(x.created_date || x.id).localeCompare(String(y.created_date || y.id)));
        await Promise.all(old.slice(0, all.length - MAX_DEVICES).map((s) => E.delete(s.id).catch(() => {})));
      }
      return Response.json({ ok: true });
    }

    if (p.action === 'prefs') {
      const s = await mine();
      if (!s) return Response.json({ ok: false, missing: true });
      await E.update(s.id, cleanPrefs(p.prefs));
      return Response.json({ ok: true });
    }

    if (p.action === 'unsubscribe') {
      const s = await mine();
      if (s) await E.delete(s.id);
      return Response.json({ ok: true });
    }

    if (p.action === 'test') {
      const s = await mine();
      if (!s) return Response.json({ status: 'missing' });
      const kind = p.kind === 'hsb' ? 'hsb' : 'war';
      const code = await sendPush(b, s, {
        title: `BLACKLIST INTROBOYS: Test ${kind === 'hsb' ? 'HSB' : 'war'} alert`,
        body: `Get ready for ${kind === 'hsb' ? 'HSB' : 'War'}. Push notifications are working on this device.`,
        tag: `test-${kind}`, url: '/profile', kind
      }, { ttl: 120 });
      if (code === 404 || code === 410) await E.delete(s.id).catch(() => {});
      else if (code >= 200 && code < 300) await E.update(s.id, { last_ok_at: new Date().toISOString(), fails: 0 });
      return Response.json({ status: code >= 200 && code < 300 ? 'sent' : (code === 404 || code === 410) ? 'expired' : 'failed', code });
    }

    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}