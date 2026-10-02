import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import SkyScene from "@/components/SkyScene";
import { FullLogo, Ingot } from "@/components/SealLogo";
import { Trophy, Swords } from "lucide-react";

export default function Landing() {
  const { isAuthenticated, authChecked } = useAuth();
  if (authChecked && isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      <SkyScene />

      <main className="relative z-10 mx-auto flex min-h-[100svh] max-w-3xl flex-col items-center justify-center px-6 pb-16 pt-14 text-center">
        <h1>
          <FullLogo className="mx-auto w-full max-w-[22rem] sm:max-w-[30rem]" />
        </h1>

        <p className="mt-6 max-w-md text-base text-mist sm:text-lg">Welcome po sa website namin  mga BOY INTRO

        </p>

        <Link to="/login" className="btn-seal mt-8 h-12 px-9 text-base">
          Enter the guild hall
        </Link>
        <p className="mt-3 text-sm text-mist/80">Members only. Sign in with your Discord account.</p>

        <ul className="mt-12 grid w-full max-w-lg grid-cols-3 gap-3 text-left text-[13px] text-mist sm:text-sm">
          <Feature icon={<Ingot size={20} />} text="Your points, live" />
          <Feature icon={<Trophy className="h-5 w-5 text-gold" />} text="Guild rankings" />
          <Feature icon={<Swords className="h-5 w-5 text-gold" />} text="Games and poker" />
        </ul>

        <p className="mt-12 max-w-sm text-xs text-mist/60">
          Points have no real-money value. They can't be bought, sold or cashed out.
        </p>
        <p className="mt-3 text-xs text-mist/80">
          <Link to="/privacy" className="underline">Privacy</Link> · <Link to="/terms" className="underline">Terms</Link>
        </p>
      </main>
    </div>);

}

function Feature({ icon, text }) {
  return (
    <li className="flex flex-col items-center gap-2 rounded-md border border-bronze/40 bg-black/25 px-2 py-3 text-center backdrop-blur-sm">
      {icon}
      <span>{text}</span>
    </li>);

}