// config.js - build-time environment switch for the Hit-It Bridge extension.
//
// Loaded before every other script (service worker via importScripts, content
// script via manifest order), so DEV_MODE and BRIDGE_ENV are globals everywhere.
//
// ⚠️ Set DEV_MODE = false before zipping a build for the Chrome Web Store.

var DEV_MODE = true;

var BRIDGE_ENVS = {
  development: {
    name: 'development',
    bridgeWsUrl: 'ws://localhost:8080/bridge',
    // Tabs the service worker asks for a token after a restart.
    appPatterns: [
      'http://localhost/*',
      'http://127.0.0.1/*',
      'http://localhost:5173/*',
      'https://hit-it.co.in/*',
      '*://*.hit-it.co.in/*',
    ],
    debug: true,
  },

  production: {
    name: 'production',
    bridgeWsUrl: 'wss://api.hit-it.co.in/bridge',
    appPatterns: [
      'https://hit-it.co.in/*',
      '*://*.hit-it.co.in/*',
    ],
    // Request URLs and bodies are user data — never log them in production.
    debug: false,
  },
};

var BRIDGE_ENV = DEV_MODE ? BRIDGE_ENVS.development : BRIDGE_ENVS.production;
