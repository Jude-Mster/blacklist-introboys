import React, { useRef, useState } from "react";
import PlayingCard from "./PlayingCard";
import { Dealt } from "@/components/DealtCards";
import { cn } from "@/lib/utils";

const FULL_PX = 80;    // drag this far to see the whole card
const OPEN_AT = 0.9;   // let go past this and the cards stay face up

// Your own hole cards, dealt face down. Drag up (or sideways) to peel them back and
// peek; let go and they drop face down again unless you peeled nearly all the way.
// A tap flips them over or back. `forceOpen` turns them face up (showdown).
export default function SqueezeCards({ cards, handNo, open, onOpen, forceOpen, cardProps }) {
  const [peel, setPeel] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const faceUp = open || forceOpen;
  const shown = faceUp ? 1 : peel;

  const down = (e) => {
    if (forceOpen) return;
    start.current = { x: e.clientX, y: e.clientY, far: 0 };
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const move = (e) => {
    if (!start.current) return;
    const far = Math.max(start.current.y - e.clientY, Math.abs(e.clientX - start.current.x), 0);
    start.current.far = Math.max(start.current.far, far);
    if (!open) setPeel(Math.min(1, far / FULL_PX));
  };
  const up = () => {
    if (!start.current) return;
    const tapped = start.current.far < 6;
    start.current = null;
    setDragging(false);
    if (tapped) onOpen(!open);
    else if (!open && peel >= OPEN_AT) onOpen(true);
    setPeel(0);
  };

  return (
    <div
      className={cn("flex select-none gap-1.5", !forceOpen && "cursor-grab active:cursor-grabbing")}
      style={{ touchAction: "none" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="button"
      tabIndex={forceOpen ? -1 : 0}
      aria-label={faceUp ? "Your cards, face up. Tap to turn them face down." : "Your cards, face down. Drag up to squeeze them or tap to turn them over."}
      aria-pressed={!!faceUp}
      onKeyDown={(e) => { if (!forceOpen && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(!open); } }}
    >
      {cards.map((c, k) => (
        <Dealt key={`${handNo}-${k}`} delay={k * 400}>
          <span className="relative inline-flex">
            <span aria-hidden={!faceUp}><PlayingCard card={c} size="lg" {...(cardProps ? cardProps(c) : {})} /></span>
            {shown < 1 && (
              <span
                className="absolute inset-0"
                aria-hidden="true"
                style={{
                  clipPath: `inset(0 0 ${shown * 100}% 0)`,
                  transform: `translateY(${-shown * 5}px)`,
                  transition: dragging ? "none" : "clip-path 0.2s ease-out, transform 0.2s ease-out"
                }}
              >
                <PlayingCard back size="lg" />
              </span>
            )}
          </span>
        </Dealt>
      ))}
    </div>
  );
}