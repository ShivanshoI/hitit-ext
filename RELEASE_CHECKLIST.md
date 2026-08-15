# Release Checklist

Run before **every** Chrome Web Store submission. The goal is one thing above all:
**never ship development config to production users.**

```bash
./scripts/preflight.sh
```

Exit code 0 means the mechanical checks passed. It does **not** mean you are done —
finish the manual steps below.

---

## Automated (`scripts/preflight.sh`)

The script blocks the release if any of these fail:

**Environment**
- Exactly one active `BRIDGE_ENV` block (a half-finished comment swap leaves two, and the last one silently wins)
- Active env is `production`
- Bridge URL is `wss://`, not `ws://`, and not localhost
- `debug` is `false` — production must never log request URLs, headers, or bodies
- `appPatterns` contain no localhost entries

**Manifest**
- Valid JSON
- Every referenced file exists (missing files get the upload rejected)
- `config.js` is first in `content_scripts.js` — if it isn't, `BRIDGE_ENV` is undefined in the content script and the extension throws on every page
- Version differs from the last commit (warning only)

**Source**
- All JS parses
- The localhost-only request guard in `background.js` is intact — this is the extension's core safety property
- No `innerHTML` assignments (past XSS; log rows carry server-controlled strings)

**Hygiene**
- No zips, `.DS_Store`, `node_modules`, or `.venv` in the tree
- Working tree clean

---

## Manual

Things a script cannot judge:

- [ ] **Bump `version` in `manifest.json`.** The Web Store rejects a re-upload of an existing version.
- [ ] **Load the built folder unpacked and confirm it connects.** Use *Chrome for Testing* or *Chromium* — branded Chrome refuses `--load-extension` outright, and since M137 the flag is ignored even with feature overrides. Load unpacked via `chrome://extensions` in your normal Chrome instead.
- [ ] **Confirm the production bridge accepts the extension's Origin.** Chrome sends `Origin: chrome-extension://<id>` on the WebSocket handshake. If the server's upgrader does not allow that origin it returns **403** and the extension retries forever without ever authenticating. The published extension ID is stable — make sure it is on the server's allowlist. See "Origin allowlist" below.
- [ ] **Open the popup with real traffic in the log** and confirm rows render, since log rendering is the one place server-supplied strings reach the DOM.
- [ ] **Check the store listing assets** still match the UI if the popup changed (`promo_*`, `screenshot_*` in the repo root).
- [ ] **Re-read `PRIVACY_POLICY.md`** if data handling changed at all. The listing links to it.
- [ ] Zip the **contents** of `localbridge/extension/`, not the folder itself.
- [ ] Tag the release: `git tag v<version> && git push --tags`
- [ ] **Revert `config.js` to development** after building, so the next `git pull` does not start you in production config.

---

## Origin allowlist

The extension authenticates over a WebSocket. Chrome always attaches an `Origin`
header of `chrome-extension://<extension-id>`. A server that rejects unknown
origins will 403 the upgrade *before* any auth frame is sent — the symptom is a
popup stuck on "offline" with `Unexpected response code: 403` in the service
worker console, retrying every few seconds.

Each unpacked build gets a different ID (derived from its path), so a dev machine
and the published extension have different origins. Both need allowlisting on
their respective bridge servers.

---

## If a bad build ships

The Web Store has no rollback. Recovery is: fix, bump the version, resubmit, and
wait out review. That asymmetry is why `preflight.sh` blocks rather than warns.
