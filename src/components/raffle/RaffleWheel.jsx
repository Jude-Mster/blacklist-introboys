import React from "react";

const PALETTE = ["#A3161F", "#2E7F5E", "#3E7FB8", "#C99A3A", "#6B4FA0", "#B8553A", "#3FA796", "#8A6A3E"];

// Slice angles for a list of entrants; each ticket is an equal share of the wheel.
export function slices(entrants) {
  const total = entrants.reduce((t, e) => t + e.count, 0);
  let at = 0;
  return entrants.map((e, i) => {
    const size = total ? (e.count / total) * 360 : 0;
    const s = { ...e, start: at, size, mid: at + size / 2, color: PALETTE[i % PALETTE.length] };
    at += size;
    return s;
  });
}

// Rotation that brings `memberId`'s slice under the pointer after several turns.
export function landOnMember(current, entrants, memberId, turns = 7) {
  const s = slices(entrants).find((x) => x.member_id === memberId);
  const base = Math.ceil(current / 360) * 360 + 360 * turns;
  return s ? base + (360 - s.mid) : base;
}

export default function RaffleWheel({ entrants, rotation, spinMs = 6000, spinning, size = 260, winnerId = null }) {
  const r = 100;
  const point = (deg, radius) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [radius * Math.cos(a), radius * Math.sin(a)];
  };
  const list = slices(entrants);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size, maxWidth: "100%" }}>
      <svg className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2" width="28" height="32" viewBox="0 0 28 32" aria-hidden="true">
        <path d="M14 30 L3 6 Q14 0 25 6 Z" fill="#A3161F" stroke="#D8B46A" strokeWidth="2" />
        <circle cx="14" cy="9" r="3" fill="#D8B46A" />
      </svg>
      <svg
        viewBox="-112 -112 224 224"
        width="100%"
        height="100%"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.12, 0.65, 0.12, 1)` : "none" }}
        role="img"
        aria-label={list.length ? `Raffle wheel with ${list.length} members` : "Empty raffle wheel"}
      >
        <circle r="110" fill="#141C1E" stroke="#8A6A3E" strokeWidth="3" />
        {list.length === 0 && <circle r={r} fill="#1B2528" />}
        {list.length === 1 && <circle r={r} fill={list[0].color} />}
        {list.length > 1 &&
          list.map((s) => {
            const [x1, y1] = point(s.start, r);
            const [x2, y2] = point(s.start + s.size, r);
            return (
              <path
                key={s.member_id}
                d={`M0 0 L${x1} ${y1} A${r} ${r} 0 ${s.size > 180 ? 1 : 0} 1 ${x2} ${y2} Z`}
                fill={s.color}
                fillOpacity={winnerId && winnerId !== s.member_id ? 0.35 : 0.92}
                stroke="#0D1416"
                strokeWidth="1"
              />
            );
          })}
        {list.map((s) => {
          if (s.size < 9) return null;
          const [tx, ty] = point(s.mid, r * 0.62);
          const max = s.size > 40 ? 12 : 8;
          const name = s.name.length > max ? `${s.name.slice(0, max - 1)}…` : s.name;
          return (
            <text
              key={`t${s.member_id}`}
              x={tx}
              y={ty}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${s.mid - 90} ${tx} ${ty})`}
              fontWeight="700"
              fontSize={s.size > 25 ? 10 : 8}
              fill="#F4ECD6"
            >
              {name}
            </text>
          );
        })}
        <circle r="20" fill="#0D1416" stroke="#D8B46A" strokeWidth="2" />
        <text textAnchor="middle" dominantBaseline="central" fontFamily="'Shippori Mincho B1', serif" fontWeight="800" fontSize="15" fill="#D8B46A">
          福
        </text>
      </svg>
    </div>
  );
}