import React, { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { base44 } from "@/api/base44Client";
import { Search } from "lucide-react";
import { Points, ROLE_TITLE } from "@/components/SealLogo";

// Search guild members by name, @username or Discord ID.
export default function MemberSearch({ onSelect, placeholder = "Search by name or Discord ID" }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  useEffect(() => () => clearTimeout(debounce.current), []);

  const run = (value) => {
    setQ(value);
    clearTimeout(debounce.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke("adminAction", { action: "search", query: value });
        setResults(res.data.members || []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const pick = (m) => {
    onSelect(m);
    setQ("");
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" aria-hidden="true" />
      <input
        value={q}
        onChange={(e) => run(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field pl-9"
      />
      {loading && <p className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mist">Searching</p>}
      {open && q.trim().length >= 2 && !loading && results.length === 0 && (
        <p className="mt-1 text-xs text-mist">No member matches "{q}". They appear here after linking or being awarded in Discord.</p>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-bronze/70 bg-[hsl(192_22%_9%)] shadow-xl">
          {results.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => pick(m)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bronze/20">
                <MemberAvatar m={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.discord_name || m.discord_id}</p>
                  <p className="text-xs text-mist">
                    {ROLE_TITLE[m.role] || m.role}
                    {m.banned ? " · banned" : ""}
                  </p>
                </div>
                <Points value={m.points} className="text-xs text-gold" iconSize={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MemberAvatar({ m, size = 32 }) {
  return <Avatar url={m.avatar_url} name={m.discord_name || m.discord_id} size={size} className="border border-bronze/50" />;
}

// The chosen member, with a button to clear the choice.
export function SelectedMember({ m, onClear }) {
  if (!m) return null;
  return (
    <div className="mt-2 flex items-center gap-3 rounded-md border border-gold/50 bg-gold/5 px-3 py-2">
      <MemberAvatar m={m} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.discord_name || m.discord_id}</p>
        <p className="text-xs text-mist">
          {ROLE_TITLE[m.role] || m.role} · {Number(m.points || 0).toLocaleString()} points{m.banned ? " · banned" : ""}
        </p>
      </div>
      <button type="button" onClick={onClear} className="text-xs text-mist hover:text-gold">
        Change
      </button>
    </div>
  );
}