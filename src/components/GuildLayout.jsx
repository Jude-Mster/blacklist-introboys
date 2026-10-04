import WarTimer from "@/components/WarTimer";
import AppPrompt from "@/components/AppPrompt";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { GuildProvider, useGuild } from "@/lib/GuildContext";
import TopBar from "./nav/TopBar";
import Sidebar from "./nav/Sidebar";
import MobileTabBar from "./nav/MobileTabBar";
import ChatDrawer from "./nav/ChatDrawer";
import ChatFloaters from "./chat/ChatFloaters";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "bi.nav.collapsed";
// Pages where chat messages fly across the screen.
const PLAY_PAGES = /^\/(games|poker|pusoy)(\/|$)/;
const MAX_FLOATERS = 6;
const LANES = 6;

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function GuildLayout() {
  return (
    <GuildProvider>
      <Shell />
    </GuildProvider>
  );
}

function Shell() {
  const { account } = useGuild();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const myId = account && account.member ? account.member.id : null;
  const openRef = useRef(chatOpen);
  openRef.current = chatOpen;
  const [floaters, setFloaters] = useState([]);
  const lane = useRef(0);
  const playing = PLAY_PAGES.test(location.pathname);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const dropFloater = useCallback((key) => setFloaters((f) => f.filter((x) => x.key !== key)), []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* per-browser convenience only */
      }
      return !c;
    });
  };
  const toggleChat = useCallback(() => {
    setChatOpen((o) => !o);
    setUnread(0);
  }, []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  // Count messages that arrive while chat is closed.
  const onIncoming = useCallback(
    (msg) => {
      // While playing, members' messages (your own too) fly across the screen.
      const text = String(msg.text || "").trim();
      if (playingRef.current && !openRef.current && msg.kind !== "system" && !msg.deleted && text) {
        const shown = text.length > 90 ? text.slice(0, 89) + "…" : text;
        lane.current = (lane.current + 1) % LANES;
        const item = { key: `${msg.id}-${Date.now()}`, name: msg.name || "Member", text: shown, lane: lane.current, seconds: 8 + Math.min(6, shown.length / 15) };
        setFloaters((f) => [...f.slice(-(MAX_FLOATERS - 1)), item]);
      }
      if (msg.member_id && msg.member_id === myId) return;
      if (!openRef.current) setUnread((u) => u + 1);
    },
    [myId]
  );

  // Close the chat sheet on phones when moving to another page.
  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(max-width: 767px)").matches) setChatOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-[100svh]">
      <a href="#main" className="sr-only z-50 rounded bg-gold px-3 py-2 text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <TopBar onChat={toggleChat} chatOpen={chatOpen} unread={unread} />
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} onChat={toggleChat} chatOpen={chatOpen} unread={unread} />
      <main
        id="main"
        className={cn(
          "px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[4.25rem] transition-[padding] duration-200 sm:px-4 sm:pt-[5.25rem] md:pb-12 md:pl-[88px]",
          collapsed ? "lg:pl-[88px]" : "lg:pl-[260px]"
        )}
      >
        <div className="mx-auto w-full max-w-5xl">
          <WarTimer variant="strip" className="mb-3 md:hidden" />
          <Outlet />
        </div>
      </main>
      {account && account.linked && <ChatDrawer open={chatOpen} onClose={closeChat} onIncoming={onIncoming} />}
      {playing && <ChatFloaters items={floaters} onDone={dropFloater} />}
      <AppPrompt />
      <MobileTabBar onChat={toggleChat} chatOpen={chatOpen} unread={unread} />
    </div>
  );
}