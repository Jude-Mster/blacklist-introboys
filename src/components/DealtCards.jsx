import React, { useRef } from "react";
import PlayingCard from "@/components/poker/PlayingCard";

// How long between one card landing and the next.
export const DEAL_STEP_MS = 450;

// Remembers when each card first appeared, so cards that arrive together are dealt
// one after another instead of all at once. Returns delay(key) in milliseconds.
export function useDealDelays(keys, step = DEAL_STEP_MS, offset = 0) {
  const seen = useRef(new Map());
  let fresh = 0;
  for (const k of keys) if (!seen.current.has(k)) seen.current.set(k, offset + fresh++ * step);
  for (const k of [...seen.current.keys()]) if (!keys.includes(k)) seen.current.delete(k);
  return (k) => seen.current.get(k) || 0;
}

export function Dealt({ delay = 0, children }) {
  return (
    <span className="card-deal inline-flex" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </span>
  );
}

// A row of cards (plus face-down ones) where each new card is dealt in turn.
export default function DealtCards({ cards, hidden = 0, size = "md", step = DEAL_STEP_MS, offset = 0, cardProps }) {
  const keys = [...cards.map((c, i) => i + c), ...Array.from({ length: hidden }, (_, i) => "back" + (cards.length + i))];
  const delay = useDealDelays(keys, step, offset);
  return (
    <>
      {cards.map((c, i) => (
        <Dealt key={i + c} delay={delay(i + c)}>
          <PlayingCard card={c} size={size} {...(cardProps ? cardProps(c) : {})} />
        </Dealt>
      ))}
      {Array.from({ length: hidden }, (_, i) => (
        <Dealt key={"back" + (cards.length + i)} delay={delay("back" + (cards.length + i))}>
          <PlayingCard back size={size} />
        </Dealt>
      ))}
    </>
  );
}