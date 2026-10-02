import React from "react";

export const SIDES = [
  { id: "heads", name: "Yang", glyph: "陽" },
  { id: "tails", name: "Yin", glyph: "陰" }
];
export const sideName = (id) => (id === "tails" ? "Yin" : "Yang");

// The two-faced cash coin. Rotate it with `rotation` (multiples of 360 show Yang, +180 shows Yin).
export default function Coin({ rotation, spinMs, spinning, size = 128 }) {
  return (
    <div
      className="relative"
      style={{
        width: size,
        height: size,
        transformStyle: "preserve-3d",
        transform: `rotateY(${rotation}deg)`,
        transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.15, 0.6, 0.2, 1)` : "none"
      }}
    >
      <Face side={SIDES[0]} />
      <Face side={SIDES[1]} back />
    </div>
  );
}

// Next rotation that lands on `side` after six full turns.
export const landOn = (current, side) => Math.ceil(current / 360) * 360 + 360 * 6 + (side === "tails" ? 180 : 0);

function Face({ side, back }) {
  const yang = side.id === "heads";
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-full"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
        background: yang
          ? "radial-gradient(circle at 35% 30%, #F6E2A8, #D8B46A 45%, #8A6A3E)"
          : "radial-gradient(circle at 35% 30%, #4A5A62, #1E282C 55%, #0B1012)",
        border: `3px solid ${yang ? "#8A6A3E" : "#D8B46A"}`,
        boxShadow: "inset 0 0 0 6px rgba(0,0,0,0.18), 0 10px 30px -8px rgba(0,0,0,0.8)"
      }}
    >
      <span className="absolute inset-3 rounded-full border" style={{ borderColor: yang ? "#8A6A3E99" : "#D8B46A66" }} />
      {/* square hole of an old cash coin */}
      <span className="absolute h-5 w-5 border-2" style={{ borderColor: yang ? "#8A6A3E" : "#D8B46A88", background: yang ? "#B8934F" : "#141C1E" }} />
      <span
        className="absolute top-4 font-heading text-2xl font-extrabold"
        style={{ color: yang ? "#5A4020" : "#D8B46A" }}
        lang="zh-Hant"
      >
        {side.glyph}
      </span>
      <span className="absolute bottom-4 text-[11px] font-bold tracking-[0.2em]" style={{ color: yang ? "#5A4020" : "#D8B46Acc" }}>
        {side.name.toUpperCase()}
      </span>
    </div>
  );
}