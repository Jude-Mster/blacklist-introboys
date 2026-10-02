import { secrets } from 'base44:runtime';

// Dumb redirector. Discord redirects here with ?code&state (or ?error). Nothing is
// verified or signed in here. We just forward code+state to the /login page, which
// calls discordLogin to verify guild membership and issue a session.

function secret(name: string) {
  try {
    const v = secrets.get(name);
    return v ? String(v).trim() : '';
  } catch {
    return '';
  }
}

const NOT_READY_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Discord linking isn't ready</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050505;color:#e8e8e8;font-family:system-ui,sans-serif;padding:1.5rem}.c{max-width:30rem;text-align:center;border:1px solid #3a3a3a;border-top:2px solid #C8161D;border-radius:6px;padding:2rem;background:#111}.c h1{font-size:1.15rem;margin:0 0 .6rem;color:#fff}.c p{color:#a8a8a8;font-size:.95rem;line-height:1.5;margin:0}</style></head>
<body><div class="c"><h1>Discord linking isn't ready yet</h1><p>The guild leader needs to finish Discord setup (app address + redirect URI) before linking works. Go back to the guild site and try again later.</p></div></body></html>`;

export default async function(req) {
  // Resolve the app's public origin. Prefer APP_URL (custom domain); otherwise
  // derive it from the registered Discord redirect URI. NEVER use req.url.origin —
  // inside the dispatcher worker that is the dispatcher's own host.
  const redirectUri = secret('DISCORD_REDIRECT_URI');
  let appOrigin = secret('APP_URL');
  if (!appOrigin) {
    try { appOrigin = redirectUri ? new URL(redirectUri).origin : ''; } catch { appOrigin = ''; }
  }
  const appUrl = appOrigin.replace(/\/$/, '');
  if (!appUrl) return new Response(NOT_READY_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const back = (path: string) => Response.redirect(appUrl + path, 302);
  const u = new URL(req.url);

  // User pressed Cancel on Discord, or Discord sent an error.
  if (u.searchParams.get('error')) return back('/login?error=cancelled');

  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (!code || !state) return back('/login?error=state');

  // Forward to the page; discordLogin does the verification and sign-in.
  return back(`/login?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
}