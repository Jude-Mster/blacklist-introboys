import React from "react";

// A spinning prize wheel drawn in SVG. Segment i spans i*step..(i+1)*step degrees
// clockwise from the top pointer. Use `angleFor(i, current, n)` to land segment i.
export default function Wheel({ segments, rotation, spinMs = 3000, spinning, size = 260, highlight = null }) {
  const n = segments.length;
  const step = 360 / n;
  const r = 100;
  const point = (deg, radius) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [radius * Math.cos(a), radius * Math.sin(a)];
  };

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {/* pointer */}
      <svg className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2" width="28" height="32" viewBox="0 0 28 32" aria-hidden="true">
        <path d="M14 30 L3 6 Q14 0 25 6 Z" fill="#A3161F" stroke="#D8B46A" strokeWidth="2" />
        <circle cx="14" cy="9" r="3" fill="#D8B46A" />
      </svg>

      <svg
        viewBox="-112 -112 224 224"
        width={size}
        height={size}
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.12, 0.65, 0.12, 1)` : "none"
        }}
        aria-hidden="true"
      >
        <circle r="110" fill="#141C1E" stroke="#8A6A3E" strokeWidth="3" />
        {segments.map((s, i) => {
          const [x1, y1] = point(i * step, r);
          const [x2, y2] = point((i + 1) * step, r);
          const [tx, ty] = point(i * step + step / 2, r * 0.68);
          const large = step > 180 ? 1 : 0;
          const lit = highlight === i;
          return (
            <g key={i}>
              <path
                d={`M0 0 L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
                fill={s.color}
                fillOpacity={lit ? 1 : i % 2 ? 0.78 : 0.92}
                stroke="#0D1416"
                strokeWidth="1.2"
              />
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${i * step + step / 2} ${tx} ${ty})`}
                fontFamily="'Shippori Mincho B1', serif"
                fontWeight="800"
                fontSize={s.fontSize || (n > 8 ? 15 : 17)}
                fill="#F4ECD6"
              >
                {s.label}
              </text>
            </g>
          );
        })}
        {/* rim studs */}
        {segments.map((_, i) => {
          const [x, y] = point(i * step, 105);
          return <circle key={`s${i}`} cx={x} cy={y} r="2.4" fill="#D8B46A" />;
        })}
        <circle r="22" fill="#0D1416" stroke="#D8B46A" strokeWidth="2" />
        <text textAnchor="middle" dominantBaseline="central" fontFamily="'Shippori Mincho B1', serif" fontWeight="800" fontSize="16" fill="#D8B46A">
          天
        </text>
      </svg>
    </div>
  );
}

// Rotation that lands segment `index` under the pointer after a few full turns.
export function angleFor(index, current, n, turns = 6) {
  const step = 360 / n;
  const base = Math.ceil(current / 360) * 360 + 360 * turns;
  // small random nudge inside the segment so it doesn't always stop dead centre
  const nudge = (Math.random() - 0.5) * step * 0.6;
  return base + (360 - (index * step + step / 2)) + nudge;
}