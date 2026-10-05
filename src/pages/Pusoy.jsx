import React from "react";
import { Navigate, useParams } from "react-router-dom";
import LanternSpinner from "@/components/LanternSpinner";
import Panel from "@/components/Panel";
import PusoyLobby from "@/components/pusoy/PusoyLobby";
import PusoyTableView from "@/components/pusoy/PusoyTableView";
import TableBoundary from "@/components/TableBoundary";
import { useGuild } from "@/lib/GuildContext";

export default function Pusoy() {
  const { tableId } = useParams();
  const { account, settings, loading } = useGuild();

  if (loading) return <LanternSpinner label="Shuffling the deck" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;
  if (account.member.banned) {
    return (
      <Panel title="Games closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">A guild officer has closed the games for your account.</p>
      </Panel>
    );
  }
  if (settings && !(settings.games_enabled || []).includes("pusoy")) {
    return (
      <Panel title="Pusoy Dos closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">The Guild Leader has closed the Pusoy Dos tables for now.</p>
      </Panel>
    );
  }
  return tableId ? <TableBoundary key={tableId} back="/pusoy"><PusoyTableView tableId={tableId} /></TableBoundary> : <PusoyLobby />;
}