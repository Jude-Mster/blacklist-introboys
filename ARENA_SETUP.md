# Blacklist Arena: setup after publishing (version 6.8)

## 1. Push and publish
Push everything, then publish from the Base44 dashboard so the new pieces deploy:
- Entities: ArenaTable, ArenaBet, Tournament, TourEntrant, ArenaBank, ArenaPresence (who is watching), ArenaReaction (emojis), plus the updated Bet, PointLog, Settings
- Functions: arenaAction, tournamentAction (and every other function: the backend version is now 6.5)
- Workflows: "Arena Payouts" and "Tournament Clock", every 5 minutes

Then run Admin hall → System check: anything not on 6.5 wasn't republished.

## 2. Live Arena settings
Admin hall → Guild settings:
- Games: tick **Blacklist Arena**.
- **Live Arena betting time: 30.** New installs default to 30. If the settings page was saved while the old default (120) was showing, it is stored as 120: change it to 30 and Save.
- Arena limit per fight 5,000, smallest bet 1.

## 3. Fights and odds (engine version 5)
- Nothing is decided ahead of time. A Live Arena fight and every tournament match is fought only when its betting closes (fresh secret seed at that moment); the next tournament match opens when the one before it is over.
- Prices come from 2,000 practice fights between the two exact fighters (every stat, upgrade, weapon, skill, pet and mount), priced from the cautious end of each rate, with a house edge on every bet. Over 600 random matchups bettors got back about 80% of what they staked on every kind of bet.
- Caps: fighter 6x, side bet 5x, Draw 10x. A heavy favourite whose price would be under 1.01x isn't offered.
- Side bets: ends without a critical; over/under potions drunk; over/under critical hits; over/under buff skills cast. (One-hit KO bets are gone; old ones still pay out normally.)
- No one can hold both fighters or both sides of an over/under on the same fight.
- The fight in progress when you publish is replaced by a new one; bets on it are handed back.

