// Guild ranks, lowest to highest. `officer` is the stored id for Vice Guild Member.
export const RANKS = ["member", "guild_member", "officer", "leader"];
export const ROLE_TITLE = {
  member: "Member",
  guild_member: "Guild Member",
  officer: "Vice Guild Member",
  leader: "Guild Leader",
  guest: "Discord"
};
export const ROLE_SHORT = { member: "Member", guild_member: "Guild", officer: "Vice", leader: "Leader", guest: "Discord" };
export const isStaff = (m) => !!m && (m.role === "officer" || m.role === "leader");