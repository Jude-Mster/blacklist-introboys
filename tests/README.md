# Tests

These run the real backend functions on an in-memory stand-in for Base44 (`fake/sdk.ts`), with test
members only. Nothing touches the live site or real data. They are not deployed (only `base44/` is).

## Run everything

```
npm run test:formulas     # node: Arena formulas and every game's pay-back, recomputed independently
npm run test:backend      # deno: points, bets, payouts, double clicks, tournaments, brackets, access
```

`test:backend` needs [Deno](https://deno.com) installed.

## What each file checks

| File | Checks |
|---|---|
| formulas.test.mjs | Both fighters attacking at once and Speed setting how often, the 50-upgrade cap, the 20% weapon default, tournament overtime (start, damage, no potions, always a winner), fighter stats, damage, shield, crit x3-x7 once, HP after hits, KO at exactly 0, potion heal, HP/MP bars in range, MP never refills, hit and crit rates, speed pace, odds re-counted from the 2,000 practice fights, the house margin, payouts (stake x price rounded down, half back on a Draw) |
| returns.test.mjs | What every game pays back over time: below 100% everywhere; coin toss 97%, slots 96.99% |
| money_test.ts | Every points path: daily wheel, officer awards (daily cap, even with awards sent at once), instant games and the daily bet cap, roulette, sic bo, wheel, derby, Live Arena, tournament (buy, re-roll, start, prizes, bank), duels, shop, blackjack. Bad amounts (negative, 0, 1.5, huge, text) refused. Double clicks charge once and pay once. After each: every member's points = starting points + their PointLog, none below 0 |
| money2_test.ts | Poker and Pusoy (no points created; Pusoy keeps only its 2% cut), tournament started or cancelled while members are buying, banned members, expired sign-ins |
| audit_bracket.ts | Brackets of 2 to 12 fighters: everyone plays, the right number of matches, 1st/2nd/3rd go to the right members, prizes add up |
| audit_watch.ts | The "watching" count: one per member, drops after they leave |
| arena_test.ts, extra_test.ts, tour_test.ts, cost_test.ts, tour_repeat_test.ts | The Arena and tournament flows end to end |
| shop_codes_test.ts | GP codes in the shop (from stock and typed by the leader), and the rankings hiding members without the Discord role |