import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Casino chips for the card tables: a tray to drag from and spots on the felt to drop on.
// Dragging works with a mouse or a finger. Tapping also works: tap a chip to pick it up,
// then tap a spot to put one down.
export const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 500, 1000, 5000];
const COLORS = { 1: "#8A9099", 5: "#C8202A", 10: "#1F5FD0", 25: "#1E9A4B", 50: "#E06A12", 100: "#1B1E24", 500: "#7440C9", 1000: "#C99A12", 5000: "#D23A8A" };
const label = (v) => (v >= 1000 ? `${v / 1000}K` : String(v));

// Which chips make up an amount, biggest first (for drawing a stack).
export function chipsFor(amount, limit = 5) {
  const out = [];
  let left = Math.max(0, Math.floor(amount));
  for (const v of [...CHIP_VALUES].reverse()) {
    while (left >= v && out.length < limit) { out.push(v); left -= v; }
  }
  return out;
}

export function Chip({ value, size = 44, className, style }) {
  const c = COLORS[value] || COLORS[1];
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.6)]", className)}
      style={{ width: size, height: size, background: `repeating-conic-gradient(${c} 0 30deg, #F4F1E8 30deg 45deg)`, ...style }}
    >
      <span
        className="flex items-center justify-center rounded-full border border-white/70 font-heading font-extrabold leading-none text-white"
        style={{ width: size * 0.7, height: size * 0.7, background: c, fontSize: size * (label(value).length > 2 ? 0.25 : 0.3) }}
      >
        {label(value)}
      </span>
    </span>
  );
}

// A printed circle on the felt that takes chips. `data-spot` is how a dropped chip finds it.
export function BetSpot({ id, label: text, sub, amount, big, locked, armed, onTap, bad }) {
  const stack = chipsFor(amount, 4).reverse(); // smallest at the bottom of the drawing order
  const size = big ? 84 : 66;
  return (
    <button
      type="button"
      data-spot={locked ? undefined : id}
      onClick={locked ? undefined : onTap}
      disabled={locked}
      aria-label={`${text}: ${amount ? amount.toLocaleString() + " points" : "no chips"}${locked ? "" : ". Tap to add the chosen chip."}`}
      className="group flex flex-col items-center gap-1 disabled:cursor-default"
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full border-2 border-dashed transition-colors",
          bad ? "border-ember" : amount > 0 ? "border-gold" : "border-white/55",
          !locked && armed && "bg-white/10 group-hover:border-gold group-hover:bg-white/15"
        )}
        style={{ width: size, height: size }}
      >
        {amount > 0 ? (
          <span className="relative block" style={{ width: 36, height: 36 + (stack.length - 1) * 5 }}>
            {stack.map((v, i) => (
              <Chip key={i} value={v} size={36} className="absolute left-0" style={{ bottom: i * 5 }} />
            ))}
          </span>
        ) : (
          <span className="px-1 text-center font-heading text-[11px] font-extrabold uppercase leading-tight tracking-wide text-white/75">{text}</span>
        )}
      </span>
      <span className={cn("min-h-[1rem] rounded-full px-2 text-[11px] font-bold leading-4 tabular-nums", amount > 0 ? "bg-black/60 text-gold" : "text-white/60")}>
        {amount > 0 ? `${text} · ${amount.toLocaleString()}` : sub || ""}
      </span>
    </button>
  );
}

