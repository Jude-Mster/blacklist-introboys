import React, { useEffect, useRef, useState } from "react";

// A real six-sided cube that tumbles and comes to rest on the rolled number.
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
// Where each face sits on the cube, and how the cube must turn to bring it to the front.
const FACE = { 1: "rotateY(0deg)", 2: "rotateY(90deg)", 3: "rotateX(90deg)", 4: "rotateX(-90deg)", 5: "rotateY(-90deg)", 6: "rotateY(180deg)" };
const SHOW = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };

function Face({ n, size }) {
  return (
    <span
      className="absolute inset-0 grid grid-cols-3 rounded-[16%] border border-[hsl(40_20%_62%)]"
      style={{
        transform: `${FACE[n]} translateZ(${size / 2}px)`,
        padding: size * 0.15,
        gap: size * 0.045,
        background: "linear-gradient(145deg, #FFFDF6, #E4DCC8)",
        backfaceVisibility: "hidden"
      }}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
        <i
          key={k}
          className="rounded-full"
          style={PIPS[n].includes(k) ? { background: n === 1 || n === 4 ? "#C8161D" : "#15181B", transform: n === 1 ? "scale(1.5)" : undefined, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)" } : undefined}
        />
      ))}
    </span>
  );
}

// `value` 1 to 6. Each time `rollKey` changes the cube tumbles for `ms` and stops on `value`;
// on first show (or when rollKey stays the same) it simply sits on its value.
export default function Die3D({ value = 1, rollKey = 0, ms = 3000, size = 58, index = 0 }) {
  const [rot, setRot] = useState(() => ({ x: SHOW[value][0], y: SHOW[value][1], animate: false }));
  const lastKey = useRef(rollKey);
  const [throwNo, setThrowNo] = useState(0);
  useEffect(() => {
    const [fx, fy] = SHOW[value] || SHOW[1];
    if (lastKey.current === rollKey) {
      setRot((r) => ({ x: r.x - (((r.x % 360) + 360) % 360) + fx, y: r.y - (((r.y % 360) + 360) % 360) + fy, animate: false }));
      return;
    }
    lastKey.current = rollKey;
    // Whole extra turns on both axes, different for each die, then land on the face.
    setRot((r) => ({
      x: r.x - (((r.x % 360) + 360) % 360) + 360 * (4 + index) + fx,
      y: r.y - (((r.y % 360) + 360) % 360) + 360 * (3 + ((index * 2) % 3)) + fy,
      animate: true
    }));
    setThrowNo((n) => n + 1);
  }, [value, rollKey, index]);

  return (
    <span className="inline-block" style={{ width: size, height: size, perspective: size * 6 }} role="img" aria-label={`Die showing ${value}`}>
      {/* The bounce restarts by switching between two identical animations, so the cube inside is never rebuilt and its tumble can run. */}
      <span className="block h-full w-full" style={{ animation: throwNo ? `${throwNo % 2 ? "dice-throw" : "dice-throw-b"} ${ms}ms ease-out ${index * 60}ms both` : undefined, transformStyle: "preserve-3d" }}>
        <span
          className="relative block h-full w-full"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
            transition: rot.animate ? `transform ${ms - 200 + index * 120}ms cubic-bezier(0.18, 0.75, 0.22, 1)` : "none"
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => <Face key={n} n={n} size={size} />)}
        </span>
      </span>
    </span>
  );
}

// A small flat die for labels and history.
export function MiniDie({ n, size = 20 }) {
  return (
    <span className="inline-grid shrink-0 grid-cols-3 rounded-[4px]" style={{ width: size, height: size, padding: size * 0.14, gap: 1, background: "linear-gradient(145deg, #FFFDF6, #DDD5C0)" }} role="img" aria-label={`${n}`}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
        <i key={k} className="rounded-full" style={PIPS[n].includes(k) ? { background: n === 1 || n === 4 ? "#C8161D" : "#15181B" } : undefined} />
      ))}
    </span>
  );
}