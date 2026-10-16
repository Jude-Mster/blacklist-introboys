import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Flag, ImagePlus, Languages, MessageSquare, X, Ban, Trash2, ShieldAlert, Loader2 } from "lucide-react";
import {
  LANGS, LANG_NAME, MAX_LEN, NAME_RE, RESERVED, blockedReason, useBuySell, conversations, unreadTotal, send, report, moderate,
  readImage, displayName, bodyOf, ago, hueOf, setLang, setAuto, setViewing, dismissBanner, block, cooldownLeft, api, setMe
} from "@/lib/buysell";
import { cn } from "@/lib/utils";

// 6.25: Wuxen2 Buy and Sell. The whole chat: the open chat, private messages (a list beside it on wide
// screens, a "Private" tab on phones), pictures, auto-translate and an optional name by linking Discord.
// Used full-screen on /buysell (anyone) and in the members portal's Market tab (members post as themselves).

const errText = (e, fallback = "Something went wrong. Try again.") => {
  const d = (e && e.data) || (e && e.response && e.response.data);
  return (d && typeof d.error === "string" && d.error) || (e && e.message) || fallback;
};

function Avatar({ x, size = 36 }) {
  const label = displayName(x);
  const initial = x.kind === "anon" ? "#" : label.slice(0, 1).toUpperCase();
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full font-heading font-bold text-[#0b0a0a]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: x.kind === "member" ? "#f1d38c" : hueOf(x.vid || x.from) }}>
      {initial}
    </span>
  );
}

function Badges({ x }) {
  return (
    <>
      {x.kind === "member" && <span className="rounded-[3px] bg-[#f1d38c] px-1.5 py-px font-heading text-[11px] font-bold tracking-[0.1em] text-[#1a1206]">INTROBOYS</span>}
      {x.kind === "discord" && <span className="text-xs text-[#aab4ff]">Discord</span>}
    </>
  );
}

function Translated({ m, s, original, onFlip, dark }) {
  if (!m.tr || !m.lang || m.lang === s.lang || !s.auto || !m.tr[s.lang] || m.tr[s.lang] === m.text) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px]", dark ? "text-[#c9b8b8]" : "text-[#7f7975]")}>
      <span>{original ? `Original (${LANG_NAME[m.lang] || "other"})` : `Translated from ${LANG_NAME[m.lang] || "another language"}`}</span>
      <button type="button" onClick={onFlip} className={cn("py-1 underline", dark ? "text-[#ff9a9a]" : "text-[#ff6b6b]")}>{original ? "Show translation" : "Show original"}</button>
    </div>
  );
}

