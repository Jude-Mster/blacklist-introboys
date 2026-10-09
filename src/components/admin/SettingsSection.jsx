import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { useGuild, errorText } from "@/lib/GuildContext";
import { GAMES } from "@/lib/games";

const DEFAULT_MEMBER_ROLE_ID = "1309724734203887647";

export default function SettingsSection() {
  const { settings, loadSettings, reload } = useGuild();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  if (!settings) return null;
  const s = form || settings;
  const set = (k, v) => setForm({ ...s, [k]: v });

  const call = async (fn, done) => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const text = await fn();
      setMsg(text || done);
    } catch (e) {
      setError(errorText(e, "That didn't save."));
    } finally {
      setBusy(false);
    }
  };

  const save = (e) => {
    e.preventDefault();
    call(async () => {
      await base44.functions.invoke("adminAction", {
        action: "updateSettings",
        settings: {
          guild_id: s.guild_id,
          officer_role_id: s.officer_role_id,
          discord_invite_url: s.discord_invite_url,
          member_role_id: s.member_role_id ?? DEFAULT_MEMBER_ROLE_ID,
          app_download_url: s.app_download_url || "",
          min_bet: s.min_bet,
          max_bet: s.max_bet,
          daily_bet_cap: s.daily_bet_cap,
          derby_max_bet: s.derby_max_bet ?? 2000,
          house_edge_pct: s.house_edge_pct,
          award_cap_per_day: s.award_cap_per_day,
          daily_wheel_prizes: Array.isArray(s.daily_wheel_prizes) ? s.daily_wheel_prizes : String(s.daily_wheel_prizes).split(","),
          games_enabled: s.games_enabled || [],
          chat_enabled: s.chat_enabled !== false
        }
      });
      setForm(null);
      await Promise.all([loadSettings(), reload()]);
    }, "Settings saved.");
  };

  const register = () =>
    call(async () => {
      const res = await base44.functions.invoke("registerCommands");
      return `Registered ${res.data.registered} slash commands. They can take a minute to show in Discord.`;
    });

  return (
    <Panel title="Guild settings">
      <form onSubmit={save} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-2 font-heading font-bold text-gold">Discord</legend>
          <Field
            id="guild_id"
            label="Server ID"
            hint="In Discord: Settings → Advanced → Developer Mode on, then long-press your server → Copy Server ID."
            value={s.guild_id}
            onChange={(v) => set("guild_id", v.trim())}
            inputMode="numeric"
          />
          <Field
            id="officer_role_id"
            label="Officer role ID"
            hint="Members with this Discord role can use /award. Server Settings → Roles → long-press the role → Copy Role ID."
            value={s.officer_role_id}
            onChange={(v) => set("officer_role_id", v.trim())}
            inputMode="numeric"
          />
          <Field
            id="member_role_id"
            label="Required member role ID"
            hint="Only people with this Discord role can use the site. Everyone else sees a message to talk to the Guild Leader. Leave empty to allow anyone in the server."
            value={s.member_role_id ?? DEFAULT_MEMBER_ROLE_ID}
            onChange={(v) => set("member_role_id", v.trim())}
            placeholder="1309724734203887647"
          />
          <Field
            id="discord_invite_url"
            label="Invite link"
            hint="Shown to people who try to link but aren't in the server yet."
            value={s.discord_invite_url}
            onChange={(v) => set("discord_invite_url", v.trim())}
            placeholder="https://discord.gg/…"
          />
        </fieldset>

        <fieldset>
          <legend className="mb-3 font-heading font-bold text-gold">Android app</legend>
          <Field
            id="app_download_url"
            label="App download link"
            hint="Direct link to the Blacklist12Sky APK. Members on Android phones, and members still on the old app, are invited to download it. Leave empty to turn the prompt off."
            value={s.app_download_url || ""}
            onChange={(v) => set("app_download_url", v.trim())}
            placeholder="https://blacklistintroboys.com/app/blacklist-introboys.apk"
          />
        </fieldset>

        <fieldset>
          <legend className="mb-3 font-heading font-bold text-gold">Games</legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field id="min_bet" label="Minimum wager" type="number" value={s.min_bet} onChange={(v) => set("min_bet", v)} />
            <Field id="max_bet" label="Maximum wager" type="number" value={s.max_bet} onChange={(v) => set("max_bet", v)} />
            <Field id="daily_bet_cap" label="Daily wager limit" type="number" value={s.daily_bet_cap} onChange={(v) => set("daily_bet_cap", v)} />
            <Field id="derby_max_bet" label="Derby limit per race" type="number" value={s.derby_max_bet ?? 2000} onChange={(v) => set("derby_max_bet", v)} hint="Most one member can bet on one Blacklist Derby race." />
            <Field id="house_edge_pct" label="House edge %" type="number" value={s.house_edge_pct} onChange={(v) => set("house_edge_pct", v)} hint="0 to 20. At 3, games return 97% over time." />
            <Field id="award_cap_per_day" label="Vice Guild Member award cap / 24h" type="number" value={s.award_cap_per_day} onChange={(v) => set("award_cap_per_day", v)} />
            <Field
              id="daily_wheel_prizes"
              label="Daily wheel prizes"
              value={Array.isArray(s.daily_wheel_prizes) ? s.daily_wheel_prizes.join(", ") : s.daily_wheel_prizes}
              onChange={(v) => set("daily_wheel_prizes", v)}
              hint="2 to 12 amounts, separated by commas."
            />
          </div>
          <p className="label mt-4">Open games</p>
          <div className="flex flex-wrap gap-2">
            {GAMES.map((g) => {
              const on = (s.games_enabled || []).includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  data-on={on}
                  aria-pressed={on}
                  onClick={() => set("games_enabled", on ? s.games_enabled.filter((x) => x !== g.id) : [...(s.games_enabled || []), g.id])}
                  className="btn-bronze h-9 px-3 text-sm"
                >
                  {g.name}
                </button>
              );
            })}
          </div>
          <p className="label mt-4">Chat</p>
          <button
            type="button"
            data-on={s.chat_enabled !== false}
            aria-pressed={s.chat_enabled !== false}
            onClick={() => set("chat_enabled", s.chat_enabled === false)}
            className="btn-bronze h-9 px-3 text-sm"
          >
            {s.chat_enabled === false ? "Chat is off" : "Chat is on"}
          </button>
        </fieldset>

        {msg && <p role="status" className="text-sm text-jade">{msg}</p>}
        {error && <p role="alert" className="text-sm text-ember">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !form} className="btn-seal h-11 px-6">
            {busy ? "Saving" : "Save settings"}
          </button>
          <button type="button" onClick={register} disabled={busy} className="btn-bronze h-11 px-4 text-sm">
            Register Discord slash commands
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Field({ id, label, hint, value, onChange, type = "text", ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="field" {...rest} />
      {hint && <p className="mt-1 text-xs text-mist/80">{hint}</p>}
    </div>
  );
}