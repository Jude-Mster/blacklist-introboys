import React from "react";
import { Navigate, useParams } from "react-router-dom";
import LanternSpinner from "@/components/LanternSpinner";
import Panel from "@/components/Panel";
import PokerLobby from "@/components/poker/PokerLobby";
import PokerTableView from "@/components/poker/PokerTableView";
import TableBoundary from "@/components/TableBoundary";
import { useGuild } from "@/lib/GuildContext";

export default function Poker() {
  const { tableId } = useParams();
  const { account, settings, loading } = useGuild();

  if (loading) return <LanternSpinner label="Opening the poker room" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;
  if (settings && !(settings.games_enabled || []).includes("poker")) {
    return (
      <Panel title="Poker room closed" className="mx-auto max-w-md">
        <p className="text-center text-mist">The Guild Leader has closed the poker room for now.</p>
      </Panel>
    );
  }
  return tableId ? <TableBoundary key={tableId} back="/poker"><PokerTableView tableId={tableId} /></TableBoundary> : <PokerLobby />;
}