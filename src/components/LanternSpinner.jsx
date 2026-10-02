import React from "react";
import { cn } from "@/lib/utils";

// Loading mark: the guild's brush "S", pulsing.
export default function LanternSpinner({ label = "Loading", className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} role="status">
      <img src="https://base44.app/api/apps/6abe8bba244ec63c6d6d2855/files/mp/public/6abe8bba244ec63c6d6d2855/de4f11b7b_logo-mark.png" alt="" width={48} height={48} className="ember-pulse h-12 w-12 object-contain drop-shadow-[0_0_14px_rgba(200,22,29,0.8)]" />
      {label && <p className="text-sm text-mist">{label}</p>}
    </div>
  );
}