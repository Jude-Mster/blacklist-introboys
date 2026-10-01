// Client-side mirror of the server game rules. The server decides every result;
// these helpers only show odds and payouts before a bet.

export const round2 = (n) => Math.round(n * 100) / 100;
export const edgeOf = (settings) => Math.min(Math.max(Number(settings?.house_edge_pct) || 0, 0), 20) / 100;

export const GAMES = [
  { id: "coinflip", name: "Yin Yang Toss", blurb: "Call Yin or Yang. Even odds." },
  { id: "dragondice", name: "Dragon Dice", blurb: "Set your own odds on a roll of 1 to 100." },
  { id: "lanternslots", name: "Lantern Slots", blurb: "Three reels. Three seals pays 50×." },
  { id: "skywheel", name: "Twelve Skies Wheel", blurb: "Back a faction and spin the wheel." }
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