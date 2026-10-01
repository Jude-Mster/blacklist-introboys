import React from "react";
import MapleLeaves from "./MapleLeaves";

// Ink-wash landing hero: misty mountains, pagoda silhouettes, dark sky, glowing lanterns.
export default function Hero() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gold/30">
      {/* sky */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0B0A0C 0%, #1a1320 45%, #0B0A0C 100%)" }} />
      {/* moon glow */}
      <div className="absolute right-[18%] top-[12%] w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(201,162,74,0.35), transparent 70%)" }} />

      {/* mist */}
      <div className="mist-drift absolute inset-x-0 bottom-0 h-2/3" style={{ background: "linear-gradient(180deg, transparent, rgba(138,133,128,0.18) 60%, rgba(11,10,12,0.9))" }} />

      {/* mountains + pagodas silhouette */}
      <svg viewBox="0 0 1200 500" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full">
        {/* far mountains */}
        <path d="M0 360 L120 300 L240 340 L360 270 L500 320 L640 250 L780 310 L920 260 L1080 320 L1200 280 L1200 500 L0 500 Z" fill="#15101c" opacity="0.7" />
        {/* mid mountains */}
        <path d="M0 420 L160 350 L320 400 L460 330 L620 390 L780 320 L940 380 L1100 330 L1200 370 L1200 500 L0 500 Z" fill="#1c1626" opacity="0.85" />
        {/* pagoda silhouettes */}
        <g fill="#0B0A0C" opacity="0.95">
          <Pagoda x={210} y={360} scale={0.9} />
          <Pagoda x={760} y={355} scale={1.1} />
          <Pagoda x={1010} y={375} scale={0.7} />
        </g>
        {/* foreground ridge */}
        <path d="M0 470 L200 440 L420 460 L640 430 L880 455 L1200 440 L1200 500 L0 500 Z" fill="#0B0A0C" />
      </svg>

      {/* glowing lanterns */}
      <Lantern x="14%" y="34%" />
      <Lantern x="68%" y="28%" />
      <Lantern x="86%" y="46%" />

      <MapleLeaves count={16} />

      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-24 sm:py-32">
        <p className="font-heading tracking-[0.4em] text-gold text-xs uppercase mb-5">Wuxen 2 · Guild Hall</p>
        <h2 className="font-heading text-3xl sm:text-5xl font-bold text-gold leading-tight" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>
          Blacklist Introboys
        </h2>
        <p className="mt-4 text-muted-foreground text-base sm:text-lg italic">Earn it in battle. Prove it here.</p>
      </div>
    </div>
  );
}

function Pagoda({ x, y, scale = 1 }) {
  const roofs = [
    { w: 70, h: 16, dy: 0 },
    { w: 56, h: 14, dy: 30 },
    { w: 42, h: 12, dy: 58 }
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {roofs.map((r, i) => (
        <g key={i} transform={`translate(${-r.w / 2} ${r.dy})`}>
          <path d={`M0 ${r.h} Q ${r.w / 2} ${-r.h * 0.4} ${r.w} ${r.h} Z`} fill="#0B0A0C" />
          <rect x={r.w / 2 - 2} y={r.h} width="4" height="14" fill="#0B0A0C" />
        </g>
      ))}
      <rect x="-3" y="0" width="6" height="86" fill="#0B0A0C" />
    </g>
  );
}

function Lantern({ x, y }) {
  return (
    <div className="absolute ember-pulse" style={{ left: x, top: y }}>
      <div className="w-3 h-4 rounded-full" style={{ background: "radial-gradient(circle, hsl(45 90% 65%), hsl(4 73% 53%) 70%)", boxShadow: "0 0 18px 4px hsl(4 73% 53% / 0.6)" }} />
    </div>
  );
}