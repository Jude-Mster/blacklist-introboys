import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { useGuild, errorText } from "@/lib/GuildContext";
import RankBadge from "@/components/RankBadge";
import { cn } from "@/lib/utils";

const PAGE = 40;
const POLL_MS = 10000;
const ROLE_COLOR = { leader: "text-gold", officer: "text-jade", guild_member: "text-azure", member: "text-[hsl(var(--foreground))]" };

const rows = (res) => (Array.isArray(res) ? res : (res && res.items) || []);
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// Live chat. `channels` is a list of { id, label }; the first one opens by default.
export default function ChatBox({ channels = [{ id: "guild", label: "Guild" }], className, height = "h-80", frameless = false, onIncoming }) {
  const { account, settings } = useGuild();
  const me = account && account.member;
  const canModerate = me && (me.role === "officer" || me.role === "leader");
  const [active, setActive] = useState(channels[0].id);
  const [messages, setMessages] = useState({}); // channel -> [msg]
  const [unread, setUnread] = useState({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;
  const channelIds = channels.map((c) => c.id).join("|");

  // Keep the active channel valid if the list changes (e.g. leaving a table).
  useEffect(() => {
    if (!channels.some((c) => c.id === active)) setActive(channels[0].id);
  }, [channelIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const merge = useCallback((channel, incoming) => {
    setMessages((m) => {
      const byId = new Map((m[channel] || []).map((x) => [x.id, x]));
      for (const x of incoming) byId.set(x.id, x);
      const list = [...byId.values()].sort((a, b) => (a.created_date < b.created_date ? -1 : 1)).slice(-120);
      return { ...m, [channel]: list };
    });
  }, []);

  const load = useCallback(
    async (channel) => {
      try {
        const res = await base44.entities.ChatMessage.filter({ channel }, { sort: "-created_date", limit: PAGE });
        merge(channel, rows(res));
      } catch {
        /* chat is best effort */
      }
    },
    [merge]
  );

  // Initial load, live updates, and a slow poll as a safety net.
  useEffect(() => {
    const ids = channelIds.split("|");
    ids.forEach(load);
    let unsub = () => {};
    try {
      unsub = base44.entities.ChatMessage.subscribe((ev) => {
        const msg = ev && ev.data;
        if (!msg || !ids.includes(msg.channel)) return;
        merge(msg.channel, [{ ...msg, id: msg.id || ev.id }]);
        if (ev.type === "create" && msg.channel !== activeRef.current) {
          setUnread((u) => ({ ...u, [msg.channel]: (u[msg.channel] || 0) + 1 }));
        }
        if (ev.type === "create" && incomingRef.current) incomingRef.current(msg);
      });
    } catch {
      /* realtime unavailable: polling covers it */
    }
    const poll = setInterval(() => ids.forEach(load), POLL_MS);
    return () => {
      clearInterval(poll);
      unsub && unsub();
    };
  }, [channelIds, load, merge]);

  const list = messages[active] || [];

  // Stick to the bottom when new messages arrive, unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [list.length, active]);

  useEffect(() => {
    setUnread((u) => ({ ...u, [active]: 0 }));
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await base44.functions.invoke("chatSend", { channel: active, text: t });
      if (res.data && res.data.message) merge(active, [res.data.message]);
      setText("");
    } catch (err) {
      setError(errorText(err, "Message not sent."));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    try {
      await base44.functions.invoke("chatSend", { action: "delete", id });
      merge(active, [{ ...list.find((m) => m.id === id), deleted: true, text: "" }]);
    } catch (err) {
      setError(errorText(err, "Couldn't remove that message."));
    }
  };

  const off = settings && settings.chat_enabled === false;

  return (
    <Frame frameless={frameless} title={channels.length === 1 ? `${channels[0].label} chat` : "Chat"} className={className}>
      {channels.length > 1 && (
        <div className="-mt-1 mb-3 flex gap-1.5" role="tablist" aria-label="Chat channels">
          {channels.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={active === c.id}
              data-on={active === c.id}
              onClick={() => setActive(c.id)}
              className="btn-bronze relative h-8 px-3 text-xs"
            >
              {c.label}
              {unread[c.id] > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-[hsl(43_70%_92%)]">
                  {unread[c.id] > 9 ? "9+" : unread[c.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} className={cn("-mx-1 overflow-y-auto overscroll-contain px-1", height)} aria-live="polite" aria-label="Messages">
        {list.length === 0 && <p className="py-8 text-center text-sm text-mist">No messages yet. Say hello to the guild.</p>}
        <ul className="space-y-2.5">
          {list.map((m) =>
            m.kind === "system" ? (
              <li key={m.id} className="text-center text-xs italic text-mist">{m.text}</li>
            ) : (
              <li key={m.id} className="group flex gap-2">
                <Avatar url={m.avatar} name={m.name} size={26} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs">
                    <span className={cn("truncate font-bold", ROLE_COLOR[m.role] || ROLE_COLOR.member)}>{m.name}</span>
                    <RankBadge role={m.role} short />
                    {m.kind === "discord" && m.role !== "guest" && (
                      <span className="shrink-0 text-[10px] text-[#A5ADFF]" title="Sent from Discord">via Discord</span>
                    )}
                    <span className="shrink-0 text-mist/70">{time(m.created_date)}</span>
                    {canModerate && !m.deleted && (
                      <button
                        onClick={() => remove(m.id)}
                        className="ml-auto shrink-0 text-mist/60 opacity-60 hover:text-ember group-hover:opacity-100"
                        aria-label={`Remove message from ${m.name}`}
                        title="Remove message"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </p>
                  <p className={cn("break-words text-sm", m.deleted ? "italic text-mist/60" : "text-[hsl(var(--foreground))]")}>
                    {m.deleted ? "Message removed" : m.text}
                  </p>
                </div>
              </li>
            )
          )}
        </ul>
      </div>

      {off ? (
        <p className="mt-3 text-center text-xs text-mist">Chat is turned off right now.</p>
      ) : (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder={me && me.banned ? "You can't chat while banned" : "Write a message"}
            disabled={!me || me.banned}
            aria-label="Message"
            className="field h-10 min-w-0 flex-1 text-sm"
          />
          <button type="submit" disabled={sending || !text.trim()} className="btn-seal h-10 w-11 shrink-0" aria-label="Send message">
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-ember">{error}</p>}
    </Frame>
  );
}

function Frame({ frameless, title, className, children }) {
  if (frameless) return <div className={cn("flex min-h-0 flex-col", className)}>{children}</div>;
  return (
    <Panel title={title} className={className}>
      {children}
    </Panel>
  );
}