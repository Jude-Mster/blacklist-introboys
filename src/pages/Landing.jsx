import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import SkyScene from "@/components/SkyScene";
import { Seal, Ingot } from "@/components/SealLogo";
import { Trophy, Swords } from "lucide-react";

export default function Landing() {
  const { isAuthenticated, authChecked } = useAuth();
  if (authChecked && isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      <SkyScene />

      {/* vertical game title, like a hanging scroll */}
      <div className="absolute left-4 top-1/2 hidden -translate-y-1/2 sm:block">
        <p className="flex flex-col items-center gap-3 font-heading text-3xl font-bold leading-none text-gold/70 md:text-4xl" lang="ja" aria-label="Twelve Skies">
          {["十", "二", "之", "天"].map((c) => (
            <span key={c}>{c}</span>
          ))}
        </p>
      </div>

      <main className="relative z-10 mx-auto flex min-h-[100svh] max-w-3xl flex-col items-center justify-center px-6 pb-16 pt-20 text-center">
        <Seal size={64} />

        <h1 className="mt-6 font-heading font-extrabold leading-[0.95]">
          <span className="block gilt-text text-[13vw] tracking-[0.06em] sm:text-7xl">BLACKLIST</span>
          <span className="mt-2 block text-[5.4vw] font-semibold tracking-[0.42em] text-[hsl(var(--foreground))]/85 sm:text-2xl">
            INTROBOYS
          </span>
        </h1>

        <p className="mt-6 max-w-md text-base text-mist sm:text-lg">
          Our guild hall. Earn points in battle, track them here, and see who stands at the top.
        </p>

        <Link to="/login" className="btn-seal mt-9 h-12 px-9 text-base">
          Enter the guild hall
        </Link>
        <p className="mt-3 text-sm text-mist/80">Members only. You'll link your Discord after logging in.</p>

        <ul className="mt-14 grid w-full max-w-lg grid-cols-3 gap-3 text-left text-[13px] text-mist sm:text-sm">
          <Feature icon={<Ingot size={20} />} text="Your points, live" />
          <Feature icon={<Trophy className="h-5 w-5 text-gold" />} text="Guild rankings" />
          <Feature icon={<Swords className="h-5 w-5 text-gold" />} text="Four games" />
        </ul>

        <p className="mt-12 max-w-sm text-xs text-mist/60">
          Points have no real-money value. They can't be bought, sold or cashed out.
        </p>
      </main>
    </div>
  );
}

function Feature({ icon, text }) {
  return (
    <li className="flex flex-col items-center gap-2 rounded-md border border-bronze/40 bg-black/25 px-2 py-3 text-center backdrop-blur-sm">
      {icon}
      <span>{text}</span>
    </li>
  );
}