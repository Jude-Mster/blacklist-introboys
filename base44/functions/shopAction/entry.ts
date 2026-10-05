import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser } from '../../shared/session.ts';
import {
  getSettings, getMemberByUserId, changePoints, withMemberLock, withRecordLock, UserError, errorResponse, clearSettingsCache
} from '../../shared/points.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import { resilient } from '../../shared/points.ts';

// The guild shop.
//   1 point = 1 CP = 0.5 GP = 1M silver (in-game value)
//   Shop price   = in-game value in CP x shop_price_multiplier (default 2), rounded up
//   Tax          = shop_tax_pct (default 10%) added ON TOP, rounded up, removed from circulation
//   Points cannot be bought. They are earned in the guild and spent here.
// Every order is fulfilled by hand by the Guild Leader, who is the only one who
// can complete or reject orders and edit the catalog and rates.

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

const unitPrice = (item, r) => Math.max(1, ceil(num(item.value_cp, 0) * r.price_multiplier));

function quote(item, qty: number, r) {
  const unit = unitPrice(item, r);
  const subtotal = unit * qty;
  const tax = ceil((subtotal * r.tax_pct) / 100);
  return { unit, subtotal, tax, total: subtotal + tax };
}

const publicItem = (it, r) => {
  const q = quote(it, 1, r);
  return {
    id: it.id, name: it.name, category: it.category || '', description: it.description || '', image_url: it.image_url || '',
    stock: Math.max(0, it.stock || 0), require_note: !!it.require_note, sort: it.sort || 0,
    price: q.unit, tax: q.tax, total: q.total
  };
};
const adminItem = (it, r) => ({ ...publicItem(it, r), value_cp: num(it.value_cp, 0), active: it.active !== false });

const ORDER_FIELDS = [
  'id', 'kind', 'status', 'created_date', 'resolved_at', 'character_name', 'note', 'item_name', 'item_image', 'qty',
  'unit_price', 'subtotal', 'tax', 'total', 'points', 'pay_currency', 'pay_cp', 'tax_cp', 'delivery_code', 'admin_note'
];
const myOrder = (o) => Object.fromEntries(ORDER_FIELDS.map((k) => [k, o[k]]));
const adminOrder = (o) => ({ ...myOrder(o), member_id: o.member_id, discord_id: o.discord_id, member_name: o.member_name, member_avatar: o.member_avatar, item_id: o.item_id });

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
      const [{ items }, { items: orders }] = await Promise.all([
        Items.filter({ active: true }, { sort: 'sort', limit: 300 }),
        Orders.filter({ member_id: me.id }, { sort: '-created_date', limit: 40 })
      ]);
      return Response.json({
        rates: r,
        balance: me.points || 0,
        items: items.map((it) => publicItem(it, r)).sort((a, c) => a.sort - c.sort),
        orders: orders.map(myOrder)
      });
    }

    if (action === 'buy') {
      if (!r.enabled) throw new UserError('The shop is closed right now.');
      if (me.banned) throw new UserError('You are banned from the shop.', 403);
      const qty = Math.floor(Number(p.qty));
      if (!Number.isInteger(qty) || qty < 1 || qty > 100000) throw new UserError('Enter how many you want.');
      const character = text(p.character, 40);
      if (!character) throw new UserError('Enter your in-game character name so the leader knows who to deliver to.');
      const note = text(p.note, 200);
      const itemId = String(p.itemId || '');
      if (!itemId) throw new UserError('Pick an item.');

      const result = await withMemberLock(b, me.id, () => withRecordLock(b, 'ShopItem', itemId, async () => {
        const item = await Items.get(itemId);
        if (!item || item.active === false) throw new UserError('That item is no longer for sale.');
        if (item.require_note && !note) throw new UserError('Add a note saying exactly which one you want.');
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
            kind: 'item', status: 'pending', member_id: me.id, discord_id: me.discord_id,
            member_name: me.discord_name || me.discord_id, member_avatar: me.avatar_url || '',
            character_name: character, note, item_id: item.id, item_name: item.name, item_image: item.image_url || '',
            qty, unit_price: q.unit, subtotal: q.subtotal, tax: q.tax, total: q.total
          });
          return { balance, order: myOrder(order) };
        } catch (e) {
          // Something failed after the points were taken: give them back and restore stock.
          await changePoints(b, me.id, q.total, 'shop', `Shop refund: ${qty} x ${item.name}`, null).catch(() => {});
          await Items.update(item.id, { stock }).catch(() => {});
          throw e;
        }
      }));
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
      const [{ items }, { items: pending }, { items: recent }] = await Promise.all([
        Items.filter({}, { sort: 'sort', limit: 500 }),
        Orders.filter({ status: 'pending' }, { sort: 'created_date', limit: 200 }),
        Orders.filter({ status: { $ne: 'pending' } }, { sort: '-created_date', limit: 40 })
      ]);
      return Response.json({
        rates: r,
        items: items.map((it) => adminItem(it, r)).sort((a, c) => a.sort - c.sort),
        pending: pending.map(adminOrder),
        recent: recent.map(adminOrder)
      });
    }

    if (action === 'complete' || action === 'reject') {
      leaderOnly();
      const id = String(p.orderId || '');
      const adminNote = text(p.adminNote, 300);
      const code = text(p.code, 200);
      await withRecordLock(b, 'ShopOrder', id, async () => {
        const o = await Orders.get(id);
        if (!o) throw new UserError('Order not found.', 404);
        if (o.status !== 'pending') throw new UserError('That order is already settled.');
        const done = { resolved_at: new Date().toISOString(), admin_note: adminNote };
        if (action === 'complete') {
          // Buying points was removed from the shop. An old request can only be rejected.
          if (o.kind !== 'item') throw new UserError('Buying points is no longer available. Reject this request instead.');
          await Orders.update(o.id, { ...done, status: 'completed', delivery_code: code });
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
      return Response.json({ ok: true });
    }

    if (action === 'saveItem') {
      leaderOnly();
      const d = p.item || {};
      const name = text(d.name, 60);
      if (!name) throw new UserError('Give the item a name.');
      const value = Number(d.value_cp);
      if (!Number.isFinite(value) || value <= 0 || value > 100000000) throw new UserError('In-game value must be a number above 0 (in CP).');
      const stock = Math.floor(Number(d.stock));
      if (!Number.isInteger(stock) || stock < 0 || stock > 100000000) throw new UserError('Stock must be 0 or more.');
      const image = text(d.image_url, 500);
      if (image && !/^(\/[A-Za-z0-9_\-./]+|https:\/\/[^\s]+)$/.test(image)) throw new UserError('Picture must be a site path like /shop/item.png or an https link.');
      const fields = {
        name, category: text(d.category, 40), description: text(d.description, 200), image_url: image,
        value_cp: value, stock, active: d.active !== false, require_note: d.require_note === true,
        sort: Number.isFinite(Number(d.sort)) ? Math.floor(Number(d.sort)) : 0
      };
      if (d.id) {
        const id = String(d.id);
        await withRecordLock(b, 'ShopItem', id, () => Items.update(id, fields));
      } else {
        await Items.create(fields);
      }
      return Response.json({ ok: true });
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