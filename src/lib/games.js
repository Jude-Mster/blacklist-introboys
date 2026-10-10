// Client-side mirror of the server game rules. The server decides every result;
// these helpers only show odds and payouts before a bet.

export const round2 = (n) => Math.round(n * 100) / 100;
export const edgeOf = (settings) => Math.min(Math.max(Number(settings?.house_edge_pct) || 0, 0), 20) / 100;

export const GAMES = [
  { id: "coinflip", name: "Blacklist Yin Yang Toss", blurb: "Call Yin or Yang, or duel another member." },
  { id: "dragondice", name: "Blacklist Dragon Sic Bo", blurb: "Three dice, one live table. Bet Big, Small, a number, a total or a triple." },
  { id: "lanternslots", name: "Blacklist Lantern Slots", blurb: "Three reels. Three seals pays 50×." },
  { id: "fortune", name: "Blacklist Dragon's Fortune", blurb: "Five reels, ten lines, wilds and free spins." },
  { id: "skywheel", name: "Blacklist Twelve Skies Wheel", blurb: "One shared wheel. Back a faction each round." },
  { id: "roulette", name: "Blacklist Jade Roulette", blurb: "Red, Black, Green, Dragon or Tiger. A new spin every round." },
  { id: "blackjack", name: "Blacklist Blackjack", blurb: "One shared table. Beat the dealer to 21 together." },
  { id: "lucky9", name: "Blacklist Lucky 9", blurb: "One shared table. Closest to 9 beats the banker." },
  { id: "poker", name: "Poker Room", blurb: "Texas Hold'em against other members.", href: "/poker" },
  { id: "pusoy", name: "Pusoy Dos", blurb: "Empty your hand first and take the pot.", href: "/pusoy" },
  { id: "derby", name: "Blacklist Derby", blurb: "Live 3D horse racing. A new 1,600 m race every few minutes.", href: "/derby" },
  { id: "arena", name: "Blacklist Arena", blurb: "Live 3D fights between members every few minutes, and the Guild Leader's tournaments.", href: "/arena" }
];

export const coinMultiplier = (edge) => round2(2 * (1 - edge));

export const diceChance = (target, direction) => (direction === "under" ? target - 1 : 100 - target);
export const diceMultiplier = (chance, edge) => (chance > 0 ? round2((100 * (1 - edge)) / chance) : 0);

export const SLOT_SYMBOLS = ["seal", "dragon", "lantern", "maple", "ingot"];
export const SLOT_PAYOUTS = [
  { combo: ["seal", "seal", "seal"], label: "Three seals", mult: 50 },
  { combo: ["dragon", "dragon", "dragon"], label: "Three dragons", mult: 20 },
  { combo: ["lantern", "lantern", "lantern"], label: "Three lanterns", mult: 10 },
  { combo: ["maple", "maple", "maple"], label: "Three maple leaves", mult: 5 },
  { combo: ["ingot", "ingot", "ingot"], label: "Three ingots", mult: 3 },
  { combo: null, label: "Any two the same", mult: 2 }
];

export const WHEEL_SEGMENTS = [
  "guanyin", "fujin", "jinong", "guanyin", "fujin", "jinong",
  "guanyin", "fujin", "jinong", "guanyin", "fujin", "dragon"
];
export const FACTIONS = {
  guanyin: { name: "Guanyin", glyph: "觀", color: "#3E7FB8" },
  fujin: { name: "Fujin", glyph: "符", color: "#C8161D" },
  jinong: { name: "Jinong", glyph: "金", color: "#8C8C8C" },
  dragon: { name: "Dragon", glyph: "龍", color: "#3FA796" }
};
export const wheelMultiplier = (pick, edge) => {
  const count = WHEEL_SEGMENTS.filter((s) => s === pick).length;
  return count ? round2((1 - edge) * (WHEEL_SEGMENTS.length / count)) : 0;
};

export const GAME_NAME = Object.fromEntries(GAMES.map((g) => [g.id, g.name]));
// ---------- Roulette (guild rules) ----------
// A wheel of 25 pockets: 12 red, 12 black, 1 green. One red carries the Dragon and one
// black carries the Tiger. Must match ROULETTE_POCKETS in base44/shared/points.ts.
export const ROULETTE_POCKETS = [
  "green", "red", "black", "red", "black", "red", "black", "dragon",
  "black", "red", "black", "red", "black", "red", "black", "red",
  "black", "red", "tiger", "red", "black", "red", "black", "red",
  "black"
];
export const ROULETTE_RETURNS = { red: 2, black: 2, green: 14, dragon: 7, tiger: 7 };
export const pocketColor = (kind) => (kind === "dragon" ? "red" : kind === "tiger" ? "black" : kind);
export const rouletteWins = (spot, kind) => spot === kind || spot === pocketColor(kind);
export const ROULETTE_SPOTS = [
  { id: "red", name: "Red", glyph: "", color: "red" },
  { id: "green", name: "Green", glyph: "", color: "green" },
  { id: "black", name: "Black", glyph: "", color: "black" },
  { id: "dragon", name: "Dragon", glyph: "龍", color: "red", note: "a red pocket" },
  { id: "tiger", name: "Tiger", glyph: "虎", color: "black", note: "a black pocket" }
];