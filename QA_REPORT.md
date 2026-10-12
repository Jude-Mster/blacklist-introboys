# QA and correctness audit, Blacklist Introboys site (6.8), 11 Oct 2026

Everything marked "executed" was run against the real backend functions on a local in-memory copy of the
database, with test members only (nothing on the live site or real data was touched), or in a real browser
(Chromium) against that copy. Anything only read is marked "code-reviewed, not executed".

## 1. Summary

| | Count |
|---|---|
| Backend actions called as nobody / member / banned / no-access / officer / leader | 110 actions × 6 = 660 calls |
| Automated checks (points, bets, payouts, double clicks, tournaments, brackets, counters) | 411 |
| Number checks (Arena formulas recomputed independently, every game's pay-back) | 59 |
| Pages loaded in the browser (member, officer, leader; computer and phone) with safe buttons clicked | 36 page loads, about 300 clicks |
| **Failed** | 4 issues (1 critical, 1 decision needed, 2 low), all but the decision fixed and re-tested |
| Passed after fixes | every check above |
| Not verifiable here | see section 4 |

Rule checked after every test: **each member's points = starting points + the sum of their PointLog, and
nobody is below 0.** It held through every game, every double click and every race tested.

## 2. Failures

| ID | Severity | Where | Steps to reproduce | Expected | Actual | Root cause | Status |
|---|---|---|---|---|---|---|---|
| F1 | **Critical** (points created) | awardPoints; the Discord /award command | An officer with a 1,000 daily cap sends 6 awards of 400 at the same moment | At most 1,000 given; the rest refused | All 6 went through: 2,400 given | The cap was read, then the award made, with nothing stopping several requests reading the same "used" total at once | **Fixed**: the cap check and the award now run together under the officer's own award lock (site and Discord share it). Re-test: 6 × 400 at once gives 800 (2 accepted), the rest refused |
| F2 | Decision needed | awardPoints | An officer awards points to their own Discord ID | ? | Allowed (within the daily cap) | No rule against it | **Left as is** (the Guild Leader's decision) |
| F3 | Low | Arena bets, shop quantity, officer awards, tournament entries, Derby bets | Send an amount of 1.5, or "buy 0 entries" | Refused | 1.5 rounded down to 1; "0 entries" bought 1 entry and charged for it | Amounts were rounded down before being checked; a missing count defaulted to 1 even when 0 was sent | **Fixed**: whole numbers only; 0 refused. The site's own buttons never send these, so members were not affected |
| F4 | Low | chatSend, delete | An officer deletes a message id that doesn't exist | "Message not found" (404) | Server error (500) | The lookup's error wasn't caught | **Fixed** (404) |

Not failures, but noted (by design in the code; tell me if any should change):

| ID | Where | Note |
|---|---|---|
| N1 | Derby | Horses with under 1% chance are still offered at the top 8× price, so those bets return about 3-5% (contenders return 68-78%). The Arena hides bets this unlikely. Left as is (the Guild Leader's decision). |
| N2 | Jade Roulette | Green pays back 56%, Dragon and Tiger 28% (red/black 96%). The Guild Leader confirmed this is the guild's choice: kept. |
| N3 | Tournament | ~~A match that ends on time with both fighters on exactly the same share of HP goes to fighter A.~~ Changed in 6.9: such matches now go to overtime (see section 6). |
| N4 | Rankings | ~~The board lists members who lost their Discord role.~~ Changed in 6.9: they are hidden (site, Discord /leaderboard, posted rankings). |
| N5 | Pusoy | Keeps a 2% house cut of each pot (by design). Tested: nothing else is lost or created. |
| N6 | Roulette, sic bo, wheel, instant games, card tables | Amounts like 100.5 are rounded down to 100 (charges less, never more). Left as is. |
| N7 | Blackjack / Lucky 9 | A bet of 0 means "take my bet off" (by design). |
| N8 | Roles | There is no "premium" role in the code; "[Premium]" was only a label (removed in 6.6). |
| N9 | Arena | Arena bets do count toward the daily bet cap (answered by the code). |
| N10 | Arena | About 1 Live Arena fight in 400 offers neither fighter: one never won any of the 2,000 practice fights, and the other would pay under 1.01×. Draw and side bets are still offered. Found when a test failed on such a fight; the test now allows for it. |

## 3. Number audit (executed, recomputed separately from the game's code)

| Number | Formula | Inputs | Expected | Actual | Result |
|---|---|---|---|---|---|
| Fighter stats | base + rolls × per-roll + pet (full × lv/8) + mount (lv × 3%) + weapon (+15% ATK, +5 crit a level) | 3,000 builds | 0 differences | 0 | Pass |
| Damage | round(max(ATK×0.2, ATK − DEF×0.5) × 0.46 × charge × crit); Spirits +15% ATK, Blood Lust +25% | 12,411 hits | all within rounding | 0 off | Pass |
| Shield | round(full × 0.5), at least 1 | every shielded hit | exact | exact | Pass |
| Crit multiplier | ×3 to ×7 whole, only on a crit, applied once | 12,411 hits | 0 wrong | 0 | Pass |
| HP after a hit | HP − damage, never below 0 | 12,411 hits | 0 wrong | 0 (0 below 0) | Pass |
| KO | exactly when HP reaches 0; nothing after | 1,500 fights | 0 wrong | 0 | Pass |
| Potion heal | min(max − HP, round(max × heal%)) | every potion | exact | exact | Pass |
| HP / MP bars | 0 ≤ value ≤ max in every frame; bar = value / max | 1,500 fights | 0 out of range | 0 | Pass |
| MP | only goes down | 1,500 fights | 0 rises | 0 | Pass |
| Hit chance | clamp(ACC − EVA (+25 Garuda), 25, 97)% | 19,572 swings | 63.57% | 63.41% | Pass (within 4 SE) |
| Crit chance | clamp(CRIT (+20 Blow) − CRIT DEF (+20 Nirvana), 1, 60)% | 12,411 hits | 16.56% | 16.65% | Pass |
| Speed pace | 100 / Speed, at least 0.55; Spirits +20% | 7,112 moves | 0 wrong | 0 | Pass |
| Fighter and Draw odds | floor2(min(cap, (1 − edge − 0.5 × P(draw)) / cautious P)); edges 10% / 15%; Draw 0.85 / cautious P, max 10×; none under 1.01 | 120 matchups re-counted from 2,000 practice fights | identical | identical | Pass |
| House margin on fighters | 1/price A + 1/price B > 1 | 90 matchups | > 1.00 | 1.175 average, 1.004 lowest | Pass |
| Payouts | floor(stake × price); fighter bets on a Draw get floor(stake/2); a loss 0 | 750 cases | identical | identical | Pass |
| Settlement | the points paid = the payout shown on the bet | Arena, tournament, roulette, derby | equal, once | equal, once | Pass |
| Tournament brackets | everyone plays; fighters − 1 matches (+1 third place from 4); 1st/2nd/3rd correct; prizes add up | 2-12 fighters | correct | correct | Pass |
| Watching count | one per member; gone after a minute away | 3 members, 4 tabs | 2 → 3 → 1 | 2 → 3 → 1 | Pass |
| Coin toss | ½ × round2(2 × (1 − 3%)) | exact | 97% | 97% | Pass |
| Lantern slots | sum(weight × multiplier) / total | exact | 97% | 96.99% | Pass |
| Twelve Skies Wheel | segments/12 × round2(0.97 × 12/segments) | exact | 97% | 97% each | Pass |
| Jade Roulette | winning pockets / 25 × return | exact | under 100% | red/black 96%, green 56%, dragon/tiger 28% | Pass (see N2) |
| Dragon Sic Bo | average over all 216 rolls | exact | under 100% | 87.5-97.2% | Pass |
| Blackjack side bets | every deal from an endless shoe | exact | about 94-95% (code comment) | Pairs 94.23%, 21+3 95.38% | Pass |
| Dragon's Fortune | the reel maths | exact | under 100% | 98.53% | Pass |
| Derby | 300 races priced as the site does | simulation | under 100% | win 40%, top 2 51%, top 3 53%, forecast 23% | Pass (see N1) |
| Arena pay-back by bet type | 2 × 600 fights | simulation | under 100% | 66-84% | Pass |
| Formatting | thousands separators (en-US); prices 2 decimals with × | code-reviewed, not executed | | | — |

## 4. Could not verify here

| What | Why |
|---|---|
| Discord sign-in, Discord slash commands, the chat bridge, Discord posts | Need Discord's servers and the app's secrets |
| Push notifications, dailyAccessRecheck, pushAlerts | Need the real Base44 sign-in and push services |
| Game guide pages | Load from wiki.wuxen2.com, which this test machine can't reach |
| Real Base44 database behaviour under load | Tests run on an in-memory copy; the locks and rules are the same code, but the live database's timing can't be reproduced exactly |
| Time zones on the Guide timers, formatting on every page | Code-reviewed, not executed |

## 5. Fixes, each re-tested

| Fix | Files | Re-test |
|---|---|---|
| F1 award cap race | base44/functions/awardPoints/entry.ts, base44/functions/discordInteractions/entry.ts | money_test "6 x 400 at once stays within the 1,000 daily cap": pass (800 given). Whole suite and ledger: pass |
| F3 decimals and "0 entries" | base44/shared/arenaBets.ts, base44/functions/shopAction, tournamentAction, derbyAction, awardPoints | money_test amount checks for arena, shop, award, tournament: pass; arena, tournament, derby, cost and repeat tests: pass |
| F4 chat delete | base44/functions/chatSend/entry.ts | gating test: officer and leader now get 404 |

Automated tests added in `tests/` (see tests/README.md): `npm run test:formulas` (Node) and `npm run test:backend` (Deno).

## 6. Version 6.9 additions (executed)

| Check | How | Result |
|---|---|---|
| Overtime starts at 180 s, never earlier, in every long tournament fight | 300 fights between very tanky fighters (227 reached overtime) | Pass |
| Overtime damage is ×(2 + 1 per 5 s of overtime) on every hit | 1,538 overtime hits recomputed | Pass |
| No potions in overtime | Found 4 potions drunk just after 180 s (queued by a hit just before); fixed, re-tested: 0 | Pass after fix |
| Overtime always ends with a winner, within 90 s | 300 fights; also 8,000 maximum-tank fights: longest overtime 63.8 s, never reached the 90 s fallback | Pass |
| Live Arena unchanged (Draw at the limit) and every earlier formula | the full formula suite | Pass |
| Rankings hide members without the Discord role, keep older member rows, show them again when the role returns | shop_codes_test | Pass |
| GP code from stock: shown to the buyer at once, charged exactly the price shown, in My orders and My prizes, nobody else (leader included) can load it | shop_codes_test, and in the browser (phone) | Pass |
| 6 buyers at once for the last 2 codes: 2 sold, no code given twice, nobody charged without a code | shop_codes_test | Pass |
| Codes added on the Prizes page restock the shop item; sold out and "only N left" refused; stale price refused | shop_codes_test | Pass |
| Leader types the code: wrong count, a code already used, the same code twice, a malformed code all refused; only the leader can do it; three clicks at once complete once; the buyer then sees the codes; stored encrypted; leader sees the last 4 | shop_codes_test, and in the browser (computer) | Pass |
| A waiting typed-code order rejects with a full refund; a code already handed over can't be refunded | shop_codes_test | Pass |
| Ledger (points = start + PointLog, never below 0) after every shop step | shop_codes_test | Pass |
| Every earlier backend test | npm run test:backend (10 files) | Pass |
| Overtime on the stage (banner, OT timer, log lines) on a computer and a phone | browser screenshots | Pass |
| Tournament scheduling with overtime | the next match is timed from each fight's real length, which includes overtime | Code-reviewed, not executed |

Not verifiable here: the Discord DM with the code (needs the bot) and the live Base44 database.

## 7. Version 6.10 additions (executed)

| Check | Result |
|---|---|
| Both fighters attack at once: both mid-attack 42% of the time; a 180% Speed fighter attacks 1.57x as often as a 100% one (rule says 1.64x; knock-backs account for the rest) | Pass |
| Every earlier formula (damage, crits, HP per instant when both blows land together, potions, MP, pace, overtime, prices) | Pass |
| Practice fights vs real fights: win rate 47.4% vs 47.5% and 46.9% vs 48.8%; length and potions match; every bet type pays back under 100% (fighters 72-74%, side bets 54-93%) over 2 x 1,400 real fights | Pass |
| Upgrade cap 50 (9 per stat); weapon default 20% | Pass |
| Bracket layout for 2 to 16 fighters: every match placed, no overlaps, every fighter in round 1 once | Pass |
| Browser: Re-roll gone from the stage; mount reset and re-roll ask first, Yes disabled until ticked, Cancel changes nothing, Yes does the change | Pass |
| Browser: bracket on a computer and a phone (no sideways page scroll); Watch; Download saved a 46 s WebM (VP9 + Opus) with its length written in | Pass |
| npm run test:backend (10 files) | Pass |

## 8. Version 6.11 additions (executed)

| Check | Result |
|---|---|
| Prices re-counted from 2,000 real practice fights for 120 matchups: identical; no fighter over 4x, no side bet over 3x or outside 30-70%, no buff lines, a length line, no Draw | Pass |
| Every offered fighter bet's expected return (P(win) x price + P(draw) x 0.5) under 1: average 0.836, highest 0.884 | Pass |
| Live Arena builds 1-51 entries; matched pairs always within 20% entries, 57 of 60 close fights (25-75%) over 1,000 re-check fights; about 90 ms to pick a pair | Pass |
| Real fights at real prices (2 x 1,400): Live Arena fighters 82.8-82.9%, side bets 70.3-92.2%, all 81.3-81.9%; both fighters offered 99-100% of Live Arena fights; top price 3.92x | Pass |
| npm run test:backend (10 files) x 4 runs; formulas; lint; build; bet slip in the browser (computer and phone) | Pass |

## 9. Version 6.12 additions (executed)

| Check | Result |
|---|---|
| Live Arena fight clock under slow, uneven replies (0.1-1.5 s each), in a real browser: frame steps more than 0.25 s off real time | 6.11: 17 of 288 (9 backward); 6.12: 4 of 294 (0 backward) |
| Audio players after opening the Live Arena 6 times | 6.11: 6; 6.12: 1, running |
| "Tap to hear the fight" shows before the first tap and goes after it | Pass |
| Result to next betting window | about 6-8 s (was 15 s plus) |
| Default betting time 15 s; npm run test:backend x 3; formulas; lint; build | Pass |

## 10. Version 6.13 additions (executed)

| Check | Result |
|---|---|
| Limit 1.5 refused; 2,000 limit: 1,500 spent, a 1,000 buy refused with "500 left" and nothing charged, a 500 buy fits exactly, then everything refused; re-roll still works | Pass |
| 4 buys at once with room for one: 1 accepted | Pass |
| Leader raises, lowers (nothing taken back), removes the limit; a member can't change it | Pass |
| Ledger holds; npm run test:backend (11 files); formulas; lint; build | Pass |
| Browser: leader field, member "total spent X of Y", greyed-out buttons | Pass |