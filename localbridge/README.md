# Hit-It Bridge (Chrome Extension)

Routes requests from the deployed Hit-It backend to APIs running on **your own machine**, via a browser extension that holds the only connection with localhost access.

```
Hit-It Backend (deployed)
    │
    │  POST /request  {"method":"GET","url":"http://localhost:3000/api/..."}
    ▼
Bridge Server (WebSocket, deployed alongside the backend)
    │
    │  WebSocket  { type: "REQUEST", requestId: "uuid-..." }
    ▼
Hit-It Bridge Extension (Chrome, on the developer's machine)  ← this repo
    │
    │  fetch("http://localhost:3000/api/...")
    ▼
Your local API  (any port — the backend picks the target URL)

    Response flows back up the same chain, keyed by requestId.
```

This repo contains **only the extension**. The bridge server and Go SDK live elsewhere.

---

## Files

```
extension/
├── manifest.json       ← MV3 manifest
├── config.js           ← dev/prod environment config (comment-swapped)
├── background.js       ← Service worker: WS client + fetch executor
├── content.js          ← Reads the JWT from the app page's localStorage
├── popup.html/.js      ← Status + request log UI
├── icon16/48/128.png
└── PRIVACY_POLICY.md
```

---

## Environments

`config.js` holds two `BRIDGE_ENV` blocks. The development one is active; the
production one is commented out. To switch, comment one and uncomment the other —
exactly one must be active.

| | `development` | `production` |
|---|---|---|
| Bridge WS URL | `ws://localhost:8080/bridge` | `wss://api.hit-it.co.in/bridge` |
| App tab patterns | `localhost:5174` + `hit-it.co.in` | `hit-it.co.in` only |
| Verbose logging | on | off |

`config.js` is loaded first in both worlds — via `importScripts` in the service worker, and as the first entry in `content_scripts.js` — so `BRIDGE_ENV` is available everywhere.

Note that `host_permissions` and `content_scripts` in `manifest.json` are **not**
covered by this switch — manifest is static JSON and cannot read `BRIDGE_ENV`.
A production build still requests localhost permission and still injects
`content.js` on `localhost:5174`. See "Manifest is not environment-aware" below.

Verbose logging prints request URLs, headers, and bodies, which are user data. That is why `debug` is off in production; only errors log there.

---

### Manifest is not environment-aware

`manifest.json` is static JSON — Chrome reads it before any script runs, so it
cannot branch on `BRIDGE_ENV`. Its `host_permissions` and `content_scripts` are
therefore the same in every build:

- The install prompt always says *"Read and change your data on localhost"*.
  That is inherent to the product — fetching localhost is what the extension is for.
- `content.js` runs on any `localhost:5174` page a user has open, not only yours.
  It reads `localStorage.auth_token`, a key only the Hit-It app sets, so an
  unrelated dev server on that port yields nothing.

Neither blocks a release. `BRIDGE_ENV.appPatterns` is the part that *is*
switchable, and it narrows to `hit-it.co.in` in production.

---

## Local development

1. Run the bridge server so `ws://localhost:8080/bridge` is reachable. This is the
   bridge's own port — your local API can be on any port, since the backend sends
   the full target URL with each request.
2. Confirm the DEVELOPMENT block is the active one in `config.js`.
3. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`.
4. Open the Hit-It app at `http://localhost:5174` and log in. The content script picks up the JWT from `localStorage.auth_token` and the extension connects on its own — the popup pill turns green.

The service worker's console (`chrome://extensions` → **service worker**) shows the full request log.

---

## Authentication

There is no manual configuration. The extension authenticates as the logged-in user:

1. `content.js` reads `auth_token` from the app page's `localStorage`.
2. `background.js` sends it as an `AUTH` frame after the socket opens.
3. The bridge server validates it against the backend's `/me` endpoint.
4. On `AUTH_OK` the token is cached in `chrome.storage.local` so the connection survives service-worker restarts.

A `4001` close code or an `AUTH_ERROR` frame clears the cached token and stops reconnect attempts.

---

## Releasing

1. In `config.js`, comment out the DEVELOPMENT block and uncomment the PRODUCTION one.
2. Bump `version` in `manifest.json`.
3. Zip the **contents** of `extension/` (not the folder itself) and upload to the Chrome Web Store.

Store listing assets (promo tiles, marquee, screenshots) are in the repo root.

---

## Security notes

- The extension **hard-blocks** any non-localhost target URL, in both environments — it cannot proxy requests to external services.
- The JWT is sent inside the WebSocket payload, never in the URL, so it stays out of server and proxy logs.
- Nothing is persisted beyond the cached JWT and the last 50 request log entries in `chrome.storage.local`.
