import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Ingot } from "@/components/SealLogo";
import { errorText } from "@/lib/GuildContext";

// Choose how many points to bring to the table.
export default function BuyIn({ table, balance, onConfirm, onCancel, label = "Sit down" }) {
  const max = Math.min(table.max_buyin, balance);
  const start = Math.min(max, Math.max(table.min_buyin, Math.round(table.max_buyin / 2)));
  const [amount, setAmount] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const short = balance < table.min_buyin;

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm(amount);
    } catch (e) {
      setError(errorText(e, "Couldn't sit down."));
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-md border border-bronze/50 bg-black/25 p-4">
      {short ? (
        <p className="text-sm text-ember">
          You need at least {table.min_buyin.toLocaleString()} points to sit here. You have {balance.toLocaleString()}.
        </p>
      ) : (
        <>
          <label htmlFor={`buyin-${table.id}`} className="label">
            Bring to the table
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`buyin-${table.id}`}
              type="range"
              min={table.min_buyin}
              max={max}
              step={Math.max(1, table.big_blind)}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 accent-[hsl(var(--gold))]"
            />
            <span className="flex min-w-[6rem] items-center justify-end gap-1 font-heading text-lg font-bold text-gold tabular-nums">
              <Ingot size={16} /> {amount.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-xs text-mist">
            {Math.floor(amount / table.big_blind)} big blinds. Your balance after: {(balance - amount).toLocaleString()}.
          </p>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
      <div className="mt-3 flex gap-2">
        {!short && (
          <button onClick={go} disabled={busy} className="btn-seal h-10 px-5 text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `${label} with ${amount.toLocaleString()}`}
          </button>
        )}
        <button onClick={onCancel} className="btn-bronze h-10 px-4 text-sm">Cancel</button>
      </div>
    </div>
  );
}