import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, UserError, errorResponse, clearSettingsCache
} from '../../shared/points.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import {
  checkCode, codeHash, codeFields, cleanLabel, ownerView, runStockLocked, stockSummary, deliver, last4
} from '../../shared/prizeCodes.ts';
import { resilient } from '../../shared/points.ts';

// The guild shop.
//   1 point = 1 CP = 0.5 GP = 1M silver (in-game value)
//   Shop price   = in-game value in CP x shop_price_multiplier (default 2), rounded up
//   Tax          = shop_tax_pct (default 10%) added ON TOP, rounded up, removed from circulation
//   Points cannot be bought. They are earned in the guild and spent here.
// Every order is fulfilled by hand by the Guild Leader, who is the only one who
// can complete or reject orders and edit the catalog and rates.
//
// GP codes (an item with gp_code on) are the exception. The leader sets what one code is worth in GP
// (its value is then worth x 2 CP) and where the codes come from:
//   stock   taken from the prize-code stock under the item's code name. The buyer sees the code the
//           moment they pay (and gets it by Discord DM and in My prizes). The item's stock is the number
//           of codes waiting. The leader can paste codes in from the shop's item editor too.
//   manual  the order waits; the leader types the code(s) when completing it, and the buyer sees them then.
// Codes are stored encrypted (shared/prizeCodes.ts) and are never shown in full to anyone but the buyer.

const CP_PER_GP = 2;          // 1 GP = 2 CP
const SILVER_M_PER_CP = 1;    // 1 CP = 1M silver
const EPS = 1e-9;

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const ceil = (n: number) => Math.ceil(n - EPS);
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function rates(settings) {
  const tax = Math.min(Math.max(num(settings.shop_tax_pct, 10), 0), 100);
  const mult = num(settings.shop_price_multiplier, 2);
  const buy = num(settings.shop_buy_rate, 1);
  return {
    enabled: settings.shop_enabled !== false,
    tax_pct: tax,
    price_multiplier: mult > 0 ? mult : 2,
    buy_rate: buy > 0 ? buy : 1,
    cp_per_gp: CP_PER_GP,
    silver_m_per_cp: SILVER_M_PER_CP
  };
}

const isCode = (it) => !!(it && it.gp_code);
const codeSource = (it) => (it && it.code_source === 'manual' ? 'manual' : 'stock');
const codeLabelOf = (it) => cleanLabel(it && it.code_label) || `${fmtN(it && it.gp_worth)} GP Code`;
function fmtN(v) { return Number(v || 0).toLocaleString('en-US'); }
// A GP code's value always follows its worth: 1 GP = 2 CP.
const valueOf = (it) => (isCode(it) ? num(it.gp_worth, 0) * CP_PER_GP : num(it.value_cp, 0));
const unitPrice = (item, r) => Math.max(1, ceil(valueOf(item) * r.price_multiplier));
// What a member can buy right now: codes waiting in stock for a stock code item, else the item's own stock.
const stockOf = (it, codes) => (isCode(it) && codeSource(it) === 'stock' ? (codes.get(codeLabelOf(it).toLowerCase()) || 0) : Math.max(0, it.stock || 0));
async function codeCounts(b) {
  const m = new Map();
  for (const x of await stockSummary(b)) m.set(x.label.toLowerCase(), x.count);
  return m;
}

function quote(item, qty: number, r) {
  const unit = unitPrice(item, r);
  const subtotal = unit * qty;
  const tax = ceil((subtotal * r.tax_pct) / 100);
  return { unit, subtotal, tax, total: subtotal + tax };
}

const publicItem = (it, r, codes) => {
  const q = quote(it, 1, r);
  return {
    id: it.id, name: it.name, category: it.category || '', description: it.description || '', image_url: it.image_url || '',
    stock: stockOf(it, codes), require_note: !!it.require_note, sort: it.sort || 0,
    price: q.unit, tax: q.tax, total: q.total,
    gp_code: isCode(it), gp_worth: isCode(it) ? num(it.gp_worth, 0) : 0, code_source: isCode(it) ? codeSource(it) : ''
  };
};
const adminItem = (it, r, codes) => ({
  ...publicItem(it, r, codes), value_cp: valueOf(it), active: it.active !== false,
  code_label: isCode(it) ? codeLabelOf(it) : '', own_stock: Math.max(0, it.stock || 0)
});

