// 6.33: the maps of the War Room (HSB planning board), gathered from the official Wuxen2 wiki
// (wiki.wuxen2.com, #holy-stone and #outpost-capture, checked 20 Oct 2026). The pictures are shown from the
// wiki itself; the pins are where the wiki places them, as % of the picture's width and height.
// Keep the ids in step with WAR_MAP_IDS in base44/shared/warRoom.ts.
export const WIKI_MAPS = "https://wiki.wuxen2.com/img/maps/";

export const TRIBES = {
  wd: { name: "White Dragon", color: "#e9eef5" },
  bs: { name: "Black Snake", color: "#b48cff" },
  gt: { name: "Golden Tiger", color: "#f2c14e" },
  none: { name: "Shared", color: "#9fd3c7" }
};

// w x h = the picture's own size (so the board keeps its shape before the picture arrives)
export const WAR_MAPS = [
  { id: "z001", name: "Piercing City", tribe: "wd", step: "Capital", w: 640, h: 717 },
  { id: "z002", name: "Crystal Waters", tribe: "wd", step: "2nd map", w: 640, h: 640 },
  { id: "z003", name: "Bamboo Crane Woods", tribe: "wd", step: "3rd map", w: 640, h: 673 },
  { id: "z004", name: "Fragrance Village", tribe: "wd", step: "4th map", w: 640, h: 655 },
  { id: "z006", name: "Wandering City", tribe: "bs", step: "Capital", w: 640, h: 719 },
  { id: "z007", name: "Evergreen Waterfall", tribe: "bs", step: "2nd map", w: 640, h: 710 },
  { id: "z008", name: "Frozen Valley", tribe: "bs", step: "3rd map", w: 640, h: 530 },
  { id: "z009", name: "Holy Valley", tribe: "bs", step: "4th map", w: 640, h: 626 },
  { id: "z011", name: "Molten City", tribe: "gt", step: "Capital", w: 605, h: 767 },
  { id: "z012", name: "Burning Woods", tribe: "gt", step: "2nd map", w: 640, h: 608 },
  { id: "z013", name: "Forlorn Land", tribe: "gt", step: "3rd map", w: 640, h: 579 },
  { id: "z014", name: "Sundrenched Valley", tribe: "gt", step: "4th map", w: 640, h: 643 },
  { id: "z038", name: "Ghost Valley", tribe: "none", step: "Between the tribes", w: 598, h: 767 },
  { id: "z074", name: "Temple of the Benevolent", tribe: "none", step: "Legacy stone", w: 640, h: 640 }
];
export const mapById = (id) => WAR_MAPS.find((m) => m.id === id) || WAR_MAPS[12];
export const mapUrl = (id) => `${WIKI_MAPS}${id}.webp`;

// Where each Holy Stone stands, by the tribe holding it (wiki #holy-stone), plus the Dragonfall Outpost.
export const STONES = [
  { id: "solar", name: "Solar Holy Stone", home: "wd" },
  { id: "lunar", name: "Lunar Holy Stone", home: "bs" },
  { id: "astral", name: "Astral Holy Stone", home: "gt" },
  { id: "legacy", name: "Legacy Holy Stone", home: "none" }
];
export const WIKI_PINS = [
  { stone: "solar", holder: "wd", map: "z002", x: 38.24, y: 40.6 },
  { stone: "solar", holder: "bs", map: "z008", x: 64.9, y: 48.35 },
  { stone: "solar", holder: "gt", map: "z013", x: 32.34, y: 46.72 },
  { stone: "lunar", holder: "bs", map: "z007", x: 43.99, y: 76.16 },
  { stone: "lunar", holder: "wd", map: "z003", x: 21.6, y: 82.59 },
  { stone: "lunar", holder: "gt", map: "z013", x: 38.93, y: 50.21 },
  { stone: "astral", holder: "gt", map: "z012", x: 25.36, y: 40.69 },
  { stone: "astral", holder: "wd", map: "z003", x: 11.67, y: 89.87 },
  { stone: "astral", holder: "bs", map: "z008", x: 73.67, y: 53.16 },
  { stone: "legacy", holder: "none", map: "z074", x: 49.74, y: 50.55 },
  { stone: "legacy", holder: "wd", map: "z004", x: 92.05, y: 34 },
  { stone: "legacy", holder: "bs", map: "z009", x: 60.19, y: 27.51 },
  { stone: "legacy", holder: "gt", map: "z014", x: 84.3, y: 38.09 },
  { outpost: true, map: "z038", x: 42.25, y: 48.04, label: "Dragonfall Outpost" }
];
export const pinsFor = (mapId) => WIKI_PINS.filter((p) => p.map === mapId);
export const stoneName = (id) => (STONES.find((s) => s.id === id) || {}).name || "";

// What the board draws with.
export const CHALK = [
  { id: "white", label: "White", color: "#f4f1ea" },
  { id: "yellow", label: "Yellow", color: "#ffd84d" },
  { id: "red", label: "Red", color: "#ff5a52" },
  { id: "blue", label: "Blue", color: "#6cc6ff" },
  { id: "green", label: "Green", color: "#7be08b" },
  { id: "pink", label: "Pink", color: "#ff8ad1" }
];
export const STAMPS = [
  { id: "attack", label: "Attack", glyph: "⚔" },
  { id: "defend", label: "Defend", glyph: "🛡" },
  { id: "target", label: "Target", glyph: "✕" },
  { id: "stone", label: "Holy Stone", glyph: "◆" },
  { id: "gate", label: "Gate", glyph: "⛩" },
  { id: "guardian", label: "Guardian stone", glyph: "●" },
  { id: "rally", label: "Rally point", glyph: "⚑" },
  { id: "A", label: "Team A", glyph: "A" },
  { id: "B", label: "Team B", glyph: "B" },
  { id: "C", label: "Team C", glyph: "C" }
];
