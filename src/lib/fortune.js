// Client-side mirror of Blacklist Dragon's Fortune (base44/shared/fortune.ts).
// The server decides every spin; this is only for drawing the reels and the paytable.
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0]
];
// Prize for 3 / 4 / 5 of a kind, as a multiple of the line bet (the bet divided by 10 lines).
export const PAYTABLE = {
  dragon: [50, 200, 1000], tiger: [30, 100, 500], sword: [20, 60, 250], lantern: [15, 40, 150],
  gold: [10, 25, 100], wood: [8, 20, 80], water: [5, 15, 60], fire: [5, 10, 50]
};
export const SCATTER_PAY = { 3: 2, 4: 10, 5: 50 };
export const SCATTER_SPINS = { 3: 8, 4: 12, 5: 20 };
export const FREE_MULTIPLIER = 2;
export const MAX_WIN_X = 2000;
// The reels' own return, worked out exactly on the server (RAW_RTP in fortune.ts).
export const RAW_RTP = 0.9853078323877521;
export const prizeScale = (edge) => (1 - edge) / RAW_RTP;

export const SYMBOLS = {
  dragon: { name: "Dragon", glyph: "龍", bg: "#B3141B", fg: "#FFE9A3" },
  tiger: { name: "Tiger", glyph: "虎", bg: "#C77712", fg: "#1B1204" },
  sword: { name: "Sword", glyph: "劍", bg: "#5E7387", fg: "#F2F6FA" },
  lantern: { name: "Lantern", glyph: "燈", bg: "#C4521C", fg: "#FFF1DC" },
  gold: { name: "Gold", glyph: "金", bg: "#8E7412", fg: "#FFF3B8" },
  wood: { name: "Wood", glyph: "木", bg: "#2F6B3C", fg: "#E5F6E8" },
  water: { name: "Water", glyph: "水", bg: "#255E8E", fg: "#E3F1FC" },
  fire: { name: "Fire", glyph: "火", bg: "#7E2A1C", fg: "#FFD9CC" },
  wild: { name: "Wild", glyph: "百", bg: "#F2F2F2", fg: "#B3141B", tag: "WILD" },
  scatter: { name: "Fortune", glyph: "福", bg: "#F5C542", fg: "#8E0F15", tag: "FREE" }
};
export const SYMBOL_IDS = Object.keys(PAYTABLE);