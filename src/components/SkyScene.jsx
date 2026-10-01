import React from "react";
import { cn } from "@/lib/utils";

// Ink-wash backdrop of the Twelve Skies: a pale moon, floating stone pillars
// with pagodas on top, and slow cloud bands. Pure SVG, no images.
export default function SkyScene({ className, dim = false }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(205 38% 12%) 0%, hsl(196 30% 9%) 45%, hsl(192 26% 7%) 100%)"
        }}
      />
      {/* moon */}
      <div
        className="absolute right-[6%] top-[5%] h-20 w-20 rounded-full sm:right-[12%] sm:top-[9%] sm:h-40 sm:w-40"
        style={{
          background: "radial-gradient(circle at 40% 40%, hsl(43 50% 88%), hsl(40 40% 70%) 60%, hsl(40 30% 55%))",
          boxShadow: "0 0 80px 20px hsl(43 60% 70% / 0.18)",
          opacity: dim ? 0.55 : 0.9
        }}
      />

      <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="sky-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="hsl(200 22% 26%)" />
            <stop offset="1" stopColor="hsl(195 24% 12%)" />
          </linearGradient>
          <linearGradient id="sky-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="hsl(196 22% 17%)" />
            <stop offset="1" stopColor="hsl(194 26% 9%)" />
          </linearGradient>
          <linearGradient id="sky-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="hsl(195 20% 70%)" stopOpacity="0" />
            <stop offset="0.5" stopColor="hsl(195 20% 70%)" stopOpacity="0.16" />
            <stop offset="1" stopColor="hsl(195 20% 70%)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* far floating pillars */}
        <g fill="url(#sky-far)" opacity="0.75">
          <path d="M120 420 q-14 -90 6 -170 q22 -30 44 0 q18 80 4 170 q-26 30 -54 0Z" />
          <path d="M930 380 q-10 -110 10 -190 q24 -26 46 4 q12 96 -2 186 q-28 26 -54 0Z" />
          <path d="M455 330 q-8 -70 8 -120 q18 -18 34 2 q10 60 -2 118 q-20 18 -40 0Z" />
        </g>
        {/* tiny pagodas on the far pillars */}
        <g fill="hsl(195 24% 12%)">
          <Pagoda x={148} y={250} s={0.55} />
          <Pagoda x={962} y={190} s={0.6} />
          <Pagoda x={473} y={208} s={0.42} />
        </g>

        {/* mist band */}
        <rect x="-100" y="330" width="1400" height="140" fill="url(#sky-mist)" className="cloud-drift" />

        {/* mid mountains */}
        <path
          d="M0 560 L90 470 L170 520 L260 430 L340 500 L430 410 L520 480 L600 440 L690 500 L780 420 L870 470 L960 400 L1050 480 L1130 450 L1200 490 L1200 700 L0 700Z"
          fill="url(#sky-mid)"
        />
        {/* near pillar with a gate */}
        <path d="M720 700 q-30 -160 0 -280 q36 -40 72 0 q26 140 0 280Z" fill="hsl(194 28% 7%)" />
        <g fill="hsl(194 28% 6%)">
          <Pagoda x={756} y={420} s={1.05} />
        </g>
        {/* lantern on the near pillar */}
        <circle cx="792" cy="470" r="5" fill="hsl(10 85% 55%)" className="ember-pulse" />
        <circle cx="792" cy="470" r="16" fill="hsl(10 85% 55% / 0.18)" className="ember-pulse" />

        {/* foreground ridge */}
        <path d="M0 640 C200 600 360 650 560 620 S 980 600 1200 630 L1200 700 L0 700Z" fill="hsl(192 26% 6%)" />

        {/* drifting cloud scrolls */}
        <g className="cloud-drift" opacity="0.5" fill="none" stroke="hsl(195 25% 70% / 0.35)" strokeWidth="2">
          <Cloud x={220} y={360} />
          <Cloud x={1010} y={300} flip />
        </g>
      </svg>
    </div>
  );
}

function Pagoda({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-34 0 Q0 -14 34 0 L28 4 L-28 4Z" />
      <rect x="-14" y="4" width="28" height="18" />
      <path d="M-28 22 Q0 10 28 22 L22 26 L-22 26Z" />
      <rect x="-10" y="26" width="20" height="16" />
      <path d="M-22 42 Q0 32 22 42 L17 46 L-17 46Z" />
      <rect x="-1.5" y="-18" width="3" height="18" />
    </g>
  );
}

// Xiangyun auspicious-cloud curl.
function Cloud({ x, y, flip }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M0 0 c-20 0 -30 -22 -12 -30 c14 -6 26 6 20 16 c-4 6 -14 4 -12 -2" />
      <path d="M8 0 h120 c18 0 22 -18 10 -24 c-10 -5 -20 4 -14 12" />
    </g>
  );
}