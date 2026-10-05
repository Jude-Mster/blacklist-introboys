import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Quick reactions at the card tables. The ids must match base44/shared/reactions.ts.
export const REACTIONS = [
  { id: "money", emoji: "💰", label: "Money" },
  { id: "thumbs", emoji: "👍", label: "Thumbs up" },
  { id: "cry", emoji: "😭", label: "Crying" },
  { id: "sad", emoji: "😢", label: "Sad" },
  { id: "happy", emoji: "😄", label: "Happy" },
  { id: "laugh", emoji: "😂", label: "Laughing" }
];
const BY_ID = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));
const SHOW_MS = 3500;
const GAP_MS = 1600;

// Give it the table's `reactions` list ({ id, seat, emoji }); it returns a function
// that says which reaction, if any, is showing at a seat right now. Each one shows once.
export function useReactions(list) {
  const [live, setLive] = useState([]);
  const seen = useRef(new Set());
  const timers = useRef([]);
  const ids = (list || []).map((r) => r.id).join(",");
  useEffect(() => {
    const fresh = (list || []).filter((r) => r && !seen.current.has(r.id) && BY_ID[r.emoji]);
    if (!fresh.length) return;
    fresh.forEach((r) => seen.current.add(r.id));
    setLive((l) => [...l.filter((x) => !fresh.some((f) => f.seat === x.seat)), ...fresh]);
    fresh.forEach((r) => timers.current.push(setTimeout(() => setLive((l) => l.filter((x) => x.id !== r.id)), SHOW_MS)));
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (seat) => live.find((r) => r.seat === seat) || null;
}

// The emoji popping up over a seat. The parent needs `position: relative`.
export function ReactionBubble({ r, className }) {
  if (!r || !BY_ID[r.emoji]) return null;
  return (
    <span key={r.id} role="img" aria-label={BY_ID[r.emoji].label} className={cn("reaction-pop pointer-events-none absolute left-1/2 top-0 z-20 text-4xl leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]", className)}>
      {BY_ID[r.emoji].emoji}
    </span>
  );
}

// The row of buttons. `onSend(id)` may return a promise; a short pause stops spamming.
export function ReactionBar({ onSend, className }) {
  const [wait, setWait] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const press = (id) => {
    if (wait) return;
    setWait(true);
    timer.current = setTimeout(() => setWait(false), GAP_MS);
    Promise.resolve(onSend(id)).catch(() => {});
  };
  return (
    <div className={cn("flex items-center justify-center gap-1.5", className)} role="group" aria-label="React so the table can see">
      {REACTIONS.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => press(r.id)}
          disabled={wait}
          aria-label={r.label}
          title={r.label}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-bronze/50 bg-black/40 text-xl leading-none transition-transform hover:border-gold active:scale-90 disabled:opacity-50"
        >
          <span aria-hidden="true">{r.emoji}</span>
        </button>
      ))}
    </div>
  );
}