const ORDER_FIELDS = [
  'id', 'kind', 'status', 'created_date', 'resolved_at', 'character_name', 'note', 'item_name', 'item_image', 'qty',
  'unit_price', 'subtotal', 'tax', 'total', 'points', 'pay_currency', 'pay_cp', 'tax_cp', 'delivery_code', 'admin_note',
  'gp_code', 'gp_worth', 'code_source', 'code_label'
];
const myOrder = (o) => Object.fromEntries(ORDER_FIELDS.map((k) => [k, o[k]]));
// The leader only ever sees the last four characters of a code.
const adminOrder = (o) => ({
  ...myOrder(o), member_id: o.member_id, discord_id: o.discord_id, member_name: o.member_name, member_avatar: o.member_avatar, item_id: o.item_id,
  code_last4: Array.isArray(o.code_last4) ? o.code_last4 : []
});
// The buyer's view of an order, with their codes in full.
async function buyerOrder(o, rows) {
  const out: any = myOrder(o);
  if (Array.isArray(o.code_ids) && o.code_ids.length) {
    out.codes = await Promise.all(o.code_ids.map((id) => rows.get(id)).filter(Boolean).map(async (r) => {
      const v = await ownerView(r);
      return { id: v.id, code: v.code, last4: v.last4, label: v.label, redeemed_at: v.redeemed_at, redeem_url: v.redeem_url };
    }));
  }
  return out;
}
async function myCodeRows(b, memberId) {
  const { items } = await b.asServiceRole.entities.PrizeCode.filter({ member_id: memberId, status: 'assigned' }, { limit: 500 });
  return new Map(items.map((r) => [r.id, r]));
}
const MAX_CODES_PER_ORDER = 20;
// Paste box -> list of codes (one per line, or separated by commas or semicolons).
const splitCodes = (raw) => (Array.isArray(raw) ? raw : String(raw || '').split(/[\n,;]+/)).map((x) => String(x).trim()).filter(Boolean);

// The starting catalog. value_cp is the in-game value of one piece in CP.
const SEED = [
  ['3% Tin', 'Materials', 'tin-3', 5, 150],
  ['6% Tin', 'Materials', 'tin-6', 10, 150],
  ['9% Tin', 'Materials', 'tin-9', 20, 150],
  ['12% Tin', 'Materials', 'tin-12', 50, 30],
  ['Red Jade', 'Materials', 'red-jade', 25, 50],
  ['2x EXP Booster (L) 3 hours', 'Boosts and passes', 'exp-booster', 36, 20],
  ['Awareness 2x EXP 3 hours', 'Boosts and passes', 'awareness-exp', 52, 20],
  ['Any Suit/Deco', 'Boosts and passes', 'suit-deco', 488, 5, true],
  ['Stats Reset (L)', 'Boosts and passes', 'stats-reset', 508, 5],
  ['7 Day Premium', 'Boosts and passes', 'premium-7day', 990, 5],
  ['Premium Pass', 'Boosts and passes', 'premium-pass', 2308, 2],
  ['GT Epic Ring A6', 'Gear', 'gt-ring-a6', 700, 1],
  ['200% Bee', 'Gear', 'bee-200', 900, 1],
  ['GT Epic LS A3', 'Gear', 'gt-ls-a3', 1000, 1],
  ['GT Epic Ring A30', 'Gear', 'gt-ring-a30', 1400, 1],
  ['GT Epic Amulet A30', 'Gear', 'gt-amulet-a30', 1400, 1],
  ['500 GP Code', 'Currency', 'gp-code-500', 1000, 2],
  // Listed but hidden with no stock until the leader sets them up.
  ['CP (per 1 CP)', 'Currency', '', 1, 0, false, false],
  ['Silver (per 1M)', 'Currency', '', 1, 0, false, false],
  ['100 GP Ticket', 'Currency', '', 200, 0, false, false],
  ['1000 GP Code', 'Currency', '', 2000, 0, false, false]
];

