import React, { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { codeHint } from "@/lib/prizes";
import { cn } from "@/lib/utils";

// A code box that hides what is typed unless Show is pressed, with a check underneath.
// It is a plain text box drawn as dots (not a password box), so the browser never offers
// to save the code as a password; autocomplete and spellcheck are off.
// Browsers that can draw a text box as dots; the rest use a password box (marked so it
// isn't saved as a password).
const CAN_MASK = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-text-security", "disc");

export default function CodeInput({ value, onChange, label = "The code", id, autoFocus = false }) {
  const auto = useId();
  const inputId = id || `code-${auto}`;
  const [show, setShow] = useState(false);
  const hint = codeHint(value);
  return (
    <div>
      <label htmlFor={inputId} className="label">{label}</label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type={show || CAN_MASK ? "text" : "password"}
          name="prize-code"
          data-lpignore="true"
          data-1p-ignore="true"
          style={show || !CAN_MASK ? undefined : { WebkitTextSecurity: "disc" }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={show || CAN_MASK ? "off" : "new-password"}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="XXXX XXXX XXXX XXXX"
          className="field h-12 min-w-0 flex-1 font-heading text-lg tracking-[0.12em]"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="btn-bronze h-12 shrink-0 px-3 text-sm" aria-pressed={show} aria-label={show ? "Hide the code" : "Show the code"}>
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          <span className="hidden sm:inline">{show ? "Hide" : "Show"}</span>
        </button>
      </div>
      {hint.text && <p className={cn("mt-1 text-[13px]", hint.ok ? (hint.warn ? "text-[#e8c15a]" : "text-[#6fd3a2]") : "text-ember")}>{hint.text}</p>}
    </div>
  );
}