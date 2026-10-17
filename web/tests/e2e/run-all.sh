#!/usr/bin/env bash
# Runs every browser test. Usage: BROWSER=chromium|firefox|webkit tests/e2e/run-all.sh   (from the repo root; needs `npm i playwright-core` + the browser installed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; STUB=$(mktemp -d)
cp -r "$ROOT/web/." "$STUB/"; cp "$ROOT/web/tests/e2e/supabase.stub.js" "$STUB/vendor/supabase.js"
sed -i 's#supabaseUrl: ""#supabaseUrl: "https://stub.supabase.co"#; s#supabaseAnonKey: ""#supabaseAnonKey: "sb_publishable_stub"#' "$STUB/config.js"
(cd "$ROOT/web" && python3 -m http.server 8771 >/dev/null 2>&1 &) ; (cd "$STUB" && python3 -m http.server 8772 >/dev/null 2>&1 &)
sleep 1; cd "$ROOT/web/tests/e2e"; rc=0
for t in local login phase2 phase3; do echo "== $t ($BROWSER)"; node "$t.e2e.mjs" || rc=1; done
exit $rc
