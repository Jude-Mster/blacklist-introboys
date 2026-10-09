import React from "react";

// Twelve colours that stay apart on black, so the list beside the wheel can show each
// member's slice colour.
const PALETTE = ["#C8161D", "#2E7F5E", "#3E7FB8", "#B8553A", "#6B4FA0", "#8C8C8C", "#3FA796", "#B8862E", "#A23B72", "#4A6FD1", "#6F8F2E", "#5C5C5C"];

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

// member_id -> slice colour, for the list beside the wheel.
export function sliceColors(entrants) {
  const map = {};
  for (const s of slices(entrants)) map[s.member_id] = s.color;
  return map;
}

// Rotation that brings `memberId`'s slice under the pointer after several turns.
export function landOnMember(current, entrants, memberId, turns = 7) {
  const s = slices(entrants).find((x) => x.member_id === memberId);
  const base = Math.ceil(current / 360) * 360 + 360 * turns;
  return s ? base + (360 - s.mid) : base;
}

const R = 100;           // wheel radius (viewBox units)
const LABEL_FROM = 30;   // names run outward from just past the hub...
const LABEL_TO = 93;     // ...to just inside the rim

// Name size and placement for a slice. Names hug the rim, where a slice is widest, and
// run inward; the biggest size (13 down to 8) at which the whole name stays inside its
// slice wins. A name too long even at 8 is cut with an ellipsis; a slice too thin for
// three letters carries no name (the list beside the wheel always has it).
const CHAR = 0.44; // average Oswald letter width, as a share of the font size
function label(s) {
  const name = String(s.name || "");
  const angle = (Math.min(s.size, 90) * Math.PI) / 180;
  const fitsAt = (fs, chars) => {
    const len = chars * fs * CHAR;
    const inner = LABEL_TO - len;
    return inner >= LABEL_FROM && fs * 1.1 <= inner * angle;
  };
  for (let fs = 13; fs >= 8; fs -= 0.5) {
    if (fitsAt(fs, name.length)) return { fontSize: fs, text: name, center: LABEL_TO - (name.length * fs * CHAR) / 2 };
  }
  for (let chars = name.length - 1; chars >= 3; chars--) {
    if (fitsAt(8, chars)) {
      const text = `${name.slice(0, chars - 1)}…`;
      return { fontSize: 8, text, center: LABEL_TO - (chars * 8 * CHAR) / 2 };
    }
  }
  return null;
}

export default function RaffleWheel({ entrants, rotation, spinMs = 6000, spinning, size = 300, winnerId = null, centerLabel = null }) {
  const point = (deg, radius) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [radius * Math.cos(a), radius * Math.sin(a)];
  };
  const list = slices(entrants);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size, maxWidth: "100%", aspectRatio: "1 / 1" }}>
      <svg className="absolute left-1/2 top-[-8px] z-10 -translate-x-1/2" width="30" height="34" viewBox="0 0 28 32" aria-hidden="true">
        <path d="M14 30 L3 6 Q14 0 25 6 Z" fill="#F2F2F2" stroke="#050505" strokeWidth="1.5" />
        <circle cx="14" cy="9" r="3" fill="#C8161D" />
      </svg>
      <svg
        viewBox="-112 -112 224 224"
        width="100%"
        height="100%"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.12, 0.65, 0.12, 1)` : "none" }}
        role="img"
        aria-label={list.length ? `Raffle wheel: ${list.map((s) => `${s.name} ${s.count} ${s.count === 1 ? "entry" : "entries"}`).join(", ")}` : "Empty raffle wheel"}
      >
        <circle r="110" fill="#0E0E0E" stroke="#3A3A3A" strokeWidth="4" />
        {list.length === 0 && <circle r={R} fill="#161616" />}
        {list.length === 1 && <circle r={R} fill={list[0].color} />}
        {list.length > 1 &&
          list.map((s) => {
            const [x1, y1] = point(s.start, R);
            const [x2, y2] = point(s.start + s.size, R);
            return (
              <path
                key={s.member_id}
                d={`M0 0 L${x1} ${y1} A${R} ${R} 0 ${s.size > 180 ? 1 : 0} 1 ${x2} ${y2} Z`}
                fill={s.color}
                fillOpacity={winnerId && winnerId !== s.member_id ? 0.3 : 1}
                stroke="#050505"
                strokeWidth="1.2"
              />
            );
          })}
        {list.map((s) => {
          const l = label(list.length === 1 ? { ...s, size: 90 } : s);
          if (!l) return null;
          // Names read outward along the slice; on the left half they are turned round so
          // they never sit upside down.
          const mid = list.length === 1 ? 0 : s.mid;
          const flip = mid > 180;
          const [tx, ty] = point(mid, list.length === 1 ? (LABEL_FROM + LABEL_TO) / 2 : l.center);
          return (
            <text
              key={`t${s.member_id}`}
              x={tx}
              y={ty}
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${flip ? mid + 90 : mid - 90} ${tx} ${ty})`}
              fontFamily="'Oswald', 'Noto Sans TC', sans-serif"
              fontWeight="600"
              fontSize={l.fontSize}
              letterSpacing="0.2"
              fill="#FFFFFF"
              stroke="#000000"
              strokeOpacity="0.55"
              strokeWidth={l.fontSize / 5}
              paintOrder="stroke"
              opacity={winnerId && winnerId !== s.member_id ? 0.45 : 1}
            >
              {l.text}
            </text>
          );
        })}
        <circle r="24" fill="#050505" stroke="#F2F2F2" strokeWidth="2.5" />
        {centerLabel != null ? (
          <g style={{ transform: `rotate(${-rotation}deg)`, transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.12, 0.65, 0.12, 1)` : "none" }}>
            <text y="-3" textAnchor="middle" dominantBaseline="central" fontFamily="'Oswald', sans-serif" fontWeight="700" fontSize="15" fill="#F2F2F2">{centerLabel}</text>
            <text y="11" textAnchor="middle" dominantBaseline="central" fontSize="6.5" fill="#C4C4C4">entries</text>
          </g>
        ) : (
          <text textAnchor="middle" dominantBaseline="central" fontFamily="'Oswald', sans-serif" fontWeight="800" fontSize="17" fill="#F2F2F2">福</text>
        )}
      </svg>
    </div>
  );
}