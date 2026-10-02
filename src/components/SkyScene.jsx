import React from "react";
import { cn } from "@/lib/utils";

// Backdrop in the style of the guild logo: black, a faint vertical grain,
// the white brush "S" as a huge watermark and two red brush slashes.
export default function SkyScene({ className, dim = false }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-[#050505]", className)} aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, hsl(0 0% 100% / 0.028) 0 1px, transparent 1px 4px), radial-gradient(60rem 34rem at 50% 115%, hsl(357 80% 40% / 0.32), transparent 62%)"
        }}
      />
      <img
        src="/logo-mark.png"
        alt=""
        className="float-slow absolute left-1/2 top-1/2 w-[150vw] max-w-none -translate-x-1/2 -translate-y-1/2 select-none sm:w-[62rem]"
        style={{ opacity: dim ? 0.035 : 0.055 }}
      />
      <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <g fill="#C8161D" opacity={dim ? 0.35 : 0.6}>
          <path d="M-40 618 C180 560 420 590 640 548 C660 544 668 556 650 564 C440 620 200 612 -40 676Z" />
          <path d="M1240 92 C1060 120 900 108 760 142 C744 146 742 136 756 130 C900 84 1080 84 1240 44Z" />
        </g>
      </svg>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 45%, hsl(0 0% 0% / 0.75))" }} />
    </div>
  );
}