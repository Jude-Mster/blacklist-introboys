import React, { useEffect } from "react";
import { X } from "lucide-react";
import ChatBox from "@/components/chat/ChatBox";
import { cn } from "@/lib/utils";

// Guild chat as a panel that slides in from the right on every page.
// It stays mounted while closed so new-message counts keep working.
export default function ChatDrawer({ open, onClose, onIncoming }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      aria-label="Guild chat"
      aria-hidden={!open}
      inert={open ? undefined : ""}
      className={cn(
        "fixed right-0 top-14 z-40 flex w-full flex-col border-l border-bronze/60 bg-[hsl(0_0%_7%/0.98)] shadow-[-20px_0_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md transition-transform duration-200 sm:top-16 md:w-[360px]",
        "bottom-[calc(76px+var(--safe-bottom))] md:bottom-0",
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-bronze/50 bg-gradient-to-b from-bronze/25 to-transparent px-4">
        <h2 className="font-heading text-base font-bold text-gold">Guild chat</h2>
        <button onClick={onClose} className="rounded-md p-1.5 text-mist hover:text-gold" aria-label="Close chat">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <ChatBox frameless onIncoming={onIncoming} className="h-full" height="flex-1 min-h-0" />
      </div>
    </aside>
  );
}