// compact: the narrow layout (tabs, no side list) at every screen width, for the members' chat drawer.
export default function BuySellChat({ className = "", member = false, autoName = null, compact = false }) {
  const s = useBuySell("full");
  const me = s.me;
  const [view, setView] = useState("open");        // open | dms | <peer vid>
  const [peerInfo, setPeerInfo] = useState({});    // vid -> { name, tag, kind } for a chat started from a post
  const [showOrig, setShowOrig] = useState({});
  const [reported, setReported] = useState({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState("");
  const [note, setNote] = useState({ text: "", bad: false });
  const [zoom, setZoom] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const [confirmBan, setConfirmBan] = useState("");
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const atBottom = useRef(true);
  const convos = useMemo(() => conversations(s), [s.dms, s.read, s.blocked, s.me]); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = unreadTotal(s);
  const inThread = view !== "open" && view !== "dms";
  const peer = inThread ? (convos.find((c) => c.vid === view) || { vid: view, ...(peerInfo[view] || { tag: "0000", kind: "anon" }) }) : null;
  const thread = inThread ? s.dms.filter((d) => (d.from === view && d.to === me?.vid) || (d.to === view && d.from === me?.vid)) : [];
  const openList = s.open.filter((m) => !s.blocked.includes(m.vid));

  useEffect(() => { setViewing(inThread ? view : ""); return () => setViewing(""); }, [view, inThread]);
  useEffect(() => { if (autoName) setNameOpen(true); }, [autoName]);

  // Keep the newest message in sight unless the reader scrolled up to read older ones.
  const count = inThread ? thread.length : openList.length;
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [count, view]);
  const onScroll = () => {
    const el = listRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => { atBottom.current = true; }, [view]);

  const openThread = (x) => {
    if (!x || !x.vid || (me && x.vid === me.vid)) return;
    setPeerInfo((p) => ({ ...p, [x.vid]: { name: x.name, tag: x.tag, kind: x.kind } }));
    setView(x.vid);
    dismissBanner();
  };

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try { setPending(await readImage(f)); setNote({ text: "Picture ready. Add a message or just press Send.", bad: false }); }
    catch (err) { setNote({ text: errText(err), bad: true }); }
  };

  // 6.26: sending is instant: the message shows straight away (marked "Sending…" until the server has it)
  // and the box is cleared at once, so the next message can be typed while this one goes out.
  const submit = (e) => {
    e.preventDefault();
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text && !pending) return setNote({ text: "Type a message first.", bad: true });
    const bad = blockedReason(text);
    if (bad) return setNote({ text: `${bad} Trade inside the game.`, bad: true });
    const wait = cooldownLeft();
    if (wait > 0) return setNote({ text: `Wait ${Math.ceil(wait / 1000)} s before the next message.`, bad: true });
    const image = pending;
    atBottom.current = true;
    setDraft("");
    setPending("");
    setNote({ text: "", bad: false });
    send({ text, image, to: inThread ? view : "", peer: inThread ? peer : null }).catch((err) => {
      // Not sent: put the words back (unless something new was typed) and say why.
      setDraft((d) => d || text);
      if (image) setPending((p) => p || image);
      setNote({ text: `Not sent: ${errText(err)}`, bad: true });
    });
  };

  const doReport = async (m, where) => {
    setReported((r) => ({ ...r, [m.id]: true }));
    try { await report(m.id, where); if (where === "private") block(m.from); } catch { /* reported locally anyway */ }
    if (where === "private") setView("dms");
  };

  const canSend = !s.off && !(me && me.banned);
  const meLabel = me ? displayName(me) : "…";
  const roomTitle = view === "open" ? "Open chat" : view === "dms" ? "Private messages" : displayName(peer);
  const roomSub = view === "open" ? "Everyone on the site can read this" : view === "dms" ? "Only you and the other player can see a private chat" : "Private: only the two of you can see this";

  return (
    <div className={cn("relative flex h-full min-h-0 overflow-hidden rounded-[10px] border border-[#2a2626] bg-[#0e0d0d] text-[15px] leading-[1.45] text-[#e9e4df] sm:text-base", className)}>
      {/* conversations: beside the chat on wide screens */}
      <nav aria-label="Conversations" className={cn("hidden w-[280px] shrink-0 flex-col border-r border-[#241f1f] bg-[#0a0909]", !compact && "min-[760px]:flex")}>
        <div className="px-4 pb-2.5 pt-4 font-heading text-[22px] font-bold tracking-[0.08em]">WUXEN2 <span className="text-[#e3171d]">BUY AND SELL</span></div>
        <button type="button" onClick={() => setView("open")} className={cn("flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#171414]", view === "open" && "bg-[#1a1515] shadow-[inset_3px_0_0_#e3171d]")}>
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-[#2a0c0d] font-heading text-xl font-bold text-[#ff6b6b]">#</span>
          <span className="flex flex-col"><span className="font-semibold">Open chat</span><span className="text-[13px] text-[#8f8984]">Everyone · auto-translated</span></span>
        </button>
        <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5 font-heading text-sm font-bold tracking-[0.12em] text-[#8f8984]">
          <span>PRIVATE MESSAGES</span>
          {unread > 0 && <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[#e3171d] px-1.5 font-body text-xs tracking-normal text-white">{unread}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {convos.length === 0 && <p className="px-4 py-2 text-[13px] text-[#8f8984]">No private chats yet. Tap <b className="text-[#e9e4df]">Message</b> on anyone in the open chat.</p>}
          {convos.map((c) => <ConvoRow key={c.vid} c={c} me={me} active={view === c.vid} onOpen={() => openThread(c)} />)}
        </div>
        <MeBox me={me} meLabel={meLabel} member={member} onName={() => setNameOpen((v) => !v)} nameOpen={nameOpen} />
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* phones: tabs instead of the list */}
        <div role="tablist" aria-label="Chat" className={cn("flex border-b border-[#241f1f]", !compact && "min-[760px]:hidden")}>
          <Tab on={view === "open"} onClick={() => setView("open")}>Open chat</Tab>
          <Tab on={view !== "open"} onClick={() => setView("dms")}>
            Private
            {unread > 0 && <span className="ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-[#e3171d] px-1 font-body text-xs tracking-normal text-white">{unread}</span>}
          </Tab>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#241f1f] px-3.5 py-2.5">
          {inThread && (
            <button type="button" onClick={() => setView("dms")} aria-label="Back to private messages" className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/5"><ArrowLeft className="h-[18px] w-[18px]" /></button>
          )}
          <div className={cn("min-w-0 flex-1 flex-col", inThread ? "flex" : compact ? "hidden" : "hidden min-[760px]:flex")}>
            <span className="flex items-center gap-2 font-heading text-xl font-bold tracking-[0.04em]">{roomTitle}{inThread && <Badges x={peer} />}</span>
            <span className="text-xs text-[#7f7975]">{roomSub}</span>
          </div>
          <label className={cn("flex items-center gap-1.5 text-sm text-[#a29c97]", !inThread && (compact ? "flex-1" : "flex-1 min-[760px]:flex-none"))}>
            <Languages className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">Show messages in</span>
            <select value={s.lang} onChange={(e) => setLang(e.target.value)} className="h-10 min-w-0 flex-1 rounded border border-[#332d2d] bg-[#050505] px-2 text-sm text-[#e9e4df]">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <button type="button" role="switch" aria-checked={s.auto} onClick={() => setAuto(!s.auto)}
            className={cn("flex h-10 items-center gap-2 rounded-full border px-3 text-sm", s.auto ? "border-[#e3171d] text-white" : "border-[#332d2d] text-[#a29c97]")}>
            <span aria-hidden="true" className={cn("relative h-4 w-7 rounded-full transition-colors", s.auto ? "bg-[#e3171d]" : "bg-[#3a3434]")}>
              <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", s.auto ? "left-3.5" : "left-0.5")} />
            </span>
            {compact ? <span>Translate</span> : <><span className="hidden min-[400px]:inline">Auto-translate</span><span className="min-[400px]:hidden">Translate</span></>}
          </button>
        </div>

        {s.banner && (
          <div role="status" className="flex items-center gap-3 bg-[#8d1014] px-3.5 py-2.5 text-white">
            <MessageSquare className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2 min-w-0 flex-1 text-sm [overflow-wrap:anywhere]"><b>New private message</b> from {displayName(s.banner)}: {s.banner.text || "a picture"}</span>
            <button type="button" onClick={() => openThread({ vid: s.banner.from, name: s.banner.name, tag: s.banner.tag, kind: s.banner.kind })} className="h-9 shrink-0 rounded border border-white px-3.5 font-heading text-[15px] font-bold tracking-[0.06em]">OPEN</button>
            <button type="button" onClick={dismissBanner} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div ref={listRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {view === "open" && (
            <>
              <div className="flex items-start gap-2.5 border-b border-[#2a1a12] bg-[#17120b] px-3.5 py-2.5 text-[13px] text-[#e8d6a8]">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#f1d38c]" aria-hidden="true" />
                <span><b>Pinned:</b> Be respectful. Nobody from BLACKLIST will ever ask for your password or account. Links are blocked.</span>
              </div>
              {!s.ready && <p className="flex items-center gap-2 px-3.5 py-6 text-sm text-[#8f8984]"><Loader2 className="h-4 w-4 animate-spin" /> Loading the chat…</p>}
              {s.ready && openList.length === 0 && !s.off && <p className="px-3.5 py-6 text-sm text-[#8f8984]">No messages yet. Say what you're buying or selling.</p>}
              {s.off && <p className="px-3.5 py-6 text-sm text-[#8f8984]">Buy and Sell is closed right now. Check back later.</p>}
              {openList.map((m) => (
                <OpenMessage key={m.id} m={m} s={s} me={me} compact={compact}
                  original={!!showOrig[m.id]} onFlip={() => setShowOrig((o) => ({ ...o, [m.id]: !o[m.id] }))}
                  reported={!!reported[m.id]} onReport={() => doReport(m, "open")} onDm={() => openThread(m)} onZoom={setZoom}
                  confirmBan={confirmBan === m.id} onBanAsk={() => setConfirmBan(confirmBan === m.id ? "" : m.id)}
                  onRemove={() => moderate("remove", { id: m.id }).catch((e) => setNote({ text: errText(e), bad: true }))}
                  onBan={() => { setConfirmBan(""); moderate("ban", { vid: m.vid }).catch((e) => setNote({ text: errText(e), bad: true })); }} />
              ))}
            </>
          )}

          {view === "dms" && (
            <>
              <p className="border-b border-[#1b1818] px-3.5 py-3 text-sm text-[#8f8984]">Only you and the other player can see a private chat. Tap <b className="text-[#e9e4df]">Message</b> on anyone in the open chat to start one.</p>
              {convos.length === 0 && <p className="px-3.5 py-6 text-sm text-[#8f8984]">No private chats yet.</p>}
              {convos.map((c) => <ConvoRow key={c.vid} c={c} me={me} active={false} onOpen={() => openThread(c)} />)}
              <div className={cn("mt-auto", !compact && "min-[760px]:hidden")}><MeBox me={me} meLabel={meLabel} member={member} onName={() => setNameOpen((v) => !v)} nameOpen={nameOpen} /></div>
            </>
          )}

          {inThread && (
            <div className="flex flex-col gap-2.5 p-3.5">
              <p className="mx-auto rounded-full bg-[#1a1717] px-3 py-1 text-xs text-[#8f8984]">Private: only you and {displayName(peer)} can see this</p>
              {thread.length === 0 && <p className="text-center text-sm text-[#8f8984]">Say hello and what you'd like to trade.</p>}
              {thread.map((d) => {
                const mine = d.from === me?.vid;
                const b = bodyOf(d, s, !!showOrig[d.id]);
                return (
                  <div key={d.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2", mine ? "rounded-br-md bg-[#8d1014] text-white" : "rounded-bl-md bg-[#1d1a1a] text-[#e9e4df]")}>
                      {d.image && (
                        <button type="button" onClick={() => setZoom(d.image)} aria-label="Open the picture" className="mb-1.5 block cursor-zoom-in overflow-hidden rounded-lg bg-[#050505]">
                          <img src={d.image} alt="Picture sent in a private chat" loading="lazy" className="block max-h-[200px] w-auto max-w-[240px]" />
                        </button>
                      )}
                      {b.text && <p className="m-0 [overflow-wrap:anywhere]">{b.text}</p>}
                      <Translated m={d} s={s} original={!!showOrig[d.id]} dark={mine} onFlip={() => setShowOrig((o) => ({ ...o, [d.id]: !o[d.id] }))} />
                      <div className={cn("mt-0.5 flex items-center gap-2 text-[11px]", mine ? "text-white/60" : "text-[#7f7975]")}>
                        <span>{d.pending ? "Sending…" : ago(d.at)}</span>
                        {!mine && !d.pending && !reported[d.id] && <button type="button" onClick={() => doReport(d, "private")} className="underline">Report and block</button>}
                        {me && me.moderator && <button type="button" onClick={() => moderate("remove", { id: d.id, where: "private" })} className="underline">Remove</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {view !== "dms" && (
          <form onSubmit={submit} className="flex flex-col gap-2 border-t border-[#241f1f] bg-[#0a0909] px-3.5 pb-3 pt-2.5">
            {pending && (
              <div className="flex items-center gap-2.5">
                <img src={pending} alt="Picture ready to send" className="h-16 w-16 rounded-md border border-[#332d2d] object-cover" />
                <span className="flex-1 text-[13px] text-[#a29c97]">Picture ready. Add a message or just press Send.</span>
                <button type="button" onClick={() => setPending("")} aria-label="Remove the picture" className="grid h-10 w-10 place-items-center rounded-full border border-[#332d2d]"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current && fileRef.current.click()} disabled={!canSend} aria-label="Send a picture" title="Send a picture (up to 3 MB)"
                className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-md border border-[#332d2d] text-[#cfc9c4] hover:bg-white/5 disabled:opacity-40">
                <ImagePlus className="h-5 w-5" />
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true" />
              <label className="flex min-w-0 flex-1">
                <span className="sr-only">Message</span>
                <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))} maxLength={MAX_LEN} disabled={!canSend} enterKeyHint="send"
                  placeholder={!canSend ? (me && me.banned ? "You have been removed from Buy and Sell" : "Closed right now") : inThread ? `Message ${displayName(peer)}` : `Message as ${meLabel}`}
                  className="h-[46px] min-w-0 flex-1 rounded-md border border-[#332d2d] bg-[#050505] px-3.5 text-base text-[#e9e4df] placeholder:text-[#6f6a66] focus:border-[#e3171d] focus:outline-none" />
              </label>
              <button type="submit" disabled={!canSend}
                className="h-[46px] shrink-0 rounded-md bg-[#e3171d] px-5 font-heading text-[17px] font-bold tracking-[0.08em] text-white hover:brightness-110 disabled:opacity-50">
                SEND
              </button>
            </div>
            <p role="status" className={cn("m-0 min-h-[18px] text-xs", note.bad ? "text-[#ff6b6b]" : "text-[#7f7975]")}>
              {note.text || s.error || "Pictures up to 3 MB. Messages are translated for everyone. No links or phone numbers."}
            </p>
          </form>
        )}

        {nameOpen && !member && me && me.kind !== "member" && <NamePanel me={me} suggest={autoName} onClose={() => setNameOpen(false)} />}
      </div>

      {zoom && (
        <div role="dialog" aria-label="Picture" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-6" onClick={() => setZoom("")}>
          <img src={zoom} alt="The picture, enlarged" className="max-h-full max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setZoom("")} aria-label="Close the picture" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-[#555] bg-[#111] text-white" style={{ top: "calc(12px + env(safe-area-inset-top, 0px))" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Tab({ on, onClick, children }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick}
      className={cn("flex h-12 flex-1 items-center justify-center font-heading text-base font-bold tracking-[0.06em]", on ? "text-white shadow-[inset_0_-3px_0_#e3171d]" : "text-[#8f8984]")}>
      {children}
    </button>
  );
}

function ConvoRow({ c, me, active, onOpen }) {
  const lastMine = c.last && me && c.last.from === me.vid;
  const lastText = c.last ? (c.last.text || "Picture") : "";
  return (
    <button type="button" onClick={onOpen} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#171414]", active && "bg-[#1a1515] shadow-[inset_3px_0_0_#e3171d]")}>
      <Avatar x={c} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("flex items-center gap-1.5 truncate", c.unread ? "font-bold text-white" : "font-semibold")}>{displayName(c)}<Badges x={c} /></span>
        <span className={cn("truncate text-[13px]", c.unread ? "text-[#e9e4df]" : "text-[#8f8984]")}>{lastMine ? "You: " : ""}{lastText}</span>
      </span>
      {c.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#e3171d] px-1 text-[11px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
    </button>
  );
}

function MeBox({ me, meLabel, member, onName, nameOpen }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-[#241f1f] px-4 py-3 text-[13px] text-[#8f8984]">
      <span>You are</span>
      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-[#f2eeea]">{meLabel}{me && <Badges x={me} />}</span>
      {!member && me && me.kind !== "member" && (
        <button type="button" onClick={onName} className="self-start py-1.5 text-[13px] text-[#ff6b6b] underline">
          {nameOpen ? "Close" : me.discord ? "Change your name" : "Use your own name"}
        </button>
      )}
    </div>
  );
}

function OpenMessage({ m, s, me, compact, original, onFlip, reported, onReport, onDm, onZoom, onRemove, onBan, onBanAsk, confirmBan }) {
  const mine = me && m.vid === me.vid;
  const b = bodyOf(m, s, original);
  return (
    <article className={cn("flex items-start gap-3 border-b border-[#1b1818] px-3.5 py-3", m.pending && "opacity-70")}>
      <Avatar x={m} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold text-[#f2eeea]">{displayName(m)}{mine ? " (you)" : ""}</span>
          <Badges x={m} />
          <span className="text-[13px] text-[#7f7975]">{m.pending ? "Sending…" : ago(m.at)}</span>
        </div>
        {b.text && <p className="m-0 text-[#e2ddd8] [overflow-wrap:anywhere]">{b.text}</p>}
        {m.image && (
          <button type="button" onClick={() => onZoom(m.image)} aria-label="Open the picture" className="self-start cursor-zoom-in overflow-hidden rounded-lg border border-[#2a2626] bg-[#050505]">
            <img src={m.image} alt="Picture shared in the chat" loading="lazy" className="block max-h-[200px] w-auto max-w-[min(260px,100%)]" />
          </button>
        )}
        <Translated m={m} s={s} original={original} onFlip={onFlip} />
        {me && me.moderator && !mine && (
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-[#a29c97]">
            <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 py-1 hover:text-white"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
            {m.kind !== "member" && (confirmBan
              ? <span className="inline-flex items-center gap-2">Remove this person and hide their messages? <button type="button" onClick={onBan} className="rounded bg-[#e3171d] px-2 py-1 font-bold text-white">Yes, remove</button><button type="button" onClick={onBanAsk} className="underline">Cancel</button></span>
              : <button type="button" onClick={onBanAsk} className="inline-flex items-center gap-1 py-1 hover:text-white"><Ban className="h-3.5 w-3.5" /> Ban</button>)}
          </div>
        )}
      </div>
      {!mine && (
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={onDm} aria-label={`Message ${displayName(m)} privately`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#332d2d] px-2.5 text-[13px] text-[#cfc9c4] hover:border-[#e3171d] hover:text-white">
            <MessageSquare className="h-[15px] w-[15px]" /> <span className={compact ? "sr-only" : "hidden min-[400px]:inline"}>Message</span>
          </button>
          {reported
            ? <span className="px-1.5 text-xs text-[#7f7975]">Reported</span>
            : <button type="button" onClick={onReport} aria-label="Report this message" title="Report" className="grid h-10 w-10 place-items-center text-[#7f7975] hover:text-[#ff6b6b]"><Flag className="h-[15px] w-[15px]" /></button>}
        </div>
      )}
    </article>
  );
}

function NamePanel({ me, suggest, onClose }) {
  const [name, setName] = useState(me.name || suggest || "");
  const [note, setNote] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const linked = !!me.discord;

  const link = async () => {
    setBusy(true);
    try {
      const r = await api("linkStart");
      window.location.assign(r.url);
    } catch (e) { setNote({ text: errText(e), bad: true }); setBusy(false); }
  };
  const saveName = async (value) => {
    const n = value.trim();
    if (n && !NAME_RE.test(n)) return setNote({ text: "Use 3 to 16 letters, numbers or _.", bad: true });
    if (n && RESERVED.test(n)) return setNote({ text: "That name is reserved. Pick another.", bad: true });
    setBusy(true);
    try {
      const r = await api("rename", { name: n });
      setMe(r.me);
      setNote({ text: n ? `You're now ${n}.` : "You're Anonymous again.", bad: false });
      if (!n) setName("");
    } catch (e) { setNote({ text: errText(e), bad: true }); }
    setBusy(false);
  };
  const unlink = async () => {
    setBusy(true);
    try { const r = await api("unlink"); setMe(r.me); setNote({ text: "Discord unlinked. You're Anonymous.", bad: false }); } catch (e) { setNote({ text: errText(e), bad: true }); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2.5 border-t border-[#241f1f] bg-[#121010] p-3.5">
      <div className="flex items-start justify-between gap-3">
        {!linked
          ? <p className="m-0 text-[15px] text-[#cfc9c4]"><b className="text-white">Want your own name?</b> Link Discord to pick one. It's optional: you can stay Anonymous.</p>
          : <p className="m-0 text-[15px] text-[#cfc9c4]">Linked with Discord as <b className="text-white">{me.discord}</b>. Pick the name others see.</p>}
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#332d2d]"><X className="h-3.5 w-3.5" /></button>
      </div>
      {!linked ? (
        <>
          <p className="m-0 text-[13px] text-[#8f8984]">Linking only sets your chat name. It doesn't open the members portal, and nobody sees your Discord account.</p>
          <button type="button" onClick={link} disabled={busy} className="h-[46px] self-start rounded-md bg-[#5865f2] px-[18px] font-heading text-[17px] font-bold tracking-[0.06em] text-white disabled:opacity-60">
            {busy ? "Opening Discord…" : "LINK DISCORD"}
          </button>
        </>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); saveName(name); }} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[13px] text-[#8f8984]">Chat name (3 to 16 letters, numbers or _)
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 16))} maxLength={16} autoComplete="off"
                className="h-[46px] rounded-md border border-[#332d2d] bg-[#050505] px-3 text-base text-[#e9e4df] focus:border-[#e3171d] focus:outline-none" />
            </label>
            <button type="submit" disabled={busy} className="h-[46px] rounded-md bg-[#e3171d] px-5 font-heading text-[17px] font-bold tracking-[0.08em] text-white disabled:opacity-60">SAVE</button>
          </form>
          <div className="flex flex-wrap gap-x-5">
            {me.name && <button type="button" onClick={() => saveName("")} disabled={busy} className="py-1.5 text-sm text-[#ff6b6b] underline">Go back to Anonymous</button>}
            <button type="button" onClick={unlink} disabled={busy} className="py-1.5 text-sm text-[#8f8984] underline">Unlink Discord</button>
          </div>
        </>
      )}
      {note.text && <p role="status" className={cn("m-0 text-[13px]", note.bad ? "text-[#ff6b6b]" : "text-[#7fdca0]")}>{note.text}</p>}
    </div>
  );
}
