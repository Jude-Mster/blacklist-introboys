// 6.16: many screens polling at once share one read; your own bet shows straight away.
import { member, settings, call, ok, done, advance } from './h.ts';
import * as h0 from './h.ts';
const g = globalThis as any;
g.__settingsCacheMs = 30000; // as on the live site (the other tests turn the cache off)
const arena = (await import('../base44/functions/arenaAction/entry.ts')).default;
const chat = (await import('../base44/functions/getChatMessages/entry.ts')).default;
const offeredKey = (o) => (o.a > 1 ? 'a' : o.b > 1 ? 'b' : ((o.side || []).find((x) => x.price > 1) || { id: 'lenover' }).id);

await settings({ games_enabled: ['arena'] });
const crowd = [];
for (let i = 0; i < 20; i++) crowd.push(await member('W' + i, 50000));
const s0 = await call(arena, crowd[0], { action: 'state' });
ok(s0.status === 200, 'state works');
// warm: every member seen once (their session and member row)
await Promise.all(crowd.map((m) => call(arena, m, { action: 'state' })));
await Promise.all(crowd.map((m) => call(arena, m, { action: 'pulse', scope: 'live', here: true })));

// your own bet is on the board at once, even though the board is shared
const sb = await call(arena, crowd[5], { action: 'state' });
const k = offeredKey(sb.table.odds);
const r = await call(arena, crowd[5], { action: 'bet', round: sb.table.round_no, lines: [{ k, amount: 100 }] });
ok(r.status === 200, `bet placed ${r.error || ''}`);
const s1 = await call(arena, crowd[5], { action: 'state' });
ok(s1.mine && s1.mine.amount === 100, `own bet shows straight away (${JSON.stringify(s1.mine)})`);
const s2 = await call(arena, crowd[6], { action: 'state' });
ok(s2.bets.some((x) => x.amount === 100 && !x.mine), "others see it too, as someone else's");
advance(6000); // past the shared answers' life, still inside the 20 s member reuse
let c0 = g.__calls;
await Promise.all(crowd.map((m) => call(arena, m, { action: 'state' })));
const stateCalls = g.__calls - c0;
ok(stateCalls <= 4, `20 screens asking for the table at once: ${stateCalls} database calls (was about 40)`);
advance(6000);
c0 = g.__calls;
await Promise.all(crowd.map((m) => call(arena, m, { action: 'pulse', scope: 'live' })));
const pulseCalls = g.__calls - c0;
ok(pulseCalls <= 4, `20 crowd checks at once: ${pulseCalls} database calls (was about 40)`);
const p = await call(arena, crowd[3], { action: 'pulse', scope: 'live' });
ok(p.watching === 20, `all 20 counted as watching (${p.watching})`);
advance(6000);
c0 = g.__calls;
await Promise.all(crowd.map((m) => call(chat, m, { channel: 'guild' })));
ok(g.__calls - c0 <= 2, `20 chat checks at once: ${g.__calls - c0} database calls`);

// an emoji shows for everyone right away
const e = await call(arena, crowd[7], { action: 'react', scope: 'live', emoji: '🔥' });
ok(e.status === 200, 'emoji sent');
const p2 = await call(arena, crowd[8], { action: 'pulse', scope: 'live' });
ok(p2.reactions.some((x) => x.emoji === '🔥'), 'emoji seen by the next screen');
const e2 = await call(arena, crowd[7], { action: 'react', scope: 'live', emoji: '🔥' });
ok(e2.status === 429, 'one emoji at a time still holds');
// the moment betting closes, every screen notices at once: only one of them does the work
let sNow = await call(arena, crowd[0], { action: 'state' });
for (let i = 0; i < 120 && !(sNow.table.status === 'betting' && Date.parse(sNow.table.bets_close_at) - Date.now() > 2000); i++) { advance(1000); sNow = await call(arena, crowd[0], { action: 'state' }); }
ok(sNow.table.status === 'betting', 'a fresh round is open for the close test');
advance(Math.max(0, Date.parse(sNow.table.bets_close_at) - Date.now()) + 500);
g.__byOp = {};
const at = await Promise.all(crowd.map((m) => call(arena, m, { action: 'state' })));
const lockOps = Object.entries(g.__byOp).filter(([k]) => k.startsWith('Lock.')).reduce((a, [, v]: any) => a + v, 0);
g.__byOp = null;
ok(at.every((x) => x.status === 200), 'all 20 screens answered at the close');
ok(lockOps <= 6, `20 screens at the close: ${lockOps} lock calls (each screen used to try the lock: about 80)`);
// a refused settings read must not leave a failure nobody handles (that stops the whole running copy)
const pts = await import('../base44/shared/points.ts');
pts.clearSettingsCache();
let refuse = 1;
g.__gate = () => { if (refuse > 0) { refuse--; const e: any = new Error('Rate limit exceeded'); e.status = 400; throw e; } };
const tries = await Promise.allSettled([pts.getSettings(h0.b)]);
g.__gate = null;
await new Promise((r) => setTimeout(r, 50));
ok(tries.some((x) => x.status === 'rejected') && (await pts.getSettings(h0.b)) != null, 'a refused settings read fails only its own request (nothing left unhandled), and the next one works');
done();
