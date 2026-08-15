#!/usr/bin/env bash
# preflight.sh — run before every Chrome Web Store release.
#
#   ./scripts/preflight.sh
#
# Exits non-zero if anything would ship dev config to production.
# Every check is mechanical; the human-judgement steps live in RELEASE_CHECKLIST.md.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

EXT="localbridge/extension"
fails=0
warns=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; fails=$((fails + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; warns=$((warns + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

section "1. Environment config"

# Evaluate config.js exactly as the extension does, so a half-commented
# swap (two active blocks) is caught rather than guessed at from grep.
#
# eval is deliberate and safe here: config.js is JavaScript, not JSON, so
# JSON.parse cannot read it, and the input is a first-party file from this
# repo — the same file we are about to ship. Anyone who can edit it can
# already ship arbitrary code in the extension itself.
env_json=$(node -e "
  const src = require('fs').readFileSync('$EXT/config.js','utf8');
  eval(src);
  console.log(JSON.stringify(BRIDGE_ENV));
" 2>/dev/null)

if [ -z "$env_json" ]; then
  fail "config.js did not evaluate — BRIDGE_ENV is undefined or the file has a syntax error"
else
  decls=$(grep -cE '^\s*var BRIDGE_ENV' "$EXT/config.js")
  [ "$decls" -eq 1 ] && pass "exactly one active BRIDGE_ENV block" \
                     || fail "$decls active BRIDGE_ENV blocks — the last one silently wins; comment out all but one"

  name=$(node -e "console.log(JSON.parse(process.argv[1]).name)" "$env_json")
  url=$(node  -e "console.log(JSON.parse(process.argv[1]).bridgeWsUrl)" "$env_json")
  debug=$(node -e "console.log(JSON.parse(process.argv[1]).debug)" "$env_json")
  pats=$(node -e "console.log(JSON.parse(process.argv[1]).appPatterns.join(' '))" "$env_json")

  [ "$name" = "production" ] && pass "active env is production" \
                             || fail "active env is '$name' — uncomment the PRODUCTION block in config.js"

  case "$url" in
    wss://*) pass "bridge URL is secure: $url" ;;
    *)       fail "bridge URL is not wss://: $url" ;;
  esac

  case "$url" in
    *localhost*|*127.0.0.1*) fail "bridge URL points at localhost: $url" ;;
    *)                       pass "bridge URL is not localhost" ;;
  esac

  [ "$debug" = "false" ] && pass "debug logging off (request URLs/bodies stay out of the console)" \
                         || fail "debug is '$debug' — production must not log user request data"

  case "$pats" in
    *localhost*|*127.0.0.1*) fail "appPatterns still contain localhost: $pats" ;;
    *)                       pass "appPatterns are production-only" ;;
  esac

  app=$(node -e "console.log(JSON.parse(process.argv[1]).appUrl || '')" "$env_json")
  case "$app" in
    https://*) pass "popup app link points at $app" ;;
    "")        fail "appUrl is missing from the active env — popup links would be empty" ;;
    *)         fail "appUrl is not https://: $app" ;;
  esac
fi

# Links must come from BRIDGE_ENV, or dev builds send you to production.
if grep -qE 'href="https?://' "$EXT/popup.html"; then
  fail "hardcoded http(s) link in popup.html — set href from BRIDGE_ENV.appUrl instead"
else
  pass "popup.html has no hardcoded app links"
fi

section "2. Manifest"

if ! node -e "JSON.parse(require('fs').readFileSync('$EXT/manifest.json','utf8'))" 2>/dev/null; then
  fail "manifest.json is not valid JSON"
else
  pass "manifest.json parses"

  version=$(node -e "console.log(require('./$EXT/manifest.json').version)")
  printf '    version: %s\n' "$version"

  # Every file the manifest names must exist, or Chrome rejects the upload.
  missing=$(node -e "
    const fs = require('fs'), m = require('./$EXT/manifest.json');
    const files = [
      m.background?.service_worker,
      m.action?.default_popup,
      ...Object.values(m.icons || {}),
      ...Object.values(m.action?.default_icon || {}),
      ...(m.content_scripts || []).flatMap(c => c.js || []),
    ].filter(Boolean);
    console.log([...new Set(files)].filter(f => !fs.existsSync('$EXT/' + f)).join(' '));
  ")
  [ -z "$missing" ] && pass "all manifest-referenced files exist" \
                    || fail "manifest references missing files: $missing"

  # config.js must load before content.js, or BRIDGE_ENV is undefined in the page world.
  first_cs=$(node -e "console.log((require('./$EXT/manifest.json').content_scripts?.[0]?.js || [])[0] || '')")
  [ "$first_cs" = "config.js" ] && pass "config.js loads first in content_scripts" \
                                || fail "content_scripts[0].js starts with '$first_cs', expected config.js"

  if git rev-parse --git-dir >/dev/null 2>&1; then
    prev=$(git show HEAD:"$EXT/manifest.json" 2>/dev/null | node -e "
      let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).version)}catch{console.log('')}})
    ")
    if [ -n "$prev" ] && [ "$prev" = "$version" ]; then
      warn "version unchanged since last commit ($version) — bump it if this is a new release"
    elif [ -n "$prev" ]; then
      pass "version bumped: $prev → $version"
    fi
  fi
fi

section "3. Source integrity"

for f in "$EXT"/*.js; do
  node --check "$f" 2>/dev/null && pass "syntax ok: $(basename "$f")" || fail "syntax error: $f"
done

# The localhost-only guard is the extension's core safety property.
grep -q "parsed.hostname === 'localhost'" "$EXT/background.js" \
  && pass "localhost-only request guard present" \
  || fail "localhost-only guard missing or altered in background.js"

# innerHTML with server-supplied log data was a past XSS; keep it out.
# Match assignments only — prose mentioning innerHTML in a comment is fine.
if grep -lE '\.innerHTML\s*=' "$EXT"/*.js >/dev/null 2>&1; then
  fail "innerHTML assignment in: $(grep -lE '\.innerHTML\s*=' "$EXT"/*.js | tr '\n' ' ') — build DOM nodes instead"
else
  pass "no innerHTML assignments in extension JS"
fi

section "4. Repository hygiene"

junk=$(find . -name '*.zip' -o -name '.DS_Store' -o -name 'node_modules' -o -name '.venv' \
       | grep -v '^./.git/' | head -10)
[ -z "$junk" ] && pass "no zips, .DS_Store, node_modules or .venv in tree" \
               || warn "stray files present (not shipped, but clean them up):
$(echo "$junk" | sed 's/^/      /')"

if git rev-parse --git-dir >/dev/null 2>&1; then
  if [ -z "$(git status --porcelain)" ]; then
    pass "working tree clean"
  else
    warn "uncommitted changes — commit before tagging the release:
$(git status --porcelain | sed 's/^/      /')"
  fi
fi

section "Result"
if [ "$fails" -gt 0 ]; then
  printf '  \033[31m%d blocking issue(s), %d warning(s) — DO NOT RELEASE\033[0m\n\n' "$fails" "$warns"
  exit 1
fi
printf '  \033[32mAll automated checks passed\033[0m (%d warning(s))\n' "$warns"
printf '  Now do the manual steps in RELEASE_CHECKLIST.md — they cannot be automated.\n\n'
