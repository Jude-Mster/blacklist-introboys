// Retired. Discord is now the sign-in itself (see discordLogin). This stub stays
// only so an old copy of this function can't keep running. Safe to delete.
export default async function(_req) {
  return Response.json({ error: 'This endpoint was retired. Sign in with Discord from the login page.' }, { status: 410 });
}