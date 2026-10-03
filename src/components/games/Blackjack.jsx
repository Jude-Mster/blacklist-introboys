import React from "react";
import CardTable from "./CardTable";

// Blackjack: one shared table, everyone against the same dealer.
const ACTIONS = [
  { id: "hit", label: "Hit", primary: true },
  { id: "stand", label: "Stand" },
  { id: "double", label: "Double", firstTwoOnly: true }
];

export default function Blackjack({ settings, balance }) {
  return (
    <CardTable
      fn="blackjackAction"
      title="Blacklist Blackjack"
      dealerLabel="Dealer"
      actions={ACTIONS}
      settings={settings}
      balance={balance}
      rules="Everyone at the table plays against the same dealer. The first bet starts a 15 second countdown so others can join, then you have 25 seconds to play your hand. Closest to 21 without going over wins. Blackjack pays 6:5. The dealer draws to 17 and hits a soft 17. You can double on your first two cards."
    />
  );
}