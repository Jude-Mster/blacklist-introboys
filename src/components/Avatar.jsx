import React, { useState } from "react";
import { cn } from "@/lib/utils";

// Discord avatar with a fallback to the member's initial if the image is missing or fails.
export default function Avatar({ url, name, size = 36, className }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      style={style}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-crimson font-heading font-bold text-gold", className)}
      aria-hidden="true"
    >
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}