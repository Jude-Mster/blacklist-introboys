# IntroBoys Assistant + guild site: licenses

Members sign in to the app with their guild Discord, buy **Assistant days** in the guild shop with points, and the app
runs only while they have days left and still hold the guild member role.

```
 Shop (points) ──buy──► BotLicense (days, one PC)           ◄── Guild Leader: give / take days, switch off, free a PC
                              │
 App ──"start"──► code ──► member approves it on the site (Discord login + role check)
 App ◄── sign-in token (only a hash is stored on the site)
 App ──"check" every 2 min (token + PC id + random number)──► signed TICKET (valid ≤ 10 min, only for that PC and that question)
 Every key press, mouse click, screen grab and wait in the app first checks the ticket.
```

## One-time setup (about 15 minutes)

**1. Make the key pair** (on your PC, in the `IntroBoysAssistant` folder that has the `.sln`; needs Node):

```
node tools/gen-license-keys.mjs
```

It writes the *public* key into `IntroBoysAssistant/LicenseConfig.cs` and prints the *private* key once.
Add the private key on the site as a **secret named `BOT_LICENSE_PRIVATE_KEY`** (Base44 dashboard → your app → Secrets).
Keep a copy in a password manager. Never put it in the app, in git, or in a chat.
Optional secret `SITE_URL` (default `https://blacklistintroboys.com`) is the address the app opens for sign-in.

**2. Put the new site files in your repo and publish** (Base44 dashboard → publish, as you do for any change).
New/changed: `base44/functions/botAuth`, `base44/shared/botLicense.ts`, `base44/functions/shopAction`, `base44/entities/Bot*.jsonc`
and `ShopItem.jsonc`, `base44/shared/version.ts` (6.36), and in `src/`: `pages/Assistant.jsx`, `pages/Shop.jsx`,
`components/shop/ShopAdmin.jsx`, `components/admin/BotSection.jsx`, `lib/assistantLink.js`, nav, `App.jsx`, `GuildLayout.jsx`.
Then **Admin hall → System check**: the row "IntroBoys Assistant licenses" must be green.

**3. Check the address the app talks to.** `LicenseConfig.ApiBase` is set to
`https://blacklistintroboys.com/api/apps/6abe8bba244ec63c6d6d2855/functions` (the app id found in your site code).
Test it from any PC:

```
curl -s -X POST https://blacklistintroboys.com/api/apps/6abe8bba244ec63c6d6d2855/functions/botAuth -H "content-type: application/json" -d "{\"action\":\"ping\"}"
```

You should get `{"ok":true,"version":"6.36","signing":true}`. If the address is different on your host, fix `ApiBase` (and `SiteUrl`).

**4. Add the shop item.** Admin hall → Shop → Manage → Add → tick *This is IntroBoys Assistant time*. Set the days (e.g. 30) and the price in
points (before tax). Add several (7 days, 30 days...) if you like. Days switch on the moment the points are paid and add to the time left (max 730 days at once, max 12 per purchase).

**5. Build the app.** Open `IntroBoysAssistant.sln` in Visual Studio 2022 and build (it restores one NuGet package,
`System.Security.Cryptography.ProtectedData`). For handing out: *Publish* a Release build, or
`dotnet publish IntroBoysAssistant/IntroBoysAssistant.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:DebugType=none`.

**6. Try it end to end** with a normal member account: open the app → *Sign in with Discord* → browser opens the site → Approve →
the app says "No Assistant time" → buy days in the shop → *Check again* → the sign-in screen goes away and Start works.

## What is enforced, and where

| Rule | Enforced by |
|---|---|
| Only guild members with the Discord role | Site: role checked at sign-in approval, and again on the app's check-ins (Discord asked at least every 10 min). Lose the role → next check-in signs the app out. |
| Days exist only if paid for or given by the leader | Site: `shopAction` buy (points taken and days added together, refunded together if anything fails, under the member lock) and the leader's `adminGrant`. Nothing the app sends can add days. |
| A forged "yes" | Tickets are ECDSA-signed by the site. The app holds only the public key. A ticket names the PC, repeats the app's random number (no replays) and is good ≤ 10 min and never past the license end. |
| Clock tricks | The app counts ticket time with a stopwatch, not the PC clock. |
| Sharing one license | The license locks to the first PC that uses it; only one sign-in per member works at a time (a new sign-in cancels the old one); a stolen sign-in token used on another PC is cancelled; the member can move PCs once a week; the leader can free a PC any time. |
| Guessing sign-in codes | 8 characters, 10-minute life, 8 wrong tries per member then a 10-minute stop. The approve page shows a device ID that must match the one in the app (phishing check). |
| Banned / revoked | Leader's *Switch off* signs the app out at the next check-in (≤ 2 min) and blocks buying. |
| App without a license | Key presses, mouse input, screen capture and waiting all refuse to work without a valid ticket, and a full-window sign-in screen covers the program. |
| Offline | The app keeps running until its last ticket runs out (≤ 10 min), then locks. |

## Honest limits (read this)

* **A program on someone's own PC can always be patched.** Nobody can make a C# program "impossible" to crack. What is solid is the
  *server*: nobody can create days, a ticket can't be forged, copied to another PC or replayed. What a cracker *can* do is edit the program so it
  ignores the checks. To raise that bar: publish a Release build with no `.pdb`, run it through a .NET obfuscator
  (e.g. ConfuserEx2, Obfuscar or .NET Reactor), and code-sign the exe. Do this for every release.
* **Old copies keep working.** Versions up to 3.17.0 have no licensing and can't be switched off. Stop handing them out; ask members to move to 4.0.0.
* A member who clones their Windows install id onto two PCs can run only one at a time (the newest sign-in wins).
* If Discord itself can't be reached, the role check is skipped for that moment (ticket life limits this to a few minutes).
* Rotating the key (`--force`) locks out every program already handed out: only do it if the private key leaked.

## Day to day

* **Give or take days, switch off, free a PC:** Admin hall → *IntroBoys Assistant licenses*.
* **Member moved to a new PC:** they use *Move to another PC* on the Assistant page (once a week), or you free it.
* **Tests:** `npm run test:backend` runs the site's tests, including the new `tests/bot_license_test.ts` (shop, sign-in, tickets, device lock, expiry, role loss, guessing, tampering).

## Added when installing (6.31)

* **Spam guard on the app's sign-in.** One internet connection can ask for at most 5 sign-in codes per 10 minutes
  (counted in the database, so it holds on every server copy) and poll at most 60 times a minute. A computer asking
  again replaces its old code, but the old one still counts toward the limit. Other people keep signing in normally
  while one connection is stopped. Requests with no address are never lumped into one shared limit.
* **Give days to members (Admin hall → IntroBoys Assistant licenses → Give days to members).** Pick several members,
  or *Everyone in the guild* (every member with the role, banned members left out; you confirm with the count first),
  and give them the same number of days (negative takes days away). Each member is done on their own; anyone who
  can't take the days (switched off, over the 730-day limit) is listed with the reason. Points are never touched.
  Logged as `grant` / `grant_all` per member and one `grant_many` summary.

## Remote control (site 6.36, app 4.5.0)
New: entities `BotRemote` and `BotCommand`, actions `remotePush` (app) and `remoteView` / `remoteCommand` (member) in `botAuth`,
and the *Remote control* panel on the Assistant page (`src/components/assistant/RemotePanel.jsx`). Redeploy the functions and entities.
Members only ever see and control their OWN app; there is no leader view. Commands: start, stop, return_town - nothing else (6.37: upgrade and enhance were taken off the site).
The page polls every 3 s while it is open and visible; the app then reports every 3 s (otherwise every 20 s) and sends a ~30 KB picture every 5 s.

**6.37:** the picture may be JPEG, PNG or WebP, sent as plain base64 or as a `data:image/...;base64,` address (line breaks are fine),
up to about 300 KB, in the field `picture` (also read from `image` or `screenshot`). When a report has no usable picture the reason is
kept and shown on the remote page (for example "no picture in the report" or "picture too big"), so a missing live view can be traced.

**6.38 (app 4.5.1):** an app that can't make its picture sends `picture_error` with the reason, and the page shows it. If the database
refuses a picture, the rest of the report is still saved and the page says why. Both make a missing live view traceable.
