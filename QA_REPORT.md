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
| F2 | Decision needed | awardPoints | An officer awards points to their own Discord ID | ? | Allowed (within the daily cap) | No rule against it | **Waiting on the Guild Leader** |
| F3 | Low | Arena bets, shop quantity, officer awards, tournament entries, Derby bets | Send an amount of 1.5, or "buy 0 entries" | Refused | 1.5 rounded down to 1; "0 entries" bought 1 entry and charged for it | Amounts were rounded down before being checked; a missing count defaulted to 1 even when 0 was sent | **Fixed**: whole numbers only; 0 refused. The site's own buttons never send these, so members were not affected |
| F4 | Low | chatSend, delete | An officer deletes a message id that doesn't exist | "Message not found" (404) | Server error (500) | The lookup's error wasn't caught | **Fixed** (404) |

Not failures, but noted (by design in the code; tell me if any should change):

| ID | Where | Note |
|---|---|---|
| N1 | Derby | Horses with under 1% chance are still offered at the top 8× price, so those bets return about 3-5% (contenders return 68-78%). The Arena hides bets this unlikely. |
| N2 | Jade Roulette | Green pays back 56%, Dragon and Tiger 28% (red/black 96%). The code says this is the guild's choice. |
| N3 | Tournament | A match that ends on time with both fighters on exactly the same share of HP goes to fighter A. Very rare. |
| N4 | Rankings | The board lists members who lost their Discord role (it only hides banned members). |
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