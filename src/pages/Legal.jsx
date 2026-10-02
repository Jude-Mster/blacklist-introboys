import React from "react";
import { Link } from "react-router-dom";
import { FullLogo } from "@/components/SealLogo";

// Public pages. Google asks for a privacy policy and terms that anyone can open
// without logging in before it shows your own name on the sign-in screen.
function Page({ title, children }) {
  return (
    <div className="min-h-[100svh] bg-[#050505] px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <Link to="/" aria-label="Back to the guild hall"><FullLogo className="w-40" /></Link>
        <h1 className="mt-8 text-3xl gilt-text">{title}</h1>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[hsl(var(--foreground))] [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white">
          {children}
        </div>
        <p className="mt-10 text-sm text-mist">
          <Link to="/" className="underline">Back to the guild hall</Link>
        </p>
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy policy">
      <p>BLACKLIST INTROBOYS is a members-only guild site run by the guild's leader. This page explains what the site stores about you.</p>
      <h2>What we store</h2>
      <p>When you log in we store your email address and login method. When you link Discord we store your Discord ID, username, display name and avatar. We also store your guild points, your rank, your game and raffle history, and the chat messages you send on the site.</p>
      <h2>How it is used</h2>
      <p>Only to run the guild site: to show your points and rank, to run the games and raffles, and to show guild chat. Guild officers can see member names, ranks and point history. Messages in guild chat may also be shown in the guild's Discord server.</p>
      <h2>What we do not do</h2>
      <p>We do not sell or share your information with advertisers. We do not read your Discord messages outside the linked guild channel. Google and Discord only tell us who you are when you log in.</p>
      <h2>Where it is kept</h2>
      <p>The site is hosted on Base44. Your information is kept for as long as you are a member.</p>
      <h2>Removing your data</h2>
      <p>Ask the Guild Leader in the guild's Discord server and your account and its data will be deleted.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of use">
      <p>By using the BLACKLIST INTROBOYS guild site you agree to the following.</p>
      <h2>Members only</h2>
      <p>The site is for members of the guild's Discord server. One account per person.</p>
      <h2>Points</h2>
      <p>Guild points are for fun and for guild rewards. They have no real-money value. They cannot be bought, sold, traded for money or cashed out. The games on this site use points only.</p>
      <h2>Conduct</h2>
      <p>Be respectful in chat. Do not cheat, exploit bugs or use more than one account. Officers may remove messages, adjust points gained unfairly, or ban accounts.</p>
      <h2>No warranty</h2>
      <p>The site is a fan project provided as is. It may change or be unavailable at times, and point balances may be corrected if something goes wrong. The site is not affiliated with or endorsed by the game's publisher.</p>
      <h2>Contact</h2>
      <p>Questions go to the Guild Leader in the guild's Discord server.</p>
    </Page>
  );
}