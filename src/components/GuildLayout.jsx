import React from "react";
import { Outlet } from "react-router-dom";
import { GuildProvider } from "@/lib/GuildContext";
import TopNav from "./TopNav";
import BottomTabs from "./BottomTabs";
import LanternSpinner from "./LanternSpinner";

export default function GuildLayout() {
  return (
    <GuildProvider>
      <div className="min-h-screen flex flex-col bg-ink ink-grain">
        <TopNav />
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 pt-6 pb-28 md:pb-12">
          <Outlet />
        </main>
        <BottomTabs />
      </div>
    </GuildProvider>
  );
}

export function GuildLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink">
      <LanternSpinner label="Entering the hall" />
    </div>
  );
}