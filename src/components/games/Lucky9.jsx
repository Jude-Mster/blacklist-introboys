import React from "react";
import CardTable from "./CardTable";
import { coinMultiplier, edgeOf } from "@/lib/games";

// Lucky 9: one shared table, everyone against the same banker.
const ACTIONS = [
  { id: "draw", label: "Hirit (draw)", primary: true },
  { id: "stand", label: "Good (stay)" }
];

export default function Lucky9({ settings, balance }) {
  const mult = coinMultiplier(edgeOf(settings));
  return (
    <CardTable
      fn="lucky9Action"
      title="Blacklist Lucky 9"
      dealerLabel="Banker"
      actions={ACTIONS}
      settings={settings}
      balance={balance}
      feltClass="bg-[radial-gradient(circle_at_50%_30%,hsl(355_35%_14%),hsl(0_0%_6%))]"
      winNote={`A win returns ${mult}× your wager.`}
      rules="Six seats, one banker. Sit down, then bet each round from your seat. The first bet starts a 10 second countdown so others can join, then you have 15 seconds to draw or stay. Closest to 9 wins. Aces count 1, tens and face cards count 0, and only the last digit of your total counts. You may take one extra card. The banker draws on 4 or less. A tie returns your wager. A seat with no bet for 10 minutes is freed."
    />
  );
}