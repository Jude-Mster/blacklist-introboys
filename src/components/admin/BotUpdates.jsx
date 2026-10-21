import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");

// Guild Leader: publish an Assistant update. The zip is hosted by you (any direct https link);
// this page only works out its checksum so the app can prove the download is the file you meant.
export default function BotUpdates() {
  const [list, setList] = useState(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [file, setFile] = useState(null); // { name, size, sha256 }
  const [hashing, setHashing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { const res = await base44.functions.invoke("botAuth", { action: "adminReleases" }); setList(res.data.releases); }
    catch (e) { setError(errorText(e, "Couldn't load the updates.")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    setFile(null); setError("");
    if (!f) return;
    setHashing(true);
    try {
      const sha256 = hex(await crypto.subtle.digest("SHA-256", await f.arrayBuffer()));
      setFile({ name: f.name, size: f.size, sha256 });
    } catch { setError("Couldn't read that file."); }
    finally { setHashing(false); }
  };

  const publish = async () => {
    setBusy(true); setError(""); setMsg("");
    try {
      await base44.functions.invoke("botAuth", { action: "adminRelease", version: version.trim(), notes, url: url.trim(), sha256: file && file.sha256, size: file && file.size, mandatory });
      setMsg(`Version ${version.trim()} is published. Apps will offer it within a few minutes.`);
      setVersion(""); setNotes(""); setUrl(""); setFile(null); setMandatory(false);
      await load();
    } catch (e) { setError(errorText(e, "That didn't work.")); }
    finally { setBusy(false); }
  };
  const toggle = async (r) => {
    setBusy(true); setError(""); setMsg("");
    try { await base44.functions.invoke("botAuth", { action: "adminReleaseToggle", id: r.id, active: !r.active }); await load(); }
    catch (e) { setError(errorText(e, "That didn't work.")); }
    finally { setBusy(false); }
  };

  const ready = /^\d+\.\d+\.\d+$/.test(version.trim()) && /^https:\/\//.test(url.trim()) && !!file;
  return (
    <Panel title="IntroBoys Assistant updates">
      <p className="mb-3 text-sm text-mist">Upload the update zip anywhere that gives a direct https download link, then choose the same file here (it is not uploaded to the site; only its checksum is calculated). The app downloads it, checks it against the signature, and patches itself.</p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <label htmlFor="rel-ver" className="label">Version</label>
          <input id="rel-ver" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="4.2.0" maxLength={16} className="field w-full" />
        </div>
        <div>
          <label htmlFor="rel-file" className="label">Update zip (to calculate the checksum)</label>
          <input id="rel-file" type="file" accept=".zip" onChange={pick} className="field w-full" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rel-url" className="label">Direct download link (https)</label>
          <input id="rel-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/IntroBoysAssistant-4.2.0-update.zip" maxLength={500} className="field w-full" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rel-notes" className="label">What is new</label>
          <textarea id="rel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className="field w-full" />
        </div>
      </div>
      {hashing && <p className="mt-2 text-sm text-mist">Calculating checksum…</p>}
      {file && <p className="mt-2 break-all text-xs text-mist">{file.name} · {(file.size / 1048576).toFixed(1)} MB · SHA-256 {file.sha256}</p>}
      <label className="mt-3 flex items-center gap-2 text-sm text-mist">
        <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Required: older versions must update before they run
      </label>
      <button disabled={busy || hashing || !ready} onClick={publish} className="btn-seal mt-3 h-10 px-4 text-sm">Publish update</button>
      {msg && <p role="status" className="mt-2 text-sm text-gold">{msg}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
      {list && list.length > 0 && (
        <ul className="mt-4 divide-y divide-bronze/25 text-sm">
          {list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-bold text-gold">{r.version}</span>
              <span className={cn("rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase", r.active ? "border-white/70 text-white" : "border-ember/60 text-ember")}>{r.active ? "offered" : "withdrawn"}</span>
              {r.mandatory && <span className="text-xs text-mist">required</span>}
              <span className="min-w-0 flex-1 truncate text-xs text-mist">{r.notes}</span>
              <button disabled={busy} onClick={() => toggle(r)} className="btn-bronze h-8 px-3 text-xs">{r.active ? "Withdraw" : "Offer again"}</button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}