import React, { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Languages, Loader2, Send, Shield, Trash2, X, Swords, Store } from "lucide-react";
import BuySellChat from "@/components/buysell/BuySellChat";
import { readImage } from "@/lib/buysell";
import { war, warError, newId, WAR_LANGS, WAR_LANG_NAME, CHAT_MAX_LEN, chatPrefs, saveChatPrefs } from "@/lib/warRoom";
import { cn } from "@/lib/utils";

// 6.34: the War Room's chat box, with two tabs: the War Room chat (only the commanders and the council can
// read it; names in their guild's colour; pictures; auto-translated into English, Filipino, Turkish, Thai,
// Indonesian and Chinese (Taiwan)) and the Market (the site's open Buy and Sell chat).
export default function WarChat({ me, open, onClose, onUnread, className }) {
  const [tab, setTab] = useState("war");
  const [msgs, setMsgs] = useState([]);
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState(chatPrefs);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState("");
  const [note, setNote] = useState("");
  const [orig, setOrig] = useState({});
  const [big, setBig] = useState("");
  const [unread, setUnread] = useState(0);
  const lastId = useRef("");
  const since = useRef("");
  const listRef = useRef(null);
  const atBottom = useRef(true);
  const fileRef = useRef(null);
  const seeing = open && tab === "war";
  const seeingRef = useRef(seeing); seeingRef.current = seeing;

  const merge = useCallback((fresh, updates) => {
    setMsgs((cur) => {
      let out = cur;
      if (updates && updates.length) {
        const byId = new Map(updates.map((m) => [m.id, m]));
        out = out.map((m) => byId.get(m.id) || m);
      }
      const have = new Set(out.map((m) => m.id));
      const add = (fresh || []).filter((m) => !have.has(m.id));
      return add.length ? [...out, ...add].slice(-200) : out;
    });
  }, []);

  // Asks for new messages every 2 seconds while the War Room chat is on screen, every 8 while it isn't.
  useEffect(() => {
    let alive = true, t = 0;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) {
        try {
          const r = await war("chat", { after: lastId.current, trSince: since.current });
          if (!alive) return;
          const first = !lastId.current;
          if (r.messages.length) lastId.current = r.messages[r.messages.length - 1].id;
          since.current = r.now;
          merge(r.messages, r.updates);
          const others = first ? 0 : r.messages.filter((m) => m.who !== me.id && !m.removed).length;
          if (others && !seeingRef.current) setUnread((n) => n + others);
          setReady(true);
        } catch { /* next time */ }
      }
      t = setTimeout(tick, seeingRef.current ? 2000 : 8000);
    };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [me.id, merge]);

  useEffect(() => { if (seeing) setUnread(0); }, [seeing]);
  useEffect(() => { if (onUnread) onUnread(unread); }, [unread, onUnread]);
  // keep the newest message in view, unless the reader scrolled up
  useEffect(() => { const el = listRef.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; }, [msgs, seeing]);
  const onScroll = () => { const el = listRef.current; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };

  const setPref = (p) => { const next = { ...prefs, ...p }; setPrefs(next); saveChatPrefs(next); };

  const pick = async (file) => {
    setNote("");
    try { setImage(await readImage(file)); } catch (e) { setNote(e.message || "Couldn't read that picture."); }
  };
  const send = async (e) => {
    if (e) e.preventDefault();
    const text = draft.trim().slice(0, CHAT_MAX_LEN);
    if (!text && !image) return;
    const temp = { id: "tmp" + newId(), who: me.id, name: me.name, guild: me.guild, color: me.color, level: me.access, text, image, pending: true, at: new Date().toISOString() };
    setDraft(""); setImage(""); setNote(""); atBottom.current = true;
    setMsgs((cur) => [...cur, temp]);
    try {
      const r = await war("chatSend", { text, image });
      setMsgs((cur) => cur.map((m) => (m.id === temp.id ? r.message : m)));
      if (r.message.text) {
        war("chatTranslate", { id: r.message.id }).then((t) => setMsgs((cur) => cur.map((m) => (m.id === t.message.id ? t.message : m)))).catch(() => {});
      }
    } catch (x) {
      setMsgs((cur) => cur.filter((m) => m.id !== temp.id));
      setDraft((d) => d || text); if (image) setImage((i) => i || image);
      setNote(`Not sent: ${warError(x)}`);
    }
  };
  const remove = async (m) => {
    setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, removed: true, text: "", image: "", tr: null } : x)));
    try { await war("chatRemove", { id: m.id }); } catch (x) { setNote(warError(x)); }
  };
  const onKey = (e) => {
    const touch = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !touch) send(e);
  };
  const onPaste = (e) => {
    const f = [...(e.clipboardData && e.clipboardData.files ? e.clipboardData.files : [])].find((x) => /^image\//.test(x.type));
    if (f) { e.preventDefault(); pick(f); }
  };

  return (
    <section aria-label="War Room chat" className={cn("war-chat flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-bronze/40 bg-[#0d1110]", className)}>
      <div className="flex items-stretch border-b border-bronze/30">
        <div role="tablist" aria-label="Chat" className="flex flex-1">
          <ChatTab on={tab === "war"} onClick={() => setTab("war")}><Swords className="h-4 w-4" /> War Room{unread > 0 && tab !== "war" ? <Badge n={unread} /> : null}</ChatTab>
          <ChatTab on={tab === "market"} onClick={() => setTab("market")}><Store className="h-4 w-4" /> Market</ChatTab>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close the chat" className="grid w-11 place-items-center text-mist hover:text-white"><X className="h-4 w-4" /></button>}
      </div>

      {tab === "market" ? (
        <div className="min-h-0 flex-1"><BuySellChat member={!me.guest} compact className="h-full rounded-none border-0" /></div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-bronze/20 px-3 py-2">
            <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-mist">
              <Languages className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="sr-only">Show messages in</span>
              <select value={prefs.lang} onChange={(e) => setPref({ lang: e.target.value })} className="h-8 min-w-0 flex-1 rounded border border-bronze/40 bg-black px-1.5 text-sm text-[#e9e4df]">
                {WAR_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
            <button type="button" role="switch" aria-checked={prefs.auto} onClick={() => setPref({ auto: !prefs.auto })}
              className={cn("flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs", prefs.auto ? "border-[#c9a227] text-[#f2d27a]" : "border-bronze/40 text-mist")}>
              <span aria-hidden="true" className={cn("relative h-3.5 w-6 rounded-full transition-colors", prefs.auto ? "bg-[#c9a227]" : "bg-white/15")}>
                <span className={cn("absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all", prefs.auto ? "left-3" : "left-0.5")} />
              </span>Translate
            </button>
          </div>

          <ol ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3" aria-live="polite">
            {!ready && <li className="flex items-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading the chat</li>}
            {ready && !msgs.length && <li className="py-6 text-center text-sm text-mist">No messages yet. Only the commanders and the council can read this chat.</li>}
            {msgs.map((m) => (
              <Message key={m.id} m={m} mine={m.who === me.id} canRemove={m.who === me.id || me.access === "command"} prefs={prefs}
                original={!!orig[m.id]} onToggle={() => setOrig((o) => ({ ...o, [m.id]: !o[m.id] }))} onRemove={() => remove(m)} onOpen={setBig} />
            ))}
          </ol>

          <form onSubmit={send} className="border-t border-bronze/30 p-2">
            {image && (
              <div className="mb-2 flex items-center gap-2">
                <img src={image} alt="Picture to send" className="h-14 w-14 rounded object-cover" />
                <button type="button" onClick={() => setImage("")} className="text-xs text-mist underline">Remove picture</button>
              </div>
            )}
            {note && <p role="alert" className="mb-1.5 text-xs text-ember">{note}</p>}
            <div className="flex items-end gap-1.5">
              <button type="button" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Add a picture" title="Add a picture (up to 10 MB)" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-bronze/40 text-mist hover:text-white"><ImagePlus className="h-4 w-4" /></button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) pick(f); }} />
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onPaste={onPaste} rows={Math.min(4, Math.max(1, draft.split("\n").length))} maxLength={CHAT_MAX_LEN}
                placeholder={`Message as ${me.name}`} aria-label="Message" className="field min-h-10 flex-1 resize-none py-2 text-sm" />
              <button type="submit" disabled={!draft.trim() && !image} aria-label="Send" className="btn-seal grid h-10 w-10 shrink-0 place-items-center !p-0"><Send className="h-4 w-4" /></button>
            </div>
          </form>
        </>
      )}

      {big && (
        <div role="dialog" aria-modal="true" aria-label="Picture" className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-4" onClick={() => setBig("")}>
          <img src={big} alt="" className="max-h-full max-w-full rounded" />
          <button type="button" onClick={() => setBig("")} aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/40 text-white"><X className="h-5 w-5" /></button>
        </div>
      )}
    </section>
  );
}

