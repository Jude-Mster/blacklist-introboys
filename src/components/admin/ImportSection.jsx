import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";

export default function ImportSection() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const res = await base44.functions.invoke("adminAction", { action: "import", text });
      setResults(res.data.results || []);
    } catch (e) {
      setError(errorText(e, "The import didn't go through."));
    } finally {
      setBusy(false);
    }
  };

  const ok = results ? results.filter((r) => r.ok).length : 0;

  return (
    <Panel title="Import starting balances">
      <p className="mb-3 text-sm text-mist">
        One member per line: <code className="text-gold">discord_id,points</code>, optionally followed by <code className="text-gold">,name</code>.
        Only members with 0 points are changed, so running it twice is safe.
      </p>
      <label htmlFor="import-lines" className="label">Lines</label>
      <textarea
        id="import-lines"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"123456789012345678,500,Mega\n987654321098765432,1000"}
        className="field h-auto py-2 font-mono text-sm"
      />
      {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}
      <button onClick={run} disabled={busy || !text.trim()} className="btn-seal mt-4 h-11 px-6">
        {busy ? "Importing" : "Import balances"}
      </button>
      {results && (
        <div className="mt-4">
          <p className="text-sm">
            <span className="text-jade">{ok} imported</span>
            {results.length - ok > 0 && <span className="text-ember"> · {results.length - ok} skipped</span>}
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
            {results.filter((r) => !r.ok).map((r, i) => (
              <li key={i} className="text-ember">
                {r.discordId || "(blank)"}: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}