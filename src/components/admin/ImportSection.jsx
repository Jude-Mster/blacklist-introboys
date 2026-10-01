import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Panel from "@/components/Panel";

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
      const data = e && e.response && e.response.data;
      setError(data && data.error ? data.error : e.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6">
      <h2 className="font-heading text-xl text-gold font-bold mb-1">Import starting balances</h2>
      <p className="text-sm text-muted-foreground mb-4">Paste one <code className="text-gold">discord_id,points</code> per line. Only members with 0 points are set.</p>
      <Label className="text-muted-foreground">Lines</Label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"1234567890,500\n9876543210,1000"}
        className="mt-1 w-full bg-ink/60 border border-gold/30 rounded-md p-3 text-gold font-mono text-sm"
      />
      {error && <p className="text-ember text-sm mt-3">{error}</p>}
      <Button onClick={run} disabled={busy} className="mt-4 bg-crimson hover:bg-ember text-gold font-heading tracking-wider border border-gold/40">
        {busy ? "Importing…" : "Import"}
      </Button>
      {results && (
        <ul className="mt-4 text-sm space-y-1">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-jade" : "text-ember"}>
              {r.discordId}: {r.ok ? `+${r.balance}` : r.error}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}