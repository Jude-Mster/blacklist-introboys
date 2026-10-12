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