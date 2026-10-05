import React from "react";
import CardTable from "./CardTable";

// Blackjack: one shared table, everyone against the same dealer.
const ACTIONS = [
  { id: "hit", label: "Hit", primary: true },
  { id: "stand", label: "Stand" },
  { id: "double", label: "Double", firstTwoOnly: true },
  { id: "split", label: "Split", splitOnly: true }
];

// Optional side bets. What they pay is set on the server (base44/shared/blackjackSides.ts)
// and must match the tables below.
const SIDE_BETS = [
  { id: "pairs", name: "Pairs", short: "up to 25 to 1", blurb: "Wins if your first two cards are a pair. Pays 5 to 25 times." },
  { id: "plus3", name: "21+3", short: "up to 100 to 1", blurb: "Your two cards and the dealer's first card make a poker hand. Pays 5 to 100 times." }
];
const PAIRS = [
  ["Perfect pair", "same number and same suit, like 8♥ 8♥", "25 to 1"],
  ["Coloured pair", "same number and same colour, like 8♥ 8♦", "10 to 1"],
  ["Mixed pair", "same number, one red and one black, like 8♥ 8♠", "5 to 1"]
];
const PLUS3 = [
  ["Suited three of a kind", "three identical cards, like 7♠ 7♠ 7♠", "100 to 1"],
  ["Straight flush", "three in a row in one suit, like 5♠ 6♠ 7♠", "35 to 1"],
  ["Three of a kind", "the same number three times, like 7♠ 7♥ 7♦", "25 to 1"],
  ["Straight", "three in a row, like 5♠ 6♥ 7♦ (Ace can be low or high)", "10 to 1"],
  ["Flush", "all three in the same suit, like 2♥ 9♥ K♥", "5 to 1"]
];

function PayTable({ title, lead, rows }) {
  return (
    <div className="mt-2 first:mt-0">
      <p className="font-bold text-[hsl(var(--foreground))]">{title}</p>
      <p className="mb-1">{lead}</p>
      <table className="w-full">
        <tbody>
          {rows.map(([name, how, pays]) => (
            <tr key={name} className="border-t border-bronze/20 align-top">
              <td className="py-1 pr-2">
                <span className="font-bold text-[hsl(var(--foreground))]">{name}</span>
                <span className="block text-[11px]">{how}</span>
              </td>
              <td className="whitespace-nowrap py-1 text-right font-heading font-bold text-gold">{pays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TIPS = (
  <>
    <PayTable title="Pairs" lead="Looks only at your first two cards." rows={PAIRS} />
    <PayTable title="21+3" lead="Looks at your first two cards together with the dealer's face-up card." rows={PLUS3} />
    <ul className="mt-2 list-disc space-y-1 pl-4">
      <li>"25 to 1" means a side bet of 10 wins 250 and you also get your 10 back.</li>
      <li>Each side bet can be at most the size of your main wager, and you can leave either one empty.</li>
      <li>Side bets are settled from the first cards dealt. They pay even if your hand then loses, and they lose even if your hand wins.</li>
      <li>Split: when your first two cards are the same number or face you can put down a second wager and play them as two hands, once per round. Split aces get one card each. 21 on a split hand pays as a normal win, and you can double a split hand. Side bets are not affected by a split.</li>
      <li>Only the best result on each side bet pays. Over time Pairs returns about 94% and 21+3 about 95% of what is staked.</li>
    </ul>
  </>
);

export default function Blackjack({ settings, balance }) {
  return (
    <CardTable
      fn="blackjackAction"
      title="Blacklist Blackjack"
      dealerLabel="Dealer"
      actions={ACTIONS}
      sideBets={SIDE_BETS}
      tips={TIPS}
      felt={{ hue: 150, lines: ["BLACKJACK PAYS 3 TO 2", "Dealer draws to 17 and hits soft 17", "SPLIT A PAIR · DOUBLE ON TWO CARDS"] }}
      settings={settings}
      balance={balance}
      winNote="Blackjack (an Ace with a 10 or face card) pays 3 to 2."
      rules="Six seats, one dealer. Sit down, then bet each round from your seat. The first bet starts a 10 second countdown so others can join, then you have 25 seconds to play your hand. Closest to 21 without going over wins. Blackjack pays 3 to 2. The dealer draws to 17 and hits a soft 17. You can double on your first two cards: your wager is doubled and you take exactly one more card. You can split a pair once into two hands for a second wager. Pairs and 21+3 are optional side bets. A seat with no bet for 10 minutes is freed."
    />
  );
}