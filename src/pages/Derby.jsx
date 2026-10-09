import React from "react";
import { Navigate } from "react-router-dom";
import LanternSpinner from "@/components/LanternSpinner";
import Panel from "@/components/Panel";
import TableBoundary from "@/components/TableBoundary";
import DerbyTrack from "@/components/derby/DerbyTrack";
import { useGuild } from "@/lib/GuildContext";

// Blacklist Derby. This page (and the 3D course with it) is only downloaded when a member opens it.
export default function Derby() {
  const { account, settings, loading } = useGuild();

  if (loading) return <LanternSpinner label="Opening the track" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;
  if (account.member.banned) {
    return (
      <Panel title="Games closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">A guild officer has closed the games for your account.</p>
      </Panel>
    );
  }
  if (!settings) return <LanternSpinner label="Loading the rules" className="py-24" />;
  if (!(settings.games_enabled || []).includes("derby")) {
    return (
      <Panel title="Blacklist Derby closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">The Guild Leader has closed the track for now.</p>
      </Panel>
    );
  }
  return (
    <TableBoundary back="/games">
      <DerbyTrack balance={account.member.points} />
    </TableBoundary>
  );
}