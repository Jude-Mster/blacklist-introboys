import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { tableGuard } from "@/lib/tableGuard";
import { errorText } from "@/lib/GuildContext";

// Asks "leave the table?" before a seated member moves to another page or game.
// Opening the chat is not a move, so it never asks.
export default function LeaveTableGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(null); // { go } while the question is up
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = useCallback((go) => { setError(""); setPending({ go }); }, []);
  useEffect(() => tableGuard.listen(ask), [ask]);

  // Links anywhere on the page (menus, tabs, buttons that are links).
  useEffect(() => {
    const onClick = (e) => {
      if (!tableGuard.get() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      const here = window.location.pathname + window.location.search;
      const there = url.pathname + url.search;
      if (here === there) return;
      e.preventDefault();
      e.stopPropagation();
      ask(() => navigate(there));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ask, navigate]);

  // Closing the tab or reloading while seated: the browser shows its own warning.
  useEffect(() => {
    const onUnload = (e) => {
      if (!tableGuard.get()) return undefined;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // If the page changed some other way, drop the question.
  useEffect(() => { setPending(null); }, [location.pathname, location.search]);

  if (!pending) return null;
  const guard = tableGuard.get();
  if (!guard) return null;
  const canLeave = guard.canLeave();

  const leave = async () => {
    setBusy(true);
    setError("");
    try {
      await guard.leave();
      const go = pending.go;
      setPending(null);
      go();
    } catch (e) {
      setError(errorText(e, "Couldn't leave the table. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="leave-table-title">
      <div className="w-full max-w-sm rounded-lg border border-crimson bg-[hsl(0_0%_8%)] p-4 shadow-2xl">
        <h2 id="leave-table-title" className="font-heading text-lg font-bold text-gold">Leave the table?</h2>
        <p className="mt-2 text-sm text-mist">{guard.message()}</p>
        {error && <p role="alert" className="mt-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPending(null)} disabled={busy} className={canLeave ? "btn-bronze h-11 text-sm" : "btn-seal col-span-2 h-11 text-sm"}>
            Stay at the table
          </button>
          {canLeave && (
            <button type="button" onClick={leave} disabled={busy} className="btn-seal h-11 text-sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Leave table"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}