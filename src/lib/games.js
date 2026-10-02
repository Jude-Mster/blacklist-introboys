// Client-side mirror of the server game rules. The server decides every result;
// these helpers only show odds and payouts before a bet.

export const round2 = (n) => Math.round(n * 100) / 100;
export const edgeOf = (settings) => Math.min(Math.max(Number(settings?.house_edge_pct) || 0, 0), 20) / 100;

export const GAMES = [
  { id: "coinflip", name: "Blacklist Yin Yang Toss", blurb: "Call Yin or Yang, or duel another member." },
  { id: "dragondice", name: "Blacklist Dragon Dice", blurb: "Set your own odds on a roll of 1 to 100." },
  { id: "lanternslots", name: "Blacklist Lantern Slots", blurb: "Three reels. Three seals pays 50×." },
  { id: "skywheel", name: "Blacklist Twelve Skies Wheel", blurb: "Back a faction and spin the wheel." },
  { id: "roulette", name: "Blacklist Jade Roulette", blurb: "One shared table. A new spin every round." },
  { id: "poker", name: "Poker Room", blurb: "Texas Hold'em against other members.", href: "/poker" }
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
  fujin: { name: "Fujin", glyph: "符", color: "#B8323A" },
  jinong: { name: "Jinong", glyph: "金", color: "#C99A3A" },
  dragon: { name: "Dragon", glyph: "龍", color: "#3FA796" }
};
export const wheelMultiplier = (pick, edge) => {
  const count = WHEEL_SEGMENTS.filter((s) => s === pick).length;
  return count ? round2((1 - edge) * (WHEEL_SEGMENTS.length / count)) : 0;
};

export const GAME_NAME = Object.fromEntries(GAMES.map((g) => [g.id, g.name]));
// ---------- Roulette ----------
export const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const rouletteColor = (n) => (n === 0 ? "green" : ROULETTE_RED.has(n) ? "red" : "black");
export const ROULETTE_PAYS = { straight: 35, color: 1, parity: 1, half: 1, dozen: 2, column: 2 };
export const betKey = (b) => `${b.type}:${b.value}`;
export function betLabel(b) {
  switch (b.type) {
    case "straight": return String(b.value);
    case "color": return b.value === "red" ? "Red" : "Black";
    case "parity": return b.value === "odd" ? "Odd" : "Even";
    case "half": return b.value === "low" ? "1–18" : "19–36";
    case "dozen": return ["1st 12", "2nd 12", "3rd 12"][b.value - 1];
    case "column": return `Column ${b.value}`;
    default: return "";
  }
}
export function rouletteWins(b, n) {
  if (b.type === "straight") return b.value === n;
  if (n === 0) return false;
  switch (b.type) {
    case "color": return rouletteColor(n) === b.value;
    case "parity": return (n % 2 === 0 ? "even" : "odd") === b.value;
    case "half": return (n <= 18 ? "low" : "high") === b.value;
    case "dozen": return Math.ceil(n / 12) === b.value;
    case "column": return ((n - 1) % 3) + 1 === b.value;
    default: return false;
  }
}