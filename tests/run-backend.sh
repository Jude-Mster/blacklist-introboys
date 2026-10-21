#!/bin/sh
# Runs every backend test file with Deno. Exits non-zero if any fails.
cd "$(dirname "$0")" || exit 1
fail=0
for f in money_test.ts money2_test.ts audit_bracket.ts audit_watch.ts arena_test.ts extra_test.ts tour_test.ts cost_test.ts tour_repeat_test.ts shop_codes_test.ts bot_license_test.ts tour_cap_test.ts account_test.ts shared_reads_test.ts t622_test.ts t623_test.ts buysell_test.ts buysell_load_test.ts war_test.ts war2_test.ts; do
  if deno run -A --import-map=import_map.json "$f" > ".$f.log" 2>&1; then echo "ok   $f"; else echo "FAIL $f (see tests/.$f.log)"; grep -E "^FAIL" ".$f.log"; fail=1; fi
done
exit $fail