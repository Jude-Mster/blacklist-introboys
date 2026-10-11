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