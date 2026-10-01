import React, { useMemo } from "react";

// Drifting red maple leaves overlay. Disabled when prefers-reduced-motion is set.
export default function MapleLeaves({ count = 14, className = "" }) {
  const reduced = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const leaves = useMemo(() => Array.from({ length: count }).map((_, i) => {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 12).toFixed(2);
    const duration = (9 + Math.random() * 10).toFixed(2);
    const drift = (Math.random() * 120 - 60).toFixed(0);
    const size = 14 + Math.round(Math.random() * 16);
    const hue = 350 + Math.round(Math.random() * 16);
    return { left, delay, duration, drift, size, hue, i };
  }), [count]);

  if (reduced) {
    return null;
  }

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {leaves.map((l) => (
        <svg
          key={l.i}
          viewBox="0 0 24 24"
          width={l.size}
          height={l.size}
          className="maple-fall absolute -top-8"
          style={{
            left: `${l.left}%`,
            animationDelay: `${l.delay}s`,
            animationDuration: `${l.duration}s`,
            ["--drift"]: `${l.drift}px`
          }}
        >
          <path
            d="M12 2 L13.5 7 L18 5 L16 9.5 L21 11 L16.5 12.5 L18 17 L13.5 15 L12 22 L10.5 15 L6 17 L7.5 12.5 L3 11 L8 9.5 L6 5 L10.5 7 Z"
            fill={`hsl(${l.hue} 75% 45%)`}
            stroke={`hsl(${l.hue} 80% 30%)`}
            strokeWidth="0.5"
          />
        </svg>
      ))}
    </div>
  );
}