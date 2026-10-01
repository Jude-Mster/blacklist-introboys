import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MemberSearch({ onSelect, placeholder = "Search by name or Discord ID" }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async (value) => {
    setQ(value);
    if (value.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("adminAction", { action: "search", query: value });
      setResults(res.data.members || []);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const pick = (m) => {
    onSelect(m);
    setQ(m.discord_name || m.discord_id);
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => run(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="pl-9 bg-ink/60 border-gold/30 text-gold"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-panel border border-gold/30 rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => pick(m)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gold/10"
              >
                {m.avatar_url ? (
                  <Image src={m.avatar_url} fittingType="fill" className="w-8 h-8 rounded-full border border-gold/30" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-crimson text-gold font-heading flex items-center justify-center text-sm">
                    {(m.discord_name || m.discord_id).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm">{m.discord_name || m.discord_id}</p>
                  <p className="text-xs text-muted-foreground">{m.points.toLocaleString()} pts · {m.role}{m.banned ? " · banned" : ""}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && <p className="text-xs text-muted-foreground mt-1">Searching…</p>}
    </div>
  );
}