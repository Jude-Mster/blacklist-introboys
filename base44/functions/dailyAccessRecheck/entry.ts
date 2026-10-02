import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getSettings, errorResponse } from '../../shared/points.ts';
import { hasRoleNow } from '../../shared/access.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE_MS = 500; // ~2 Discord calls/sec — stays well under the rate limit

// Daily sweep: re-check every non-leader member's Discord role and sync no_access.
// Never changes no_access when Discord couldn't be asked (null). Paced to respect
// Discord rate limits. Logs how many were checked, denied, restored, and skipped.
export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    // Scheduled task has no user session. If a user calls directly, require admin.
    const user = await b.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Admin only.' }, { status: 403 });

    const settings = await getSettings(b);
    const { items } = await b.asServiceRole.entities.Member.filter(
      { role: { $ne: 'leader' }, banned: false },
      { limit: 1000, fields: ['id', 'discord_id', 'discord_name', 'no_access', 'access_checked_at'] }
    );

    let checked = 0, denied = 0, restored = 0, skipped = 0;
    for (const m of items) {
      checked++;
      const ok = await hasRoleNow(settings, m.discord_id);
      if (ok === null) {
        skipped++; // couldn't ask Discord — leave no_access unchanged
      } else if (ok === false) {
        if (!m.no_access) {
          await b.asServiceRole.entities.Member.update(m.id, { no_access: true, access_checked_at: new Date().toISOString() });
          denied++;
        }
      } else if (m.no_access) {
        await b.asServiceRole.entities.Member.update(m.id, { no_access: false, access_checked_at: new Date().toISOString() });
        restored++;
      }
      await sleep(PACE_MS);
    }
    const msg = `dailyAccessRecheck: checked=${checked} denied=${denied} restored=${restored} skipped=${skipped}`;
    console.log(msg);
    return Response.json({ checked, denied, restored, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}