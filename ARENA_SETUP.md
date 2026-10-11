# Blacklist Arena: setup after publishing (version 6.5)

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

## 3. Fights and odds (engine version 3)
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