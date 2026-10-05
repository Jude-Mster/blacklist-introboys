import React, { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
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

// A card being dealt. If the table has a dealer's deck on it (an element marked
// data-dealer inside an ancestor marked data-deal-table), the card flies from that deck
// to its place, turning as it goes, like a dealer handing it over. Otherwise it drops in.
export function Dealt({ delay = 0, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const table = el.closest("[data-deal-table]");
    const deck = table && table.querySelector("[data-dealer]");
    const to = el.getBoundingClientRect();
    if (deck && to.width) {
      const from = deck.getBoundingClientRect();
      el.style.setProperty("--deal-x", `${Math.round(from.left + from.width / 2 - (to.left + to.width / 2))}px`);
      el.style.setProperty("--deal-y", `${Math.round(from.top + from.height / 2 - (to.top + to.height / 2))}px`);
      el.classList.add("card-fly");
    } else {
      el.classList.add("card-deal");
    }
  }, []);
  return (
    <span ref={ref} className="inline-flex" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </span>
  );
}

// The dealer's deck: where dealt cards come from. Put one inside a data-deal-table.
export function DealerDeck({ className, size = "xs" }) {
  return (
    <span data-dealer className={cn("relative inline-block", className)} aria-hidden="true">
      <PlayingCard back size={size} className="absolute left-[3px] top-[3px] opacity-70" />
      <PlayingCard back size={size} className="absolute left-[1.5px] top-[1.5px] opacity-85" />
      <PlayingCard back size={size} className="relative" />
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
