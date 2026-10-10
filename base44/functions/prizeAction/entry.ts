import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import { getMemberByUserId, getMemberByDiscordId, withRecordLock, UserError, errorResponse, resilient } from '../../shared/points.ts';
import {
  checkCode, assertNewCode, codeFields, codeHash, cleanLabel, cleanReason, leaderView, ownerView,
  runStockLocked, takeFromStock, stockSummary, assignAndDeliver, deliver
} from '../../shared/prizeCodes.ts';

// Prize codes (GP codes and the like).
// Any member:      mine, pending, markOpened, setRedeemed   (their OWN codes only)
// Guild Leader:    adminList, stockSummary, addStock, removeStock, give, retryDm, replace
// The code itself is only ever returned by `mine`, and only to the member it was given to.

const MAX_STOCK_ADD = 200;

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    const E = b.asServiceRole.entities.PrizeCode;
    const action = String(p.action || '');

    // ----- The member's own prizes -----
    const mineRows = async () => (await E.filter({ member_id: me.id, status: 'assigned' }, { limit: 200 })).items
      .sort((x, y) => String(y.assigned_at || '').localeCompare(String(x.assigned_at || '')));

    if (action === 'mine') {
      return Response.json({ prizes: await Promise.all((await mineRows()).map(ownerView)) });
    }
    if (action === 'pending') {
      const fresh = (await mineRows()).filter((r) => !r.opened_at);
      return Response.json({ count: fresh.length, latest: fresh[0] ? fresh[0].label : '' });
    }
    if (action === 'markOpened') {
      const ids = new Set((Array.isArray(p.ids) ? p.ids : []).map(String).slice(0, 50));
      const at = new Date().toISOString();
      for (const r of await mineRows()) if (ids.has(r.id) && !r.opened_at) await E.update(r.id, { opened_at: at });
      return Response.json({ ok: true });
    }
    if (action === 'setRedeemed') {
      const r = (await mineRows()).find((x) => x.id === String(p.id));
      if (!r) throw new UserError('Prize not found.', 404);
      const updated = await E.update(r.id, { redeemed_at: p.value === false ? '' : new Date().toISOString() });
      return Response.json({ ok: true, prize: await ownerView(updated) });
    }

    // ----- Guild Leader only -----
    if (me.role !== 'leader') throw new UserError('Only the Guild Leader can manage prize codes.', 403);

    if (action === 'stockSummary') return Response.json({ stock: await stockSummary(b) });

    if (action === 'adminList') {
      const [{ items: stock }, { items: reserved }, { items: given }] = await Promise.all([
        E.filter({ status: 'stock' }, { limit: 2000 }),
        E.filter({ status: 'reserved' }, { limit: 500 }),
        E.filter({ status: 'assigned' }, { limit: 500 })
      ]);
      const byNew = (k) => (x, y) => String(y[k] || y.created_date || '').localeCompare(String(x[k] || x.created_date || ''));
      // (Raffles are gone: tournament code prizes are set aside before the tournament starts.)
      const waiting = [];
      return Response.json({
        stock: stock.sort(byNew('created_date')).map(leaderView),
        summary: await stockSummary(b),
        reserved: reserved.map(leaderView),
        given: given.sort(byNew('assigned_at')).map(leaderView),
        waiting
      });
    }

    if (action === 'addStock') {
      const label = cleanLabel(p.label);
      if (!label) throw new UserError('Give the codes a prize name, like "500 GP Code".');
      const lines = String(p.codes || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
      if (!lines.length) throw new UserError('Paste at least one code, one per line.');
      if (lines.length > MAX_STOCK_ADD) throw new UserError(`Add up to ${MAX_STOCK_ADD} codes at a time.`);
      const added = [], skipped = [];
      await runStockLocked(b, async () => {
        // Check every code first (one read of the known fingerprints), then save them.
        const known = new Set((await E.filter({}, { limit: 5000 })).items.map((r) => r.code_hash));
        const fresh = [];
        for (const line of lines) {
          let code;
          try { code = checkCode(line); } catch (e) { skipped.push({ last4: String(line).slice(-4), why: e.message }); continue; }
          const h = await codeHash(code);
          if (known.has(h)) { skipped.push({ last4: code.slice(-4), why: fresh.some((f) => f.h === h) ? 'Listed twice.' : 'Already added before.' }); continue; }
          known.add(h);
          fresh.push({ code, h });
        }
        // One at a time, so codes are handed out later in the order they were pasted.
        for (const f of fresh) {
          const r = await E.create({ ...(await codeFields(f.code)), label, status: 'stock', added_by: me.id });
          added.push(r.last4);
        }
      });
      return Response.json({ ok: true, added: added.length, skipped, summary: await stockSummary(b) });
    }

    if (action === 'removeStock') {
      const out = await runStockLocked(b, async () => {
        const r = await E.get(String(p.id)).catch(() => null);
        if (!r || r.status !== 'stock') throw new UserError('Only a code still in stock can be removed.');
        await E.delete(r.id);
        return true;
      });
      return Response.json({ ok: out, summary: await stockSummary(b) });
    }

    if (action === 'give') {
      const target = await getMemberByDiscordId(b, String(p.discord_id || ''));
      if (!target) throw new UserError('Pick a member to send the code to.');
      if (target.no_access) throw new UserError("That member doesn't have access to the site right now.");
      if (target.id === me.id) throw new UserError("You can't give a prize code to yourself.");
      const label = cleanLabel(p.label);
      if (!label) throw new UserError('Give the prize a name, like "500 GP Code".');
      const reason = cleanReason(p.reason);
      const row = await runStockLocked(b, async () => {
        if (p.from_stock === true) {
          const s = await takeFromStock(b, label);
          if (!s) throw new UserError(`No "${label}" codes left in stock.`);
          return E.update(s.id, { status: 'reserved', raffle_id: '', place: 0 }); // taken out of stock under the lock
        }
        const code = checkCode(p.code);
        await assertNewCode(b, code);
        return E.create({ ...(await codeFields(code)), label, status: 'reserved', added_by: me.id });
      });
      let r;
      try {
        r = await assignAndDeliver(b, row, target, { source: 'admin', reason, label, raffle_id: '', raffle_title: '', place: 0 });
      } catch (e) {
        // Not given after all: put a stock code back, forget a typed one.
        const cur = await E.get(row.id).catch(() => null);
        if (cur && cur.status !== 'assigned') {
          if (p.from_stock === true) await E.update(row.id, { status: 'stock' }).catch(() => {});
          else await E.delete(row.id).catch(() => {});
        }
        throw e;
      }
      return Response.json({ ok: true, prize: leaderView(r) });
    }

    if (action === 'retryDm') {
      const r = await E.get(String(p.id)).catch(() => null);
      if (!r || r.status !== 'assigned') throw new UserError('Only a code that was given can be sent again.');
      const updated = await withRecordLock(b, 'PrizeCode', r.id, () => deliver(b, r), 30000);
      return Response.json({ ok: true, prize: leaderView(updated) });
    }

    if (action === 'replace') {
      const code = checkCode(p.code);
      const updated = await withRecordLock(b, 'PrizeCode', String(p.id), async () => {
        const r = await E.get(String(p.id)).catch(() => null);
        if (!r || r.status !== 'assigned') throw new UserError('Only a code that was given can be replaced.');
        await assertNewCode(b, code, r.id);
        const fields = await codeFields(code);
        // A wrong code was given: give the right one and send it again.
        const fresh = await E.update(r.id, { ...fields, opened_at: '', redeemed_at: '', dm_status: 'pending' });
        return deliver(b, fresh);
      }, 30000);
      return Response.json({ ok: true, prize: leaderView(updated) });
    }

    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}