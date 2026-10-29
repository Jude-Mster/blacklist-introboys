// 6.49: what is inside an Android app file (APK) the leader links on the site (Admin, App download link): its package, build number
// and version, its size and checksum. The phone app asks the site for these (botAuth appUpdate), so a new file linked on the site is
// offered as an update in the app at once - before, the app only looked at /app/introboys-android.json, which only changes with a release.
// Nothing of the file is run or kept: it is read once, measured and thrown away. Android itself refuses an update that is not signed
// with the app's own key, so a wrong file can never replace the app.

export type ApkInfo = { package: string; versionCode: number; versionName: string; sha256: string; size: number };

const MAX_BYTES = 120 * 1024 * 1024;

export async function readApkFromUrl(url: string, timeoutMs = 90000): Promise<ApkInfo> {
  if (!/^https:\/\/[^\s]{4,500}$/.test(url)) throw new Error('the link must start with https://');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal });
    if (!res.ok) throw new Error(`the link answered ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('the file is too big for an app');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('the file is too big for an app');
    return await readApk(buf);
  } finally { clearTimeout(t); }
}

export async function readApk(bytes: Uint8Array): Promise<ApkInfo> {
  if (bytes.length < 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('the link is not an app file (APK) - is it a direct download link? (Dropbox: dl=1)');
  const manifest = await zipEntry(bytes, 'AndroidManifest.xml');
  if (!manifest) throw new Error('no AndroidManifest.xml in the file: not an Android app');
  const m = readManifest(manifest);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as any));
  const sha256 = [...hash].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { ...m, sha256, size: bytes.length };
}

// ---------- the zip ----------
async function zipEntry(z: Uint8Array, name: string): Promise<Uint8Array | null> {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  // end of central directory: the last 0x06054b50 within 64 KB of the end
  let eocd = -1;
  for (let i = z.length - 22; i >= Math.max(0, z.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('the file is not a complete zip/APK');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < count && p + 46 <= z.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const n = dec.decode(z.subarray(p + 46, p + 46 + nlen));
    if (n === name) {
      const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
      const start = local + 30 + lnlen + lxlen;
      const data = z.subarray(start, start + csize);
      if (method === 0) return data;
      if (method !== 8) throw new Error('the manifest is packed in an unknown way');
      const ds = new Blob([data as any]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(ds).arrayBuffer());
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

// ---------- Android's binary XML (only the <manifest> element's attributes are needed) ----------
const VERSION_CODE = 0x0101021b, VERSION_NAME = 0x0101021c;

function readManifest(x: Uint8Array): { package: string; versionCode: number; versionName: string } {
  const dv = new DataView(x.buffer, x.byteOffset, x.byteLength);
  if (dv.getUint16(0, true) !== 0x0003) throw new Error('the manifest is not in the usual form');
  let strings: string[] = [];
  let resIds: number[] = [];
  let p = dv.getUint16(2, true);
  while (p + 8 <= x.length) {
    const type = dv.getUint16(p, true), hsize = dv.getUint16(p + 2, true), size = dv.getUint32(p + 4, true);
    if (size < 8) break;
    if (type === 0x0001) strings = stringPool(x, dv, p);
    else if (type === 0x0180) { resIds = []; for (let i = p + hsize; i + 4 <= p + size; i += 4) resIds.push(dv.getUint32(i, true)); }
    else if (type === 0x0102) {
      const nameIdx = dv.getUint32(p + 20, true);
      if (strings[nameIdx] === 'manifest') {
        const attrStart = dv.getUint16(p + 24, true), attrSize = dv.getUint16(p + 26, true), attrCount = dv.getUint16(p + 28, true);
        let pkg = '', code = 0, vname = '';
        for (let a = 0; a < attrCount; a++) {
          const q = p + 16 + attrStart + a * attrSize;
          const an = dv.getUint32(q + 4, true), raw = dv.getUint32(q + 8, true);
          const dtype = x[q + 15], data = dv.getUint32(q + 16, true);
          const id = an < resIds.length ? resIds[an] : 0;
          const aname = strings[an] || '';
          const str = raw !== 0xffffffff ? strings[raw] : (dtype === 0x03 ? strings[data] : undefined);
          if (id === VERSION_CODE || aname === 'versionCode') code = dtype >= 0x10 && dtype <= 0x1f ? data : Number(str || 0);
          else if (id === VERSION_NAME || aname === 'versionName') vname = str ?? String(data);
          else if (aname === 'package') pkg = str || '';
        }
        if (!code) throw new Error('no build number in the manifest');
        return { package: pkg, versionCode: code, versionName: vname };
      }
    }
    p += size;
  }
  throw new Error('no <manifest> in the manifest');
}

function stringPool(x: Uint8Array, dv: DataView, p: number): string[] {
  const count = dv.getUint32(p + 8, true), flags = dv.getUint32(p + 16, true), start = dv.getUint32(p + 20, true);
  const utf8 = (flags & 0x100) !== 0;
  const out: string[] = [];
  const u8 = new TextDecoder('utf-8'), u16 = new TextDecoder('utf-16le');
  for (let i = 0; i < count; i++) {
    let o = p + start + dv.getUint32(p + 28 + i * 4, true);
    if (utf8) {
      let n = x[o++]; if (n & 0x80) o++;                       // length in UTF-16 units (skipped)
      let m = x[o++]; if (m & 0x80) m = ((m & 0x7f) << 8) | x[o++];
      out.push(u8.decode(x.subarray(o, o + m)));
    } else {
      let n = dv.getUint16(o, true); o += 2;
      if (n & 0x8000) { n = ((n & 0x7fff) << 16) | dv.getUint16(o, true); o += 2; }
      out.push(u16.decode(x.subarray(o, o + n * 2)));
    }
  }
  return out;
}