function ChatTab({ on, onClick, children }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick}
      className={cn("flex h-11 flex-1 items-center justify-center gap-1.5 font-heading text-sm font-bold tracking-[0.06em]", on ? "text-gold shadow-[inset_0_-2px_0_hsl(var(--gold))]" : "text-mist hover:text-white")}>
      {children}
    </button>
  );
}
export const Badge = ({ n }) => <span className="ml-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-[#e3171d] px-1 font-body text-[11px] tracking-normal text-white">{n > 99 ? "99+" : n}</span>;

// A name in its guild's colour, with the guild beside it.
export function GuildName({ name, guild, color, small, command }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={cn("truncate font-bold", small ? "text-xs" : "text-sm")} style={{ color }}>{name}</span>
      {command && <Shield className="h-3 w-3 shrink-0" style={{ color }} aria-label="Commander" />}
      {guild && <span className="max-w-[9rem] shrink truncate rounded border px-1 text-[10px] font-bold uppercase leading-4 tracking-wide" style={{ color, borderColor: `${color}66` }}>{guild}</span>}
    </span>
  );
}

function Message({ m, mine, canRemove, prefs, original, onToggle, onRemove, onOpen }) {
  const translated = !original && prefs.auto && m.tr && m.lang && m.lang !== prefs.lang && m.tr[prefs.lang] && m.tr[prefs.lang] !== m.text;
  const time = (() => { const d = new Date(String(m.at || "").replace(/Z\d+$/, "Z").replace(/(\.\d{3})\d+$/, "$1").replace(/(\d)$/, "$1Z")); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); })();
  return (
    <li className={cn("group flex flex-col gap-0.5 rounded-md px-2 py-1.5", mine ? "bg-white/[0.04]" : "")} style={{ boxShadow: `inset 3px 0 0 ${m.color}` }}>
      <div className="flex items-center gap-2">
        <GuildName name={m.name} guild={m.guild} color={m.color} command={m.level === "command"} />
        <span className="ml-auto shrink-0 text-[11px] text-mist/70">{m.pending ? "sending…" : time}</span>
        {canRemove && !m.removed && !m.pending && <button type="button" onClick={onRemove} aria-label="Remove this message" className="shrink-0 text-mist/60 opacity-60 hover:text-ember group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {m.removed ? <p className="text-xs italic text-mist/70">Message removed</p> : (
        <>
          {m.text && <p className="whitespace-pre-wrap text-sm leading-snug text-[#e9e6dc] [overflow-wrap:anywhere]">{translated ? m.tr[prefs.lang] : m.text}</p>}
          {m.image && <button type="button" onClick={() => onOpen(m.image)} className="mt-1 self-start"><img src={m.image} alt="Picture in the chat" loading="lazy" className="max-h-48 max-w-full rounded border border-white/10 object-contain" /></button>}
          {(translated || (original && m.tr)) && (
            <button type="button" onClick={onToggle} className="self-start text-[11px] text-mist underline">
              {translated ? `Translated from ${WAR_LANG_NAME[m.lang] || "another language"} · show original` : "Show translation"}
            </button>
          )}
        </>
      )}
    </li>
  );
}