async function seedCatalog(b, settings) {
  if (settings.shop_seeded) return;
  // Flag first so two requests at once can't both seed.
  await b.asServiceRole.entities.Settings.update(settings.id, { shop_seeded: true });
  clearSettingsCache();
  const { items } = await b.asServiceRole.entities.ShopItem.filter({}, { limit: 1 });
  if (items.length > 0) return;
  let sort = 10;
  for (const [name, category, img, value_cp, stock, require_note = false, active = true] of SEED) {
    await b.asServiceRole.entities.ShopItem.create({
      name, category, description: '', image_url: img ? `/shop/${img}.png` : '', value_cp, stock,
      active, require_note, sort
    });
    sort += 10;
  }
}

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const user = await sessionUser(b, req);
    if (!user) throw new UserError('Link your Discord first.', 401);
    let p; try { p = await req.json(); } catch { p = {}; }
    const action = p.action;
    if (action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const me = await getMemberByUserId(b, user.id);
    if (!me) throw new UserError('Link your Discord first.', 401);
    const leader = me.role === 'leader';
    const leaderOnly = () => { if (!leader) throw new UserError('Only the Guild Leader can do that.', 403); };

    let settings = await getSettings(b);
    if (leader && !settings.shop_seeded) { await seedCatalog(b, settings); settings = await getSettings(b); }
    const r = rates(settings);
    const Items = b.asServiceRole.entities.ShopItem;
    const Orders = b.asServiceRole.entities.ShopOrder;

    // ---------- members ----------

    if (action === 'catalog') {
      const [{ items }, { items: orders }, codes] = await Promise.all([
        Items.filter({ active: true }, { sort: 'sort', limit: 300 }),
        Orders.filter({ member_id: me.id }, { sort: '-created_date', limit: 40 }),
        codeCounts(b)
      ]);
      const rows = orders.some((o) => Array.isArray(o.code_ids) && o.code_ids.length) ? await myCodeRows(b, me.id) : new Map();
      return Response.json({
        rates: r,
        balance: me.points || 0,
        items: items.map((it) => publicItem(it, r, codes)).sort((a, c) => a.sort - c.sort),
        orders: await Promise.all(orders.map((o) => buyerOrder(o, rows)))
      });
    }

    if (action === 'buy') {
      if (!r.enabled) throw new UserError('The shop is closed right now.');
      if (me.banned) throw new UserError('You are banned from the shop.', 403);
      const qty = Number(p.qty);   // a whole number only (1.5 is refused, not rounded down)
      if (!Number.isInteger(qty) || qty < 1 || qty > 100000) throw new UserError('Enter how many you want.');
      const character = text(p.character, 40);
      const note = text(p.note, 200);
      const itemId = String(p.itemId || '');
      if (!itemId) throw new UserError('Pick an item.');

      const orderBase = (item, q) => ({
        kind: 'item', member_id: me.id, discord_id: me.discord_id,
        member_name: me.discord_name || me.discord_id, member_avatar: me.avatar_url || '',
        character_name: character, note, item_id: item.id, item_name: item.name, item_image: item.image_url || '',
        qty, unit_price: q.unit, subtotal: q.subtotal, tax: q.tax, total: q.total
      });
      const codeOrderFields = (item) => ({ gp_code: true, gp_worth: num(item.gp_worth, 0), code_source: codeSource(item), code_label: codeLabelOf(item) });

      // A GP code from stock: the codes are set aside, the points taken and the codes handed over in one go,
      // under the member's lock, the item's lock and the stock lock (always taken in that order).
      const buyStockCodes = (item) => runStockLocked(b, async () => {
        const P = b.asServiceRole.entities.PrizeCode;
        const label = codeLabelOf(item);
        const { items: waiting } = await P.filter({ status: 'stock' }, { limit: 2000 });
        const pick = waiting.filter((x) => cleanLabel(x.label).toLowerCase() === label.toLowerCase())
          .sort((x, y) => String(x.created_date || x.id).localeCompare(String(y.created_date || y.id)));
        if (pick.length < 1) throw new UserError('Sold out.');
        if (qty > pick.length) throw new UserError(`Only ${pick.length} left.`);
        const q = quote(item, qty, r);
        if (p.expectTotal !== undefined && Number(p.expectTotal) !== q.total) {
          throw new UserError('The price changed. Check the new price and try again.', 409);
        }
        const rows = pick.slice(0, qty);
        const { balance } = await changePoints(b, me.id, -q.total, 'shop', `Shop: ${qty} x ${item.name}`, null);
        const done = [];
        try {
          const at = new Date().toISOString();
          for (const row of rows) {
            done.push(await P.update(row.id, {
              status: 'assigned', source: 'shop', member_id: me.id, member_name: me.discord_name || me.discord_id || '',
              discord_id: String(me.discord_id || ''), assigned_at: at, opened_at: at, redeemed_at: '',
              reason: `Bought in the guild shop: ${item.name}`, raffle_id: '', raffle_title: '', place: 0,
              dm_status: 'pending', dm_at: '', push_sent: false
            }));
          }
          const order = await Orders.create({
            ...orderBase(item, q), ...codeOrderFields(item), status: 'completed', resolved_at: at,
            code_ids: done.map((x) => x.id), code_last4: done.map((x) => x.last4)
          });
          given.push(...done);
          return { balance, order: await buyerOrder(order, new Map(done.map((x) => [x.id, x]))) };
        } catch (e) {
          // Something failed after the points were taken: points back, codes back on the shelf.
          await changePoints(b, me.id, q.total, 'shop', `Shop refund: ${qty} x ${item.name}`, null).catch(() => {});
          for (const row of rows) {
            await P.update(row.id, { status: 'stock', source: '', member_id: '', member_name: '', discord_id: '', assigned_at: '', opened_at: '', reason: '', dm_status: '' }).catch(() => {});
          }
          throw e;
        }
      });

      const given = [];   // stock codes handed over by this purchase: sent by DM once the locks are let go
      const result = await withMemberLock(b, me.id, () => withRecordLock(b, 'ShopItem', itemId, async () => {
        const item = await Items.get(itemId).catch(() => null);
        if (!item || item.active === false) throw new UserError('That item is no longer for sale.');
        // A GP code is shown on the site, so it needs no character name.
        if (!character && !isCode(item)) throw new UserError('Enter your in-game character name so the leader knows who to deliver to.');
        if (item.require_note && !note) throw new UserError('Add a note saying exactly which one you want.');
        if (isCode(item)) {
          if (!(num(item.gp_worth, 0) > 0)) throw new UserError('That item is not set up yet.');
          if (qty > MAX_CODES_PER_ORDER) throw new UserError(`Buy up to ${MAX_CODES_PER_ORDER} codes at a time.`);
          if (codeSource(item) === 'stock') return buyStockCodes(item);
        }
        const stock = Math.max(0, item.stock || 0);
        if (stock < 1) throw new UserError('Sold out.');
        if (qty > stock) throw new UserError(`Only ${stock} left.`);
        const q = quote(item, qty, r);
        // The price shown to the member must still be the price charged.
        if (p.expectTotal !== undefined && Number(p.expectTotal) !== q.total) {
          throw new UserError('The price changed. Check the new price and try again.', 409);
        }
        const { balance } = await changePoints(b, me.id, -q.total, 'shop', `Shop: ${qty} x ${item.name}`, null);
        try {
          await Items.update(item.id, { stock: stock - qty });
          const order = await Orders.create({
            ...orderBase(item, q), status: 'pending',
            ...(isCode(item) ? codeOrderFields(item) : {})
          });
          return { balance, order: myOrder(order) };
        } catch (e) {
          // Something failed after the points were taken: give them back and restore stock.
          await changePoints(b, me.id, q.total, 'shop', `Shop refund: ${qty} x ${item.name}`, null).catch(() => {});
          await Items.update(item.id, { stock }).catch(() => {});
          throw e;
        }
      }));
      // The DM and the phone notice (best effort; the code is already on the site).
      for (const row of given) await deliver(b, row).catch(() => {});
      return Response.json({ ok: true, ...result });
    }

    if (action === 'cancel') {
      // Left over from when points could be bought: lets a member withdraw an old request.
      const id = String(p.orderId || '');
      await withRecordLock(b, 'ShopOrder', id, async () => {
        const o = await Orders.get(id);
        if (!o || o.member_id !== me.id) throw new UserError('Order not found.', 404);
        if (o.kind !== 'points') throw new UserError('Ask the Guild Leader to cancel an item order.');
        if (o.status !== 'pending') throw new UserError('That request is already settled.');
        await Orders.update(o.id, { status: 'cancelled', resolved_at: new Date().toISOString() });
      });
      return Response.json({ ok: true });
    }

    // ---------- Guild Leader ----------

    if (action === 'adminOverview') {
      leaderOnly();
      const [{ items }, { items: pending }, { items: recent }, codes] = await Promise.all([
        Items.filter({}, { sort: 'sort', limit: 500 }),
        Orders.filter({ status: 'pending' }, { sort: 'created_date', limit: 200 }),
        Orders.filter({ status: { $ne: 'pending' } }, { sort: '-created_date', limit: 40 }),
        codeCounts(b)
      ]);
      return Response.json({
        rates: r,
        items: items.map((it) => adminItem(it, r, codes)).sort((a, c) => a.sort - c.sort),
        pending: pending.map(adminOrder),
        recent: recent.map(adminOrder)
      });
    }

    if (action === 'complete' || action === 'reject') {
      leaderOnly();
      const id = String(p.orderId || '');
      const adminNote = text(p.adminNote, 300);
      const code = text(p.code, 200);
      const given = [];
      await withRecordLock(b, 'ShopOrder', id, async () => {
        const o = await Orders.get(id);
        if (!o) throw new UserError('Order not found.', 404);
        if (o.status !== 'pending') throw new UserError('That order is already settled.');
        const done = { resolved_at: new Date().toISOString(), admin_note: adminNote };
        if (action === 'complete') {
          // Buying points was removed from the shop. An old request can only be rejected.
          if (o.kind !== 'item') throw new UserError('Buying points is no longer available. Reject this request instead.');
          if (o.gp_code) {
            // The leader types one code per piece bought. They are saved encrypted and handed to the buyer.
            const list = splitCodes(Array.isArray(p.codes) ? p.codes : p.codes || p.code);
            const want = Math.max(1, o.qty || 1);
            if (list.length !== want) throw new UserError(want === 1 ? 'Type the code for the buyer.' : `Type ${want} codes, one per line (${list.length} typed).`);
            const clean = list.map((x) => checkCode(x));
            const P = b.asServiceRole.entities.PrizeCode;
            await runStockLocked(b, async () => {
              const hashes = await Promise.all(clean.map(codeHash));
              if (new Set(hashes).size !== hashes.length) throw new UserError('The same code is typed twice.');
              for (let k = 0; k < clean.length; k++) {
                const { items: known } = await P.filter({ code_hash: hashes[k] }, { limit: 1 });
                if (known.length) throw new UserError(`The code ending in ${last4(clean[k])} has already been used.`);
              }
              const at = new Date().toISOString();
              for (const c of clean) {
                given.push(await P.create({
                  ...(await codeFields(c)), label: o.code_label || `${fmtN(o.gp_worth)} GP Code`, status: 'assigned', source: 'shop',
                  member_id: o.member_id, member_name: o.member_name || '', discord_id: String(o.discord_id || ''), assigned_at: at,
                  opened_at: '', redeemed_at: '', reason: `Bought in the guild shop: ${o.item_name}`, raffle_id: '', raffle_title: '', place: 0,
                  dm_status: 'pending', dm_at: '', push_sent: false, added_by: me.id
                }));
              }
            });
            try {
              await Orders.update(o.id, { ...done, status: 'completed', code_ids: given.map((x) => x.id), code_last4: given.map((x) => x.last4) });
            } catch (e) {
              for (const g of given) await P.delete(g.id).catch(() => {});
              given.length = 0;
              throw e;
            }
          } else {
            await Orders.update(o.id, { ...done, status: 'completed', delivery_code: code });
          }
        } else {
          if (o.kind === 'item') {
            // Full refund, tax included, and the stock goes back on the shelf.
            await withMemberLock(b, o.member_id, () => changePoints(b, o.member_id, o.total, 'shop', `Shop refund: ${o.qty} x ${o.item_name}`, me.id));
            if (o.item_id) {
              await withRecordLock(b, 'ShopItem', o.item_id, async () => {
                const it = await Items.get(o.item_id);
                if (it) await Items.update(it.id, { stock: Math.max(0, it.stock || 0) + o.qty });
              }).catch(() => {});
            }
          }
          await Orders.update(o.id, { ...done, status: 'rejected' });
        }
      });
      for (const row of given) await deliver(b, row).catch(() => {});
      return Response.json({ ok: true });
    }

    if (action === 'saveItem') {
      leaderOnly();
      const d = p.item || {};
      const name = text(d.name, 60);
      if (!name) throw new UserError('Give the item a name.');
      const gp = d.gp_code === true;
      const worth = Number(d.gp_worth);
      if (gp && (!Number.isInteger(worth) || worth < 1 || worth > 1000000)) throw new UserError('Enter what one code is worth, in GP (a whole number).');
      const source = gp && d.code_source === 'manual' ? 'manual' : 'stock';
      const codeLabel = gp ? (cleanLabel(d.code_label) || `${fmtN(worth)} GP Code`) : '';
      const value = gp ? worth * CP_PER_GP : Number(d.value_cp);
      if (!Number.isFinite(value) || value <= 0 || value > 100000000) throw new UserError('In-game value must be a number above 0 (in CP).');
      const stock = gp && source === 'stock' ? 0 : Number(d.stock);
      if (!Number.isInteger(stock) || stock < 0 || stock > 100000000) throw new UserError('Stock must be a whole number, 0 or more.');
      const image = text(d.image_url, 500);
      if (image && !/^(\/[A-Za-z0-9_\-./]+|https:\/\/[^\s]+)$/.test(image)) throw new UserError('Picture must be a site path like /shop/item.png or an https link.');
      const fields = {
        name, category: text(d.category, 40), description: text(d.description, 200), image_url: image,
        value_cp: value, stock, active: d.active !== false, require_note: d.require_note === true,
        sort: Number.isFinite(Number(d.sort)) ? Math.floor(Number(d.sort)) : 0,
        gp_code: gp, gp_worth: gp ? worth : 0, code_source: gp ? source : '', code_label: codeLabel
      };
      // Codes pasted into the item editor go into the prize-code stock under the item's code name.
      const paste = gp && source === 'stock' ? splitCodes(d.add_codes) : [];
      if (paste.length > 200) throw new UserError('Add up to 200 codes at a time.');
      const clean = paste.map((x) => { try { return checkCode(x); } catch (e) { throw new UserError(`${e.message} (the line ending in ${String(x).slice(-4)})`); } });
      if (d.id) {
        const id = String(d.id);
        await withRecordLock(b, 'ShopItem', id, async () => {
          if (!(await Items.get(id).catch(() => null))) throw new UserError('That item no longer exists.', 404);
          await Items.update(id, fields);
        });
      } else {
        await Items.create(fields);
      }
      let added = 0;
      const skipped = [];
      if (clean.length) {
        const P = b.asServiceRole.entities.PrizeCode;
        await runStockLocked(b, async () => {
          const known = new Set((await P.filter({}, { limit: 5000 })).items.map((x) => x.code_hash));
          for (const c of clean) {
            const h = await codeHash(c);
            if (known.has(h)) { skipped.push(last4(c)); continue; }
            known.add(h);
            await P.create({ ...(await codeFields(c)), label: codeLabel, status: 'stock', added_by: me.id });
            added++;
          }
        });
      }
      return Response.json({ ok: true, added, skipped });
    }

    if (action === 'deleteItem') {
      leaderOnly();
      await Items.delete(String(p.itemId || ''));
      return Response.json({ ok: true });
    }

    if (action === 'saveRates') {
      leaderOnly();
      const d = p.rates || {};
      const tax = Number(d.tax_pct), mult = Number(d.price_multiplier);
      if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new UserError('Tax must be between 0 and 100 percent.');
      if (!Number.isFinite(mult) || mult <= 0 || mult > 1000) throw new UserError('Shop price multiplier must be above 0.');
      await b.asServiceRole.entities.Settings.update(settings.id, {
        shop_tax_pct: tax, shop_price_multiplier: mult, shop_enabled: d.enabled !== false
      });
      clearSettingsCache();
      return Response.json({ ok: true });
    }

    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}