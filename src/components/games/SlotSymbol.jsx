import React from "react";
import { Seal, Ingot } from "@/components/SealLogo";

// Artwork for each Lantern Slots symbol.
export default function SlotSymbol({ id, size = 44 }) {
  switch (id) {
    case "seal":
      return <Seal size={size * 0.9} />;
    case "dragon":
      return (
        <span
          className="flex items-center justify-center rounded-full font-heading font-extrabold"
          style={{
            width: size * 0.9,
            height: size * 0.9,
            fontSize: size * 0.5,
            color: "#E9F5F1",
            background: "radial-gradient(circle at 35% 30%, #6FCBB8, #2E7F72 60%, #164A42)",
            border: "2px solid #F2F2F2"
          }}
          lang="zh-Hant"
          aria-label="Dragon"
        >
          龍
        </span>
      );
    case "lantern":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Lantern" role="img">
          <line x1="20" y1="2" x2="20" y2="7" stroke="#F2F2F2" strokeWidth="1.5" />
          <rect x="13" y="7" width="14" height="3" rx="1" fill="#F2F2F2" />
          <ellipse cx="20" cy="21" rx="12" ry="12" fill="#C42A2A" stroke="#F2F2F2" strokeWidth="1.2" />
          <path d="M20 9 V33 M12 14 Q20 21 12 28 M28 14 Q20 21 28 28" stroke="#FFFFFF" strokeOpacity="0.55" fill="none" />
          <ellipse cx="20" cy="21" rx="4.5" ry="6.5" fill="#FFD27A" opacity="0.8" />
          <rect x="12" y="32" width="16" height="3" rx="1" fill="#F2F2F2" />
          <path d="M18 35 L17 39 M20 35 V39 M22 35 L23 39" stroke="#F2F2F2" strokeWidth="1" />
        </svg>
      );
    case "maple":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Maple leaf" role="img">
          <path
            d="M12 2 L13.5 7 L18 5 L16 9.5 L21 11 L16.5 12.5 L18 17 L13.5 15 L12 22 L10.5 15 L6 17 L7.5 12.5 L3 11 L8 9.5 L6 5 L10.5 7 Z"
            fill="#E0552E"
            stroke="#8A2A14"
            strokeWidth="0.6"
          />
          <path d="M12 22 V9" stroke="#8A2A14" strokeWidth="0.6" />
        </svg>
      );
    case "ingot":
    default:
      return <Ingot size={size} />;
  }
}

export const SYMBOL_NAME = { seal: "Seal", dragon: "Dragon", lantern: "Lantern", maple: "Maple leaf", ingot: "Ingot" };