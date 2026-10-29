// 6.49: the phone app's updates come from the file the leader links in Admin (read from the file itself).
import { E, settings, call, ok, done } from './h.ts';
import botAuth from '../base44/functions/botAuth/entry.ts';
import { readApk } from '../base44/shared/apkInfo.ts';

const apk = await Deno.readFile(new URL('../public/app/introboys.apk', import.meta.url));
const other = await Deno.readFile(new URL('../public/app/blacklist-introboys.apk', import.meta.url));
let served: Uint8Array = apk, reads = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (u: any, o: any) => {
  if (String(u).startsWith('https://dl.example/')) { reads++; return new Response(served as any, { headers: { 'content-length': String(served.length) } }); }
  if (String(u).startsWith('https://bad.example/')) return new Response('<html>not an apk</html>');
  return realFetch(u, o);
}) as any;

const info = await readApk(apk);
ok(info.package === 'com.blacklistintroboys.guild' && info.versionCode > 0 && /^[0-9a-f]{64}$/.test(info.sha256), `the app file is read (${info.versionName}, build ${info.versionCode})`);
const o = await readApk(other);
ok(o.package === 'com.blacklistintroboys.app', 'another app is told apart by its package');

await settings({});
let r = await call(botAuth, null, { action: 'appUpdate' });
ok(r.ok && r.offered === false, 'no link: nothing offered');

const s = (await E.Settings.list())[0];
await E.Settings.update(s.id, { app_download_url: 'https://dl.example/INTROBOYS.apk?dl=1' });
r = await call(botAuth, null, { action: 'appUpdate' });
ok(r.offered === true && r.versionCode === info.versionCode && r.sha256 === info.sha256 && r.size === apk.length && r.url.startsWith('https://dl.example/'), 'a linked file is offered with its own build number and checksum');
r = await call(botAuth, null, { action: 'appUpdate' });
ok(reads === 1 && r.offered === true, 'the file is read once, not on every look');

served = other;
await E.Settings.update(s.id, { app_meta_at: new Date(Date.now() - 3600000).toISOString() });
r = await call(botAuth, null, { action: 'appUpdate' });
ok(reads === 2 && r.offered === false, 'after 20 minutes it is read again; another app behind the link is not offered');

await E.Settings.update(s.id, { app_download_url: 'https://bad.example/page' });
r = await call(botAuth, null, { action: 'appUpdate' });
ok(r.offered === false && /not an app file/.test(r.why || ''), 'a link that is no APK is not offered, and says why');
done();