// The row of chips. onDrop(spotId, value) fires when a chip is let go over a spot.
export function ChipTray({ chips, selected, onSelect, onDrop, disabled }) {
  const [ghost, setGhost] = useState(null); // { value, x, y }
  const drag = useRef(null);

  const down = (e, value) => {
    if (disabled) return;
    drag.current = { value, x: e.clientX, y: e.clientY, far: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    d.far = Math.max(d.far, Math.hypot(e.clientX - d.x, e.clientY - d.y));
    if (d.far > 6) setGhost({ value: d.value, x: e.clientX, y: e.clientY });
  };
  const up = (e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setGhost(null);
    if (d.far <= 6) { onSelect(d.value); return; } // a tap picks the chip up
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const spot = el && el.closest ? el.closest("[data-spot]") : null;
    if (spot) { onSelect(d.value); onDrop(spot.getAttribute("data-spot"), d.value); }
  };
  const cancel = () => { drag.current = null; setGhost(null); };

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Chips. Drag one onto a bet spot, or tap a chip and then tap a spot.">
        {chips.map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onPointerDown={(e) => down(e, v)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(v); } }}
            aria-pressed={selected === v}
            aria-label={`${v.toLocaleString()} chip`}
            className={cn(
              "rounded-full transition-transform disabled:opacity-40",
              !disabled && "cursor-grab active:cursor-grabbing",
              selected === v && !disabled ? "-translate-y-1.5 ring-2 ring-gold ring-offset-2 ring-offset-[hsl(150_45%_10%)]" : "hover:-translate-y-0.5"
            )}
            style={{ touchAction: "none" }}
          >
            <Chip value={v} size={44} className={ghost && ghost.value === v ? "opacity-40" : ""} />
          </button>
        ))}
      </div>
      {ghost && (
        <span className="pointer-events-none fixed z-50" style={{ left: ghost.x - 24, top: ghost.y - 24 }} aria-hidden="true">
          <Chip value={ghost.value} size={48} className="scale-110 shadow-[0_10px_18px_rgba(0,0,0,0.7)]" />
        </span>
      )}
    </>
  );
}

// Curved lettering printed on the felt, like a real table. `lines` = [big, small, band].
export function FeltPrint({ lines, id }) {
  const [big, small, band] = lines || [];
  return (
    <svg viewBox="0 0 400 118" className="mx-auto block w-full max-w-[460px] select-none" role="img" aria-label={[big, small, band].filter(Boolean).join(". ")}>
      <defs>
        <path id={`${id}-a`} d="M 28 18 Q 200 74 372 18" />
        <path id={`${id}-b`} d="M 52 44 Q 200 92 348 44" />
        <path id={`${id}-c`} d="M 44 72 Q 200 124 356 72" />
      </defs>
      {big && (
        <text fill="rgba(255,255,255,0.82)" fontSize="19" fontWeight="800" letterSpacing="1.5" style={{ fontFamily: "inherit" }}>
          <textPath href={`#${id}-a`} startOffset="50%" textAnchor="middle">{big}</textPath>
        </text>
      )}
      {small && (
        <text fill="rgba(255,255,255,0.6)" fontSize="11" letterSpacing="0.6">
          <textPath href={`#${id}-b`} startOffset="50%" textAnchor="middle">{small}</textPath>
        </text>
      )}
      {band && (
        <>
          <path d="M 44 72 Q 200 124 356 72" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="19" strokeLinecap="round" />
          <path d="M 44 72 Q 200 124 356 72" fill="none" stroke="var(--felt-band, #0E3B24)" strokeWidth="16.5" strokeLinecap="round" />
          <text fill="rgba(255,255,255,0.85)" fontSize="12.5" fontWeight="800" letterSpacing="1.2" dy="4.5">
            <textPath href={`#${id}-c`} startOffset="50%" textAnchor="middle">{band}</textPath>
          </text>
        </>
      )}
    </svg>
  );
}

// The dealer's chip rack along the top rail (decoration only).
export function ChipRack() {
  const rows = [5, 100, 500, 25, 1000, 10, 5000, 50, 1];
  return (
    <div className="mx-auto flex w-fit gap-[3px] rounded-b-md border border-t-0 border-white/20 bg-black/45 px-1.5 pb-1 pt-0.5" aria-hidden="true">
      {rows.map((v) => (
        <span key={v} className="block h-6 w-[13px] rounded-[2px]" style={{ background: `repeating-linear-gradient(180deg, ${COLORS[v]} 0 3px, rgba(255,255,255,0.75) 3px 4px)` }} />
      ))}
    </div>
  );
}