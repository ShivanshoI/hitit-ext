// background.js - Hit-It Bridge Service Worker
//
// ── What this does ───────────────────────────────────────────────────────────
// 1. Waits for the JWT from the content script (runs on your app's page)
// 2. Connects to the bridge server using that JWT as the auth token
// 3. Bridge server validates JWT with your Go /me endpoint
// 4. Executes localhost fetch() requests on behalf of the user
// 5. Returns responses back through the WebSocket
//
// ── User experience ──────────────────────────────────────────────────────────
// Install extension → open your app → it connects automatically. That's it.
// ─────────────────────────────────────────────────────────────────────────────

importScripts('config.js');

// Verbose request logging is development-only — see config.js.
// Errors always log, in both environments.
const dbg = {
  log:      BRIDGE_ENV.debug ? console.log.bind(console)      : () => {},
  group:    BRIDGE_ENV.debug ? console.group.bind(console)    : () => {},
  groupEnd: BRIDGE_ENV.debug ? console.groupEnd.bind(console) : () => {},
};

let ws           = null;
let currentToken = null;  // JWT from the frontend page
let status       = 'disconnected';
let requestLog   = [];

// Keep the service worker alive — Chrome kills idle SWs after ~30s
// which drops the WebSocket. Alarms wake the SW back up.
// Only active while the user is logged in.
function startKeepAlive() {
  chrome.alarms.get('keepAlive', (a) => {
    if (!a) chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
  });
}

function stopKeepAlive() {
  chrome.alarms.clear('keepAlive');
  chrome.alarms.clear('reconnect');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // If we should be connected but aren't, reconnect
    if (currentToken && (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
      connect();
    }
    // Ping to detect silent disconnects
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PING' }));
    }
  }
  if (alarm.name === 'reconnect') {
    if (currentToken) connect();
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────

function setStatus(s) {
  status = s;
  chrome.runtime.sendMessage({ type: 'STATUS', status }).catch(() => {});
}

// ─── Token management ─────────────────────────────────────────────────────────

// Called by content.js when it reads localStorage on the app page
function handleJWT(token) {
  if (!token) {
    // User logged out
    currentToken = null;
    stopKeepAlive();
    disconnect();
    return;
  }

  if (token === currentToken && ws?.readyState === WebSocket.OPEN) {
    // Same token, already connected — nothing to do
    return;
  }

  currentToken = token;
  startKeepAlive();
  // Reconnect with the new token
  disconnect();
  chrome.alarms.create('reconnect', { delayInMinutes: 0.005 }); // ~300ms
}

// Try to get the JWT by opening a tab on the app — fallback if content script
// hasn't fired yet (e.g. extension installed before the app was opened)
async function tryGetTokenFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get('cachedJWT', r => resolve(r.cachedJWT || null));
  });
}

// ─── WebSocket connection ─────────────────────────────────────────────────────

function connect() {
  if (!currentToken) {
    setStatus('waiting_for_login');
    return;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  setStatus('connecting');

  ws = new WebSocket(BRIDGE_ENV.bridgeWsUrl);

  ws.onopen = () => {
    setStatus('connecting');
    // Securely pass token inside payload instead of URL
    ws.send(JSON.stringify({ type: 'AUTH', token: currentToken }));
  };

  ws.onmessage = async ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'AUTH_OK') {
      setStatus('connected');
      chrome.storage.local.set({ cachedJWT: currentToken });
      ws.send(JSON.stringify({ type: 'HELLO', client: 'extension', v: '1.0' }));
      console.log(`[Hit-It Bridge] Connected (${BRIDGE_ENV.name})`);
      return;
    }

    if (msg.type === 'REQUEST') await executeRequest(msg);
    if (msg.type === 'PING')    ws.send(JSON.stringify({ type: 'PONG' }));

    // Bridge told us our token is invalid (user deleted account, token expired, etc.)
    if (msg.type === 'AUTH_ERROR') {
      currentToken = null;
      chrome.storage.local.remove('cachedJWT');
      setStatus('auth_error');
      ws.close();
    }
  };

  ws.onclose = (event) => {
    // 4001 = unauthorized (invalid JWT)
    if (event.code === 4001) {
      currentToken = null;
      chrome.storage.local.remove('cachedJWT');
      setStatus('auth_error');
      return; // don't reconnect with a bad token
    }
    setStatus('disconnected');
    // Reconnect after 3s — token might still be valid, just a network blip
    // Use alarms instead of setTimeout so it survives SW restarts
    chrome.alarms.create('reconnect', { delayInMinutes: 0.05 }); // ~3s
  };

  ws.onerror = () => setStatus('error');
}

function disconnect() {
  chrome.alarms.clear('reconnect');
  ws?.close();
  ws = null;
}

