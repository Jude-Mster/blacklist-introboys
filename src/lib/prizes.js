// Prize codes on the page: the same rules the server uses (base44/shared/prizeCodes.ts).
export const REDEEM_URL = "https://wuxen2.com/redeem";
export const normalizeCode = (raw) => String(raw ?? "").replace(/[\s-]+/g, "");
export const groupCode = (raw) => normalizeCode(raw).replace(/(.{4})(?=.)/g, "$1 ");

// A short check shown under a code box: ok, or what's wrong.
export function codeHint(raw) {
  const c = normalizeCode(raw);
  if (!c) return { ok: false, text: "" };
  if (!/^[A-Za-z0-9]+$/.test(c)) return { ok: false, text: "Letters and digits only (spaces and dashes are ignored)." };
  if (c.length < 6 || c.length > 64) return { ok: false, text: `${c.length} characters: that looks too short or too long.` };
  if (c.length !== 16) return { ok: true, warn: true, text: `${c.length} characters. Wuxen2 GP codes have 16; check it if this is one.` };
  return { ok: true, text: "16 characters · looks right" };
}

export const PLACE = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

export const DM_TEXT = {
  sent: "Discord DM sent",
  blocked: "Discord DM blocked by their settings",
  no_bot: "Discord DM not set up",
  failed: "Discord DM failed",
  pending: "Discord DM sending"
};