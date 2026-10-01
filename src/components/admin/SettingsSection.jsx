import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Panel from "@/components/Panel";
import { useGuild } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const GAMES = [
  { id: "coinflip", label: "Coin Flip" },
  { id: "dragondice", label: "Dragon Dice" },
  { id: "lanternslots", label: "Lantern Slots" }
];

export default function SettingsSection() {
  const { settings, loadSettings } = useGuild();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  if (!settings) return null;
  const s = form || settings;
  const set = (k, v) => setForm({ ...s, [k]: v });

  const save = async () => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const payload = {
        ...s,
        min_bet: Number(s.min_bet),
        max_bet: Number(s.max_bet),
        daily_bet_cap: Number(s.daily_bet_cap),
        house_edge_pct: Number(s.house_edge_pct),
        award_cap_per_day: Number(s.award_cap_per_day),
        daily_wheel_prizes: String(s.daily_wheel_prizes).split(",").map((x) => Number(x.trim())).filter((n) => !isNaN(n))
      };
      await base44.functions.invoke("adminAction", { action: "updateSettings", settings: payload });
      setMsg("Settings saved.");
      setForm(null);
      await loadSettings();
    } catch (e) {
      const data = e && e.response && e.response.data;
      setError(data && data.error ? data.error : e.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await base44.functions.invoke("registerCommands");
      setMsg(`Registered ${res.data.registered} slash commands.`);
    } catch (e) {
      const data = e && e.response && e.response.data;
      setError(data && data.error ? data.error : e.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6">
      <h2 className="font-heading text-xl text-gold font-bold mb-1">Settings</h2>
      <p className="text-sm text-muted-foreground mb-4">Leader only. Configure the guild and game rules.</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Guild ID" value={s.guild_id} onChange={(v) => set("guild_id", v)} />
        <Field label="Officer role ID" value={s.officer_role_id} onChange={(v) => set("officer_role_id", v)} />
        <Field label="Min bet" type="number" value={s.min_bet} onChange={(v) => set("min_bet", v)} />
        <Field label="Max bet" type="number" value={s.max_bet} onChange={(v) => set("max_bet", v)} />
        <Field label="Daily bet cap" type="number" value={s.daily_bet_cap} onChange={(v) => set("daily_bet_cap", v)} />
        <Field label="House edge %" type="number" value={s.house_edge_pct} onChange={(v) => set("house_edge_pct", v)} />
        <Field label="Award cap / day" type="number" value={s.award_cap_per_day} onChange={(v) => set("award_cap_per_day", v)} />
        <Field label="Daily wheel prizes (comma)" value={Array.isArray(s.daily_wheel_prizes) ? s.daily_wheel_prizes.join(",") : s.daily_wheel_prizes} onChange={(v) => set("daily_wheel_prizes", v)} />
      </div>

      <div className="mt-4">
        <Label className="text-muted-foreground">Enabled games</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {GAMES.map((g) => {
            const on = (s.games_enabled || []).includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => set("games_enabled", on ? s.games_enabled.filter((x) => x !== g.id) : [...(s.games_enabled || []), g.id])}
                className={cn("px-3 py-1.5 rounded-md text-sm border", on ? "bg-crimson text-gold border-gold/50" : "border-gold/30 text-muted-foreground")}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {msg && <p className="text-jade text-sm mt-4">{msg}</p>}
      {error && <p className="text-ember text-sm mt-4">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={save} disabled={busy} className="bg-crimson hover:bg-ember text-gold font-heading tracking-wider border border-gold/40">
          {busy ? "Saving…" : "Save settings"}
        </Button>
        <Button onClick={register} disabled={busy} variant="outline" className="border-gold/40 text-gold hover:bg-gold/10">
          Register Discord slash commands
        </Button>
      </div>
    </Panel>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <Label className="text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 bg-ink/60 border-gold/30 text-gold tabular-nums" />
    </div>
  );
}