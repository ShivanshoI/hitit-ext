// config.js - environment config for the Hit-It Bridge extension.
//
// Loaded before every other script (service worker via importScripts, content
// script via manifest order), so BRIDGE_ENV is a global everywhere.
//
// ⚠️ To ship a Web Store build: comment out the DEVELOPMENT block below and
//    uncomment the PRODUCTION block. Exactly one must be active.

// ─── DEVELOPMENT ──────────────────────────────────────────────────────────────
var BRIDGE_ENV = {
  name: 'development',
  bridgeWsUrl: 'ws://localhost:8080/bridge',
  // Where the popup's "Open Hit-It" / "Log in again" links point.
  appUrl: 'http://localhost:5174',
  // Tabs the service worker asks for a token after a restart.
  appPatterns: [
    'http://localhost/*',
    'http://127.0.0.1/*',
    'http://localhost:5174/*',
    // Production app — commented out so dev never picks up a live-site token.
    // 'https://hit-it.co.in/*',
    // '*://*.hit-it.co.in/*',
  ],
  debug: true,
};

// ─── PRODUCTION ───────────────────────────────────────────────────────────────
// var BRIDGE_ENV = {
//   name: 'production',
//   bridgeWsUrl: 'wss://api.hit-it.co.in/bridge',
//   appUrl: 'https://hit-it.co.in',
//   appPatterns: [
//     'https://hit-it.co.in/*',
//     '*://*.hit-it.co.in/*',
//   ],
//   // Request URLs and bodies are user data — never log them in production.
//   debug: false,
// };
