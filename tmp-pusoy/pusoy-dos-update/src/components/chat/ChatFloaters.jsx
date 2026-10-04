import React from "react";

// Chat messages that fly across the screen while members are playing.
// Purely decorative: taps pass straight through to the game underneath.
export default function ChatFloaters({ items, onDone }) {
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      {items.map((f) => (
        <div
          key={f.key}
          onAnimationEnd={() => onDone(f.key)}
          className="chat-floater absolute left-0 max-w-none whitespace-nowrap rounded-full border border-bronze/50 bg-black/70 px-3 py-1 text-sm font-bold text-[hsl(var(--foreground))] shadow-lg"
          style={{ top: `${16 + f.lane * 9}%`, animationDuration: `${f.seconds}s` }}
        >
          <span className="text-gold">{f.name}</span>
          <span className="mx-1 text-mist">:</span>
          {f.text}
        </div>
      ))}
    </div>
  );
}
