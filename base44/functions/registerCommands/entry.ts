import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { getSettings, getMemberByUserId } from '../../shared/points.ts';

const COMMANDS = [
  {
    name: 'points',
    description: "Show a member's points",
    options: [{ type: 6, name: 'member', description: 'Member to look up (default: you)' }]
  },
  { name: 'leaderboard', description: 'Show the top 10 members' },
  {
    name: 'award',
    description: 'Award points to a member',
    options: [
      { type: 6, name: 'member', description: 'Member to award', required: true },
      { type: 4, name: 'amount', description: 'Points to award (or remove for leader)', required: true },
      { type: 3, name: 'reason', description: 'Reason for the award', required: true }
    ]
  }
];

export default async function(req) {
  try {
    const b = createClientFromRequest(req);
    const user = await b.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const caller = await getMemberByUserId(b, user.id);
    if (!caller || caller.role !== 'leader') return Response.json({ error: 'Leader only.' }, { status: 403 });

    const settings = await getSettings(b);
    if (!settings.guild_id) return Response.json({ error: 'Set the guild ID in Settings first.' }, { status: 400 });

    const clientId = secrets.get('DISCORD_CLIENT_ID');
    const token = secrets.get('DISCORD_BOT_TOKEN');
    const res = await fetch(
      `https://discord.com/api/v10/applications/${clientId}/guilds/${settings.guild_id}/commands`,
      { method: 'PUT', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(COMMANDS) }
    );
    if (!res.ok) {
      const t = await res.text();
      return Response.json({ error: 'Discord API error: ' + t }, { status: 502 });
    }
    const data = await res.json();
    return Response.json({ ok: true, registered: data.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}