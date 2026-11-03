import React from "react";
import { Link } from "react-router-dom";
import Panel from "@/components/Panel";

// The short version of how the Assistant works, kept in its own area so the tools stay uncluttered.
export default function HowItWorks() {
  return (
    <Panel title="How it works">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-mist">
        <li>Buy Assistant days in the <Link to="/shop" className="text-gold underline">guild shop</Link>. They switch on the moment you pay, and more days add to the time you have left.</li>
        <li>Open IntroBoys Assistant on your PC and press <b className="text-white">Sign in with Discord</b>. Your browser opens this page with a code.</li>
        <li>Check that the <b className="text-white">device ID</b> matches the one in the app, then press Approve.</li>
        <li>The app runs while you have days left and still hold the guild member role. It checks in every couple of minutes; if it can&apos;t, it stops.</li>
        <li>Each device is a license for one PC: it is locked to the first PC that uses it, and can be moved to another PC at any time.</li>
        <li>Want the app on more PCs (up to 5)? Move some of your days to a new device in Overview, or buy days for a new device in the shop. Each PC then runs on its own device&apos;s days.</li>
        <li>While the Assistant is online, <b className="text-white">Remote control</b> shows your game and lets you start, stop, change mode, take the war break, or install an update from anywhere.</li>
      </ol>
    </Panel>
  );
}