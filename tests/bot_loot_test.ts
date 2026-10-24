// 6.42: the app reports what it looted; the member's Assistant page shows the totals.
import { member, settings, call, E, ok, done, advance } from './h.ts';
const g = globalThis as any;
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))));
g.__secrets = { BOT_LICENSE_PRIVATE_KEY: pkcs8, SITE_URL: 'https://site.test' };
const bot = (await import('../base44/functions/botAuth/entry.ts')).default;
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((x) => x.toString(16).padStart(2, '0')).join('');
async function app(body, token = '') {
  const req = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-bot-token': token } : {}) }, body: JSON.stringify(body) });
  const res = await bot(req);
  return { status: res.status, ...(await res.json()) };
}
async function signIn(who, hwid) {
  const s = await app({ action: 'start', hwid, app_version: '4.9.4' });
  await call(bot, who, { action: 'approve', code: s.user_code, deviceTag: s.device_tag });
  return (await app({ action: 'poll', device_secret: s.device_secret })).token;
}

await settings({ games_enabled: ['shop'], shop_seeded: true });
const L = await member('Leader', 1000, 'leader');
const A = await member('Alice', 1000), B = await member('Bob', 1000);
await call(bot, L, { action: 'adminGrant', discordId: A.discord_id, days: 5 });
const PC = hex(32);
const tok = await signIn(A, PC);
ok(!!tok, 'Alice signs the app in');
ok((await app({ action: 'check', hwid: PC, nonce: hex(16) }, tok)).licensed, 'and it runs licensed on her PC');

const now = new Date().toISOString();
const r1 = await app({ action: 'lootPush', batch: 'b1', items: [
  { name: 'Ancient Platinum Elixir', qty: 1, dungeon: 'labyrinth', boss: 2, at: now },
  { name: '[Pet Lucky Box]', qty: 2, dungeon: 'labyrinth', boss: 2, at: now },
  { name: '<script>x</script>\u0007', qty: 9999, dungeon: 'evil', boss: 99, at: '1999-01-01T00:00:00Z' }
] }, tok);
ok(r1.status === 200 && r1.saved === 3, `the app reports 3 pick-ups (${r1.status} ${r1.saved})`);
ok((await app({ action: 'lootPush', batch: 'b1', items: [{ name: 'Ancient Platinum Elixir' }] }, tok)).duplicate === true, 'the same report sent again is not counted twice');
await app({ action: 'lootPush', batch: 'b2', items: [{ name: 'Ancient Platinum Elixir', dungeon: 'den', boss: 6 }] }, tok);
ok((await app({ action: 'lootPush', items: [{ name: 'x' }] })).status === 401, 'without a signed-in app nothing is saved');

const rows = (await E.BotLoot.filter({ member_id: A.id }, {})).items;
const evil = rows.find((r) => r.name.includes('script'));
ok(rows.length === 4, `4 rows saved (${rows.length})`);
ok(evil && !/[<>\u0007]/.test(evil.name) && evil.qty === 999 && evil.dungeon === 'labyrinth' && evil.boss === 6 && Date.parse(evil.at) > Date.now() - 86400_000, 'names are cleaned and numbers, places and times are kept in range');

const v = await call(bot, A, { action: 'lootView' });
ok(v.status === 200 && v.total === 1 + 2 + 999 + 1 && v.today === v.total && v.kinds === 3, `Alice sees her totals (${v.total}, ${v.kinds} kinds)`);
ok(v.items[0].qty === 999 && v.items.find((i) => i.name === 'Ancient Platinum Elixir').qty === 2, 'per item, most first');
ok(v.recent.length === 4 && v.recent.some((x) => x.dungeon === 'den' && x.boss === 6), 'the latest pick-ups with where they came from');
ok(v.seats.length === 1 && v.seats[0] === 1, 'from device 1');
const vb = await call(bot, B, { action: 'lootView' });
ok(vb.status === 200 && vb.total === 0 && vb.items.length === 0, 'Bob sees only his own (none)');
advance(8 * 86400_000);
const v2 = await call(bot, A, { action: 'lootView' });
ok(v2.total === v.total && v2.today === 0 && v2.week === 0, 'a week later: still in the all-time total, not in today or this week');

// a member without an active license: the report is accepted but nothing is kept
await call(bot, L, { action: 'adminRevoke', discordId: A.discord_id });
const r3 = await app({ action: 'lootPush', batch: 'b3', items: [{ name: 'x' }] }, tok);
const kept = (await E.BotLoot.filter({ member_id: A.id }, {})).items.length;
ok((r3.status === 401 || r3.saved === 0) && kept === 4, `a switched-off license keeps no loot (${r3.status}, ${kept} rows)`);
done();