// ─── Request executor ─────────────────────────────────────────────────────────

async function executeRequest({ requestId, method, url, headers = {}, body, timeout = 30000 }) {
  dbg.group(`[Hit-It Bridge] ▶ REQUEST ${method} ${url}`);
  dbg.log('requestId:', requestId);
  dbg.log('headers:', headers);
  dbg.log('body:', body);
  dbg.log('timeout:', timeout);

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    // The URL is user data — keep it out of production logs, same as bodies.
    console.error('[Hit-It Bridge] ❌ REQUEST carried an unparseable URL');
    dbg.log('unparseable url:', url, e.message);
    dbg.groupEnd();
    return respond(requestId, 400, {}, { error: 'Invalid URL' }, 0);
  }

  dbg.log('parsed hostname:', parsed.hostname, '| port:', parsed.port, '| pathname:', parsed.pathname);

  // Hard safety: extension will ONLY hit localhost
  const allowed = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (!allowed) {
    console.error(`❌ Blocked — hostname "${parsed.hostname}" is not localhost or 127.0.0.1`);
    dbg.groupEnd();
    return respond(requestId, 403, {}, { error: 'Only localhost targets are allowed' }, 0);
  }

  const t0   = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  const opts = { method, headers, signal: ctrl.signal };
  if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    dbg.log('request body (raw):', opts.body);
  }

  dbg.log('fetch opts:', { method: opts.method, headers: opts.headers, bodyLength: opts.body?.length });

  try {
    dbg.log(`⏳ Fetching ${url} ...`);
    const res = await fetch(url, opts);
    clearTimeout(timer);

    const resHeaders = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });

    let resBody;
    const ct = resHeaders['content-type'] || '';
    if (ct.includes('application/json')) resBody = await res.json().catch(() => null);
    else resBody = await res.text();

    const duration = Date.now() - t0;
    dbg.log(`✅ Response: ${res.status} (${duration}ms)`);
    dbg.log('response headers:', resHeaders);
    dbg.log('response body:', resBody);
    dbg.groupEnd();

    addLog({ requestId, method, url, status: res.status, duration });
    respond(requestId, res.status, resHeaders, resBody, duration);

  } catch (err) {
    clearTimeout(timer);
    const duration = Date.now() - t0;
    const msg = err.name === 'AbortError' ? 'Request timed out' : err.message;
    console.error(`❌ Fetch failed after ${duration}ms:`, err.name, msg);
    dbg.log('full error:', err);
    dbg.groupEnd();

    addLog({ requestId, method, url, status: 0, duration, error: msg });
    respond(requestId, 0, {}, { error: msg }, duration, msg);
  }
}

function respond(requestId, status, headers, body, duration, error) {
  ws?.send(JSON.stringify({
    type: 'RESPONSE', requestId, status, headers, body, duration,
    ...(error ? { error } : {}),
  }));
}

function addLog(entry) {
  requestLog.unshift({ ...entry, ts: Date.now() });
  if (requestLog.length > 50) requestLog.pop();
  chrome.storage.local.set({ requestLog });
  chrome.runtime.sendMessage({ type: 'LOG_UPDATE', log: requestLog }).catch(() => {});
}

// ─── Messages from popup ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  switch (msg.type) {
    case 'JWT_FROM_PAGE':
      handleJWT(msg.token);
      reply({ ok: true });
      break;

    case 'GET_STATE':
      reply({
        status,
        hasToken: !!currentToken,
        log: requestLog,
      });
      break;

    case 'DISCONNECT':
      stopKeepAlive();
      disconnect();
      currentToken = null;
      chrome.storage.local.remove('cachedJWT');
      reply({ ok: true });
      break;

    case 'CLEAR_LOG':
      requestLog = [];
      chrome.storage.local.set({ requestLog: [] });
      reply({ ok: true });
      break;
  }
  return true;
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
// On startup, try the cached JWT (from a previous session) while waiting
// for the content script to fire from the app page

async function boot() {
  // 1. Try cached token first (fastest path — survives SW restarts)
  const cached = await tryGetTokenFromStorage();
  if (cached) {
    currentToken = cached;
    startKeepAlive();
    connect();
  }

  // 2. Also ask any open app tabs to re-send the token
  // This handles the case where SW restarted but the tab is still open
  chrome.tabs.query({ url: BRIDGE_ENV.appPatterns }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_TOKEN' }, (response) => {
        // Ignore errors — tab might not have content script loaded yet
        if (chrome.runtime.lastError) return;
        if (response?.token) handleJWT(response.token);
      });
    }
  });

  if (!cached) {
    setStatus('waiting_for_login');
  }
}

chrome.runtime.onStartup.addListener(boot);
chrome.runtime.onInstalled.addListener(boot);
boot();