import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// 6.56: is the whole site on maintenance? Anyone may call this, signed in or not, because the
// notice replaces every page (the landing page and the sign-in too). It returns nothing but the
// switch and the note, so nothing private is exposed.
const FALLBACK_NOTE = 'TAPOS NA YUNG INTRO, SALAMAT';

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const { items } = await b.asServiceRole.entities.Settings.filter({}, { sort: 'created_date', limit: 1 });
    const s = items[0] || {};
    return Response.json({
      ok: true,
      maintenance: s.site_maintenance === true,
      note: String(s.maintenance_note || '').trim() || FALLBACK_NOTE
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    // Never hide the site because this read failed: the notice is opened by the switch alone.
    return Response.json({ ok: false, maintenance: false, note: FALLBACK_NOTE }, { headers: { 'cache-control': 'no-store' } });
  }
}