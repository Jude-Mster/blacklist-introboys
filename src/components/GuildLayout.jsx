import React from "react";
import { Outlet } from "react-router-dom";
import { GuildProvider } from "@/lib/GuildContext";
import TopNav from "./TopNav";
import BottomTabs from "./BottomTabs";

export default function GuildLayout() {
  return (
    <GuildProvider>
      <div className="flex min-h-[100svh] flex-col">
        <TopNav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-32 pt-5 sm:px-4 md:pb-12 md:pt-8">
          <Outlet />
        </main>
        <BottomTabs />
      </div>
    </GuildProvider>
  );
}