## 4. Tournaments
Fight → Tournament tab, Guild Leader only: name, start time (or the "Start in 15 min / 30 min / 1 hour / 2 hours / tomorrow" buttons, or leave it empty and use Start now), Schedule (one-off, every day, every week), prizes and upgrade values.
- A repeating tournament opens the next one by itself when it ends (also when it's cancelled for too few sign-ups). Codes "taken from stock" are taken again from stock; a typed code works once, so add a new one.
- Guild chat and Discord get: sign-up open, "starts in 10 minutes" (@everyone), started, cancelled, results.
- Finished matches have a Watch button in the bracket. 2x speed and Skip to result only appear on those replays, never on a live match.

## 5. What changed in 6.3 (site only, no new entities)
- Buff skills play a charging power-up yell with an aura rumble. Browsers only allow sound after the first tap on the page; the Sound button turns it off.
- Fighters are 30% bigger and stay solid during spin attacks (no more see-through frames).
- PC: bigger nameplates, player frames, skill icons, timer and damage numbers.
- Phones: the bet slip sits right under the arena (above the fighter stats), side bets fold into one "Side bets" button, the header tabs no longer overlap the title, and the camera pulls back so both fighters fit.

## 6. What changed in 6.5 (site only, no new entities; built on 6.3, not on 6.4)
- The fighter frames are rebuilt at a higher resolution (0.7 of the recording instead of 0.6) and lightly sharpened. The glow of the buffs and the spear's aura is left soft.
- Skyfall now plays every frame of the recording (30 a second, was 15). Where the game blurs the body mid-spin, the nearest sharp pose shows with the game's blur laid over it, so the swing no longer freezes on one pose. The 3D blade, its aura and the swing trail are unchanged.
- The Iron Condor flies on its own over fighters who own one: it hovers between the head and the name plate, bobs, beats its wings and trails a little behind the leaps. The recording's own condor is taken out of every frame.
- The game's own sounds, cut from the recordings: the buff charge, Skyfall's sweep and blast, and the jump in. (The made-up sounds only play if a sound file fails to load.)

## 7. What changed in 6.6 (backend functions and one entity field: redeploy tournamentAction and arenaAction)
- Crimson LightningCharger is shown as a buff skill: crimson icon in the buff row and skill bar, its name pops up when cast, and it has its own charge sound (crackling lightning that builds and snaps). It isn't counted in the "buff skills cast" side bets.
- The name plates no longer show "[Premium]". The winner text at the end of a fight has no box behind it. The word "Tease" is gone from the emoji row. The arena page is wider (76rem).
- MP no longer refills every second; it only goes down when a buff or the charge is cast.
- Speed is one stat (was "Attack speed"). It sets the turn order and the pace of every move (buff casts, charge, Skyfall, recovery: down to 55% of the time). Spirits Within adds its +15% Speed the moment it is cast, and the player frame shows the boosted Speed in its colour.
- The Draw is always offered in the Live Arena, at most 10×. Draws are very rare, so it is a long shot; the house can't lose on it.
- Tournaments: the Guild Leader sets the prices (entry, skill, weapon try, pet growth, mount level, mount reset) when opening or editing a tournament. Saved on Tournament as `costs`; repeats keep them. A purchase made at a price that just changed is refused with the new price.
- ENGINE_VERSION 4: the Live Arena replaces any open round from engine 3 by itself.

## 8. What changed in 6.7 (redeploy tournamentAction and arenaAction; Tournament gains bank_deferred)
- Character Lab: once a member has a tournament fighter, the stage shows only that character on a test platform (grid floor, turning rune circle, scanner ring, light beams). It loops through its own buffs, Crimson LightningCharger and two Skyfalls, with its live stats on the right. Before buying, the stage still shows the ring.
- "Your fighter": the weapon, Iron Condor and mount each have their icon, a level bar, what the next level gives and their buttons (new icon: public/arena/icons/weapon.jpg).
- Stronger upgrades (ENGINE_VERSION 5): weapon +15% ATK and +5% Crit rate per level; mount +3% per level; Iron Condor twice as strong (HP +550, ATK +337.5, DEF +550 per 25%; +4,400 / +2,700 / +4,400 at 200%); new upgrade values per roll (below). A tournament opened before this keeps the upgrade values it was saved with (the Guild Leader can change them under "What each upgrade gives").
- Faster purchases: buying and re-rolling only lock the buyer, not the whole tournament, and no longer write the tournament row or the bank on every purchase. Points paid are held on each fighter and go into the Arena bank in one move when the tournament starts (refunds then never touch the bank). The page shows the new fighter straight from the purchase instead of reloading everything. If the tournament starts mid-purchase, that purchase is undone and refunded.
- Upgrade values (defaults, per roll): HP +7,000, ATK +950, DEF +900, Crit rate +1.5%, Crit defense +3%, Accuracy +5%, Evasion +8%, HP potions +2, Potion heal +3%, Speed +10%. Spirits Within gives +20% Speed.
- Weapon forge: pressing Try upgrade plays a forge in the Character Lab. Motes of the next aura colour spiral in and the aura round the fighter shrinks into the blade, which glows brighter in that colour. On success a flash and a ring of light, and the new aura stays; on failure the glow stutters, breaks into sparks and a grey puff, and the old aura comes back. The result text shows after the animation.
- Shop and bet buttons no longer get rebuilt on every screen refresh (a tap could be lost mid-rebuild, which made buying feel laggy).

## 9. What changed in 6.8 (site, plus the QA fixes in the backend: see QA_REPORT.md)
- The Character Lab has its upgrade buttons on the stage itself, so members build their fighter while watching it (no scrolling down):
  - left side, under the player frame: 1 entry, 5 entries, Add skill, Re-roll;
  - right side: Weapon (with the forge), Iron Condor, Mount and Mount reset. On a computer they sit under the stats panel.
  - The buttons are see-through glass with no frames (a thin light on one edge, a glow on hover), with level bars for the weapon, pet and mount. On phones they are narrow tiles with the icon on top so the fighter keeps the middle.
  - The result of each purchase shows on the stage for a few seconds (at the top on phones, at the bottom on computers).
- The full shop with every detail is still in "Your fighter" under the stage.
- QA audit fixes (see QA_REPORT.md): an officer's daily award cap can no longer be passed by sending several awards at once (site and Discord /award); amounts like 1.5 and "0 entries" are refused instead of rounded; deleting an unknown chat message says "not found". Automated tests in tests/ (`npm run test:formulas`, `npm run test:backend`).

## 10. What changed in 6.9 (redeploy shopAction, tournamentAction, arenaAction, getLeaderboard, adminAction, discordInteractions; new fields on ShopItem, ShopOrder)
- Tournament overtime (ENGINE_VERSION 6): a tournament match with no knockout at 180 seconds goes to overtime instead of being decided on HP. Overtime is sudden death: no potions, every hit does ×2 damage, rising by one every 5 seconds (×3 after 5 s, ×4 after 10 s...). The stage shows a big OVERTIME banner, the timer turns into a crimson "OT · ×2" box, and the log notes each step. If nobody is down after 90 seconds of overtime (it never happened in thousands of test fights), the larger share of HP left wins, and an exact tie goes to the fight's own coin toss (no longer always to the first fighter). Match prices already count overtime. The Live Arena is unchanged: no knockout there is still a Draw.
- Rankings (the site board, the Discord /leaderboard and "Post rankings") leave out members who lost their Discord role, as well as banned members. They come back as soon as the role comes back.
- Guild shop GP codes. In Manage > Catalog, tick "This is a GP code" and enter what one code is worth in GP (the price follows it: 1 GP = 2 CP, times the shop rate, plus tax). Then choose where the codes come from:
  - From stock: the buyer sees the code the moment they pay, with Copy and Redeem buttons. Paste codes straight into the item editor, or add them on the Prizes page under the same stock name (for example "500 GP Code"). The item's stock is the number of codes waiting.
  - I type it: the order waits in "Orders waiting"; type the code (one per line when several were bought) and press Send the code.
  Either way the code is also kept under My orders and Profile > My prizes and is sent by Discord DM. Codes are stored encrypted, a code can never be added or given twice, and the leader's screens only show the last four characters. A waiting typed-code order can still be rejected with a full refund. GP codes need no character name.

## 11. What changed in 6.10 (redeploy every function; ENGINE_VERSION 7; new npm package fix-webm-duration)
- Both fighters attack at the same time. Each runs its own rounds (buff rolls, Crimson LightningCharger, Skyfall, recovery) on its own clock and never waits for a turn. Speed sets how fast those rounds go (pace = 100 / Speed, down to 55%), so a faster fighter simply attacks more often: about 1.6 times as often at 180% Speed. An HP potion is drunk at the start of the fighter's next round after a hit leaves them at 70% HP or less. When both blows land in the same instant, the fight's coin toss decides whose lands first. Fights are shorter (about 17 s on average). Prices come from practice fights that follow the same rules; checked against real fights, every bet type still pays back under 100%.
- Weapon upgrade success rate: 20% by default (was 30%). A tournament keeps the rate it was opened with; the Guild Leader can change it under "What each upgrade gives" while sign-up is open.
- Upgrade limit: 50 upgrades per fighter (was 25), still at most 9 per stat. The 1-entry tile shows a bar instead of 50 pips.
- Character Lab: Re-roll is no longer on the stage; it is only under "Your fighter". Re-roll and mount Reset both open a confirmation first that says exactly what will change (and the cost), and the Yes button only works once the member ticks "I understand".
- Bracket: drawn as a tree, one column per round, with lines that light up gold along each winner's path, byes shown where a fighter skipped round 1, the champion at the end and the third-place match under the final. The live match glows red and is scrolled into view; a finished tournament opens on the champion. On a phone it scrolls sideways.
- Download replay: every replay (bracket Watch, Live Arena "Watch") has a Download button. It plays the fight again at normal speed and saves it as a video (WebM; MP4 on Safari) with the fight's sound when sound is on, labelled with the tournament, match and names. Matches fought before 6.10 (older fight engine) can't be replayed exactly, so their Watch button is hidden.
- Notes on what counts: wherever a weapon try is bought (the stage tile, "Your fighter", the rules) it says the success rate (20% by default) and that a failed try is not credited as an entry but its points count toward the fighter's total spent. While the forge plays, the same note shows on the stage, and the failure message repeats it. Mount reset says the same (in "Your fighter", in its confirmation and in the rules). The fighter list's "Paid" column is now "Total spent".

## 12. What changed in 6.11 (redeploy every function; ENGINE_VERSION 8; no entity or package changes)
- Live Arena fighters can now have 1 to 51 entries (the full 50 upgrades), and weapon tries use the 20% rate.
- Live Arena matchmaking: fighter B is drawn within 20% of A's entries and kept when A wins 32% to 68% of 300 practice fights and almost none of them run out of time (up to 12 tries, then a fresh A). Prices therefore mostly sit between about 1.4x and 2.6x.
- Prices come from 2,000 practice fights fought by the real fight code (they used a faster approximation before), so every line is priced on exactly what will happen.
- Fighters pay at most 4x (was 6x); a fighter whose fair price would be higher is not offered at all (it used to be cut down to the cap, which made long shots bad bets). Edges unchanged: 10% favourite, 15% outsider.
- Side bets: offered only when they come up 30% to 70% of the time (was 10-90%), at most 3x (was 5x). Buffs over/under is gone; "Fight lasts over/under N s" is new. Ends without a critical, potions and criticals over/under stay.
- No Draw bet any more (a Draw is practically impossible now that both fighters attack at once). If a Live Arena fight ever reaches 180 s, bets on either fighter still get half back.
- Measured (2 runs of 1,400 real fights each, real prices, 100 on every offered line): Live Arena fighter bets pay back about 83%, side bets 70-92% depending on the line, about 81-82% overall. Biggest possible win on a 5,000 bet: 20,000.
- Tournaments use the same prices and caps. Their fighters are built by members, so a big mismatch can leave only the side bets (and the favourite, when it pays at least 1.01x).

## 13. What changed in 6.12 (redeploy every function; no entity, engine or package changes)
- Shorter waits: the Live Arena result shows for 6 s, then the next fight opens (was 15 s); tournament matches open 5 s after the last result (was 10 s). A Live Arena round is now about a minute.
- Live Arena betting time: 15 s by default (was 30). It is a setting in the admin hall ("Live Arena betting time"); a site that saved 30 there keeps 30 until it is changed to 15.
- Steadier fights:
  - the page's copy of the server clock now allows for how long each reply took, trusts the quickest replies, and eases towards a correction (at most 5% faster or slower) instead of jumping. Before, every slow reply nudged the fight forward or back, which made it stutter and sometimes replay a moment;
  - the fight on screen never steps back for a small correction, catches up a small lag smoothly, and only jumps for a big gap (a tab coming back);
  - knock-backs ease over a few frames instead of snapping;
  - the two fighters keep a fixed front/back order (the one swinging Skyfall in front), so they no longer flicker through each other when they overlap;
  - the 3D canvas is only resized when the stage size changes (it was resized every frame);
  - the page refreshes its numbers twice a second instead of four times.
  Measured under slow, uneven replies (0.1-1.5 s): 6.11 had 17 visible jumps and 9 backward steps in 288 frame steps; 6.12 had 4 small ones and none backward.
- Sound:
  - one audio player for the whole page. Each stage (Live Arena, tournament, replays) used to make its own, browsers only allow a few, and later ones stayed silent (6.11 had 6 after opening the Live Arena 6 times; 6.12 has 1);
  - every tap or key wakes the sound up again (not just the first), and it is woken when the tab comes back: phones and browsers silence it after a tab switch or a call;
  - sounds play even when a frame is late (they were skipped when the page was 0.3 s behind);
  - when sound is on but the browser hasn't allowed it yet, a "Tap to hear the fight" button shows next to Sound on.

## 14. What changed in 6.13 (redeploy every function; Tournament gains max_spend; no engine or package changes)
- Spending limit per member, set by the Guild Leader for each tournament ("Spending limit" in the leader panel, when opening or editing; empty or 0 = no limit). It counts everything bought for the fighter: entries, skills, weapon tries (failed ones too), Iron Condor growth, mount levels and resets. Bets on matches are not counted (they keep the per-match and daily limits). The free re-roll is always allowed.
- A purchase that would go over the limit is refused before any points move, with how much is left. It is checked under the member's lock on a fresh read of the tournament, so several clicks at once can't pass it, and a limit the leader just changed applies to the next purchase. Lowering it below what someone has already spent takes nothing back; it only stops further buying. A repeating tournament keeps the limit.
- Members see the limit before their first entry, in the rules, and under "Your fighter" as "total spent X of Y" with a bar and what is left. Buttons that would go over it are greyed out.

## 15. What changed in 6.14: speed and "server busy" (redeploy every function; no entity, engine or package changes)
Found on the live site (11-12 Oct): the Arena's "state" call took 9 to 21 seconds and many calls failed with "Rate limit exceeded" from Base44's database, with fewer than 5 members on. Base44 limits how many database calls one app may make, and the site was going over it:
- When a round (or a tournament match) was due to move on, every screen that asked at that moment queued for the same lock, and each waiting request checked the lock several times a second for up to 20 seconds. Each check is a database call, so a few screens made hundreds of calls in a burst; that tripped the limit, the work slowed down, more requests queued, and so on.
- The crowd ("watching" count and emojis) was the busiest caller of all: every screen every 5 seconds, 4 to 6 database calls each time.
Fixes:
- Moving the Live Arena or a tournament on is done by the first request that notices; the others no longer queue: they answer with what is there and the screen asks again a moment later.
- Every other lock (bets, purchases, payouts) checks gently: about 5 times a second at first, easing to once a second (was up to 14 a second).
- The crowd asks every 12 seconds (was 5) and counts a member as watching every 30 seconds (was 20).
- A session is remembered for 2 minutes by each running copy of a function (was 30 seconds); the member row is still read fresh every time, so a ban or a lost role still applies at once.
- The Live Arena asks every 5 seconds while betting is open (was 4).
Measured with 5 members on the Live Arena for 5 minutes: 642 database calls a minute and 161 function calls a minute on 6.13; 409 and 107 on 6.14 (36% and 34% fewer), without the bursts at the end of each round.

## 16. What changed in 6.15: fewer database reads (redeploy every function and publish the site; no entity, engine or package changes)
Base44's diagnosis (12 Oct): the load is reads, not play; the account refresh was the heaviest single call; a refused call was retried up to 5 times, turning one call into six.
- **Account refresh is light.** `getMyAccount` now returns only the member and settings. History, stats and rank are read only while Dashboard or Profile is open (`{ detail: true }`). Rank comes from a balance list each copy of the function keeps for 1 minute, and skips members without guild access (same as the leaderboard).
- **Fewer account refreshes.** The top bar refreshes at most once every 10 seconds (it was 2.5 s after every change) and once every 90 seconds while idle (was 60). A new balance still shows at once from each game's answer.
- **Settings cached 30 s** (was 10 s). Saving settings in the admin hall still reads them fresh.
- **Polls reuse the member row for 20 s.** Arena state and crowd, tournament state, and chat no longer re-read the member on every poll. Bets, buys and everything that moves points still read it fresh.
- **Arena table read by id** instead of a list query.
- **Retries: 3** (was 5). At the limit a call now gives up within about 2 seconds instead of 10-20.
- Load simulation (5 members on the Live Arena for 5 minutes): 570 → 407 database calls a minute, and no account-refresh bursts.

## 17. What changed in 6.16: shared reads, quiet hidden tabs, no endless loading (redeploy every function and publish; no entity, engine, points or package changes)
6.15 was live and the site still went "server busy": every screen still made its own database reads, so the load grew with each member who joined.
- **Shared reads (`base44/shared/memo.ts`).** Requests handled by the same running copy of a function share one read for a moment: the Live Arena table (1 s) and its bets (1.5 s), the crowd and emojis (3 s), chat (3 s), the tournament (2.5 s) and its fighters (2 s), and the Roulette, Sic Bo and Wheel tables and bets (1-1.5 s). Requests arriving together wait for that one read. Bets, take-backs, payouts, emojis and every tournament change clear the shared answers at once, so you always see your own bet straight away. Settings are read once per 30 s per copy, also when many requests arrive together.
- **Polls reuse the member row for 20 s**, now in Roulette, Sic Bo and Wheel too (bets always read it fresh). The emoji "one at a time" check no longer reads the database.
- **Hidden tabs make no calls.** The Live Arena and tournament screens stop polling when the tab is hidden and catch up the moment it is shown. Chat checks once a minute while the chat panel is closed (new messages still arrive live).
- **No retry storms.** Timed refreshes are not retried on "busy" (the next refresh is the retry). Each "busy" answer in a row doubles the pause (4, 8, 16, 30 s).
- **No endless loading.** A returning member sees the site at once from the last account this device loaded, while a fresh copy loads. A first visit during a busy spell retries quietly (2, 4, 8, 15 s) before showing an error, and the error page keeps retrying every 15 s.
- Load simulation (members on the Live Arena, one running copy): 5 members 381 → 105, 10 members 644 → 122, 20 members 1,442 → 201 database calls a minute. If Base44 runs several copies of a function, each copy has its own shared answers, so the real figure sits a little higher.
- New test: `tests/shared_reads_test.ts` (20 screens at once cost 1-2 reads; own bet and emojis show straight away).

## 18. What changed in 6.17: fixes found by the stress tests (redeploy every function and publish; no entity, engine, points or package changes)
Two stress rigs ran the real server code with 5 to 50 simulated members (watching, betting, emojis, chat, balance) on the Live Arena and on a running tournament, spread over 1 or 3 running copies of the functions, against a Base44-style database limit (assumed 500 calls a minute, and no more than a quarter of that in any 10 seconds; 6.15 fails from 5 members under it, as the live site did). Found and fixed:
- **Lock storms at every round or match change.** Every screen noticed "betting closed" / "next fight" in the same second and tried the lock (4-5 database calls each). Now one running copy makes a single attempt (Live Arena, tournament clock, Roulette, Wheel), and "another copy is on it" is remembered for a moment instead of being retried on every poll.
- **Two copies could both give up.** When two requests reached the lock together with "don't queue", both could see the other one still choosing its turn and both give up, so nobody moved the tournament on and every screen kept trying. They now wait up to 0.6 s for that to settle (`withRecordLock`, waitMs 0).
- **A crash risk in 6.16.** A refused settings read with only one request waiting was left unhandled, which can stop that running copy. Fixed, with a test.
- **The tournament is looked up with one query** (`status $in [...]`, falling back to three if the data store refuses `$in`), and the shared look at it lasts up to 10 s but is dropped the moment one of its times passes (a match opening, betting closing, a fight ending). The Live Arena table works the same way. Bets reuse the shared look when it already shows the match open.
- **Screens spread out**: each screen waits its own extra 0.25-1.1 s after a round or match change.
- **Crowd**: shared 8 s; screens say "I'm watching" every 45 s and count as watching for 90 s.
- Tournament, 20 members watching and betting: 6.15 about 5,300 database calls a minute (fails at once); 6.17 about 200 (one copy) to 450 (three copies).

## 19. What changed in 6.18: the Guild Leader's balance changes (engine 9; redeploy every function and publish)
- Base fighter: HP 50,000 (was 40,000), ATK 17,500 (15,000), DEF 9,000 (6,000), Accuracy 100% (80%), HP potions 7 (5), Potion heal 100% (80%).
- Each upgrade: HP +8,500 (7,000), ATK +1,150 (950), Accuracy +10% (5%), Evasion +5% (8%), Crit rate +3.5% (1.5%), Crit defense +3.5% (3%).
- Potion heal is no longer an upgrade (every potion heals 100%); its share of rolls goes to the other stats.
- Roll chances: Crit rate 1 in 15, Crit defense 1 in 9 (was 1 in 5), the other seven about 1 in 8.5 each.
- Potions are drunk at 85% HP or less (was 70%). A critical does 2× to 8× (was 3× to 7×).
- Weapon: 35% success per try (was 20%); a try now asks first ("35% chance of success"). Tournaments opened earlier keep the rate saved on them.
- Mount: pair 2 is ATK + Accuracy (was ATK + HP); new pair 7, ATK + Crit rate. Pairs 4 to 7 come up 1 in 12 each, pairs 1 to 3 2 in 9 each. Accuracy and Crit rate from a mount are flat points. A fighter who already drew pair 2 now gets ATK + Accuracy.
- Replays from before (engine 8) are not offered (they would play differently).
- Measured on 400 Live Arena and 400 tournament fights: fights are about twice as fast (Live Arena median 17 s → 9 s; tournament 12 s → 7 s), mostly from Accuracy 100% (+10 per upgrade): hits land 90-97% of the time instead of about 70%. Prices still come from practice fights of the real fighters, so the house edge is unchanged (about 82% paid back on all bets, as before).
- Bet prices a little better for players: the house edge on fighter bets is 8% on the favourite and 12% on the other (was 10% / 15%), 12% on side bets (was 15%). Caps unchanged (fighters at most 4×, side bets 3×). Measured: about 85% of all stakes paid back (was about 82%).

## 20. What changed in 6.19 (engine 10; redeploy every function and publish)
- Base ATK 15,500 (was 17,500), ATK +650 per upgrade (was +1,150), base DEF 7,000 (was 9,000), base Crit rate 5% (was 15%).
- Criticals do 2× to 6× (was 2× to 8×).
- Crit defense works differently: it no longer lowers the attacker's crit chance; each % takes 1% off the damage of criticals taken (up to 80%). +8% per upgrade (was +3.5). Nirvana Soul Blast's +20% and a mount's Crit defense work the same way.
- Unchanged by request: HP and potions (heal 100%, 7 potions, +2 per upgrade), Accuracy 100%.
- Final 6.19 values (Guild Leader): base Crit rate 10%, base Crit defense 4%, Crit defense +10% per upgrade.
- Bet prices better again: house edge 6% on the favourite, 10% on the other fighter and on side bets (6.18: 8% / 12% / 12%). Measured: about 86% of all stakes paid back. Caps unchanged (4× fighters, 3× side bets).
- Measured on 400 fights each: Live Arena typical fight about 35 s (6.18: 8 s), tournament about 15 s (6.18: 6.5 s); no draws.

## 21. What changed in 6.20 (engine 11; redeploy every function and publish)
- Accuracy +5% per upgrade (was +10%).
- Base Crit defense 10% (was 4%); still +10% per upgrade, up to 80%.
- Criticals do 2× to 10× (was 2× to 6×): 2× to 7× come up 15% each, 8× 5%, 9× 3%, 10× 2%.
- Side bets: offered when they come up 25% to 75% of the time (was 30-70%), up to 3.5× (was 3×), house edge 7% (was 10%). The fight-length line is now priced from the real fight length it is settled on (before, "over" was slightly under-counted, so it paid more than the other lines).
- Fighter bets: house edge 5% on the favourite, 8% on the other (6.19: 6% / 10%). Caps unchanged (4×).
- Measured on 1,600 fights (two runs): about 88.5-89% of all stakes paid back (6.19: 86%), every bet type under 100%. Live Arena average fight about 37 s, tournament about 21-25 s; no draws.

## 22. What changed in 6.22 (engine 12; new entities Grudge and BracketPick; redeploy every function and publish)
- **Join and random stats are separate.** Joining (500 by default) gives the fighter; random stats are "500 points for a random stat", bought in packs of 1, 5 or 10. The Guild Leader prices "Join the tournament" and "Random stat (each)" separately. A tournament made before 6.22 uses its old entry price for both. Screens from before 6.22 that still send "entry" join first and then buy one random stat.
- **HP potions +1 per upgrade** (was +2).
- **Seeded double elimination.** At the start, practice fights between the real builds rank the field. The bracket uses standard seeding, so 1 and 2 can only meet in the grand final, and the top seeds get the byes. A first loss drops you to the losers' bracket; a second loss and you're out. If the losers' champion wins the grand final, a reset decides it; otherwise the reset is skipped. Three winners only: grand final winner and loser, then the losers' final loser (4th place removed; a tournament can have up to 3 prizes).
- **Bracket prediction.** After the draw there's a prediction window: `predict_minutes`, default 10, 0 to 60, where 0 means none. Members predict every match for free. A perfect bracket wins every code in the GP code pot. The Guild Leader fills the pot on the Tournament tab; codes are reserved with raffle_id `bracket-pot`. Nobody perfect: the pot rolls over. Several perfect: one is drawn at random; the draw is seeded by the tournament, so a retry picks the same winner.
- **Grudge matches** (Grudge tab):
  - A member challenges another for an equal stake (100 to 50,000) with 10, 25 or 50 random stats.
  - Both fighters get equal random builds: same stats count, weapon, pet, mount level and number of skills.
  - Once accepted, everyone can bet for 60 seconds. The fight then runs from a secret seed. The winner takes both stakes less 5%, and the 5% goes to the Arena bank.
  - A challenge left unanswered for 24 hours expires and the stake comes back; a declined or withdrawn challenge also refunds the stake.
  - The Tournament Clock moves grudge matches on too.
  - Grudge bets are tournament-scope bets with tour_id `grudge:<id>`, so they are settled the same way.
- **Hall of Fame and titles** (Hall of Fame tab): champions, leaders and records, worked out from finished tournaments and grudges. Titles: Reigning Champion, N× Champion, Champion. A title shows over the fighter in tournaments and grudges, and on the seeds and fighters lists.
- **Replays on Discord.** Every tournament match and grudge result posts a card with a "watch" link (`/arena?tab=tournament&tour=…&match=…`, `/arena?tab=grudge&grudge=…`) to `DISCORD_REPLAY_WEBHOOK_URL`, or to the announcements webhook if that secret isn't set. For the final, the Guild Leader opens it under the results and presses **Send the final to Discord**: the browser records it and posts the video (up to 9.5 MB).

## 23. What changed in 6.23: a tournament with 30+ members stays light (redeploy every function and publish; no entity, engine, points rules or package changes)
A stress rig ran the real server code with 30 members going through a whole tournament (sign-up and shopping, the prediction window, the matches with bets and emojis) and 6 more on the Grudge tab, over 1 or 3 running copies of the functions. On 6.22, the prediction window and the Hall of Fame titles roughly doubled the database work of a tournament.
- **Predictions:** one shared read of every prediction (it was one read per screen, every 4 s). During the prediction window, every look no longer re-reads the tournament (the "predict" state was missing from a list).
- **A member's change clears only what it changed.** A purchase clears only the fighters list; a prediction only the predictions; a grudge challenge only the grudge list. Before, any of these made every screen re-read everything, the Hall of Fame included. The Guild Leader's changes still clear everything.
- **The crowd comes with the screen's own poll.** The Live Arena and the tournament screens get the watching count and the emojis with their state, so the separate crowd poll is gone.
- **Grudge tab:** the bet board comes with the grudge list (the separate 3-second board poll is gone). The list is read with two queries instead of three and shared for up to 20 s, but read again the moment betting closes, a fight ends or a challenge expires.
- **Purchases and bets:** fewer database calls each.
  - The shared look at the tournament replaces two of a purchase's three reads; the check after saving still guards against the tournament starting mid-purchase.
  - The member row read inside the lock is reused for the points change, and a bet's daily total is saved in the same write.
  - A purchase now costs 11 calls instead of 13, and a bet 10 instead of 14. Banned members are still refused, checked on the fresh row.
- **Collecting winnings with nothing to collect takes no lock.** Each collect pays at most one other member's bet (was 3); the Tournament Clock pays the rest.
- **Polls:** the tournament screen asks at least every 10 s during matches (was 6 s; the exact times still matter) and every 15 s during sign-up (was 10 s). Fighter counts are saved at most every 20 s. Sessions are remembered for 10 minutes and member rows for polls for 5 minutes.
- **Retries:** a bet, purchase or prediction that meets "server busy" is tried once more after about a second.
- **Measured** (database calls a minute, 30 members + 6 on the Grudge tab, 3 running copies):

  | Phase | 6.22 | 6.23 |
  |---|---|---|
  | Sign-up with heavy shopping (about 40 purchases a minute) | about 1,300 | about 710 |
  | Prediction window | about 1,270 | about 340 |
  | Matches | about 1,000 | about 420 |

  Against a Base44-style limit of 500 calls a minute, the failed share of all requests fell from 51% to about 3-4%. What still runs into it is everyone shopping hard at the same moment: each purchase is about 11 database calls, most of them the lock that keeps points safe.
- New test: `tests/t623_test.ts`.

## 24. What changed in 6.24: the site and the games open faster (redeploy every function and publish; no entity, engine, points or package changes)
Measured on a phone-like connection (5 Mbit/s, 120 ms, a 4× slower processor) against the real functions:
- **The page no longer waits for Google before showing anything.** The Google fonts (Zen Kaku Gothic New, plus Cinzel and Barlow for the Arena) came in through `@import` in the stylesheets, so the whole site, and later the Arena, waited for Google's answer before drawing. Where Google couldn't be reached, the Arena didn't open at all ("Unable to preload CSS"). They now load from `index.html` without holding anything up, and the text shows at once in a fallback font. First paint: about 0.85 s → 0.57 s.
- **Smaller first download.** The guild hall and the Games page (with all eight games) still come with the site. Poker, Pusoy, Derby, Arena, Shop, Rankings, Profile, Guide and the Admin hall are now downloaded when first needed, which cuts about 20% of the JavaScript on a first visit.
- **Next pages fetched ahead** (`src/lib/routes.js`):
  - Poker and Pusoy come down a few seconds after the site opens.
  - Derby and Arena come down from the Games page (skipped on a data-saver or 2G connection).
  - Any page starts downloading as soon as a finger or pointer lands on a link to it.
  - Opening the Arena from the Games page went from about 1.2-3.5 s to about 0.7-1.0 s.
- **The account is asked for as soon as the site's code arrives**, alongside React starting up, rather than after the first screen is drawn. That is about 0.3-0.4 s sooner on a slow phone.
- **After a new publish,** a tab still running the old site reloads itself once when it can't find a page's code (instead of getting stuck).
