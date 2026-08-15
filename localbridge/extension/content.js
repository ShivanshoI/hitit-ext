// content.js - runs on your frontend page (hit-it.co.in / localhost:5174)
// Reads the JWT from localStorage and forwards it to the background service worker.

(function () {
  function sendToken() {
    const token = localStorage.getItem('auth_token');
    if (BRIDGE_ENV.debug) {
      console.log('[Hit-It Bridge] Found token:', token ? 'YES (matches)' : 'NO (missing)');
    }
    chrome.runtime.sendMessage({ type: 'JWT_FROM_PAGE', token: token || null });
  }

  // 1. Send immediately on page load
  sendToken();

  // 2. Respond when background asks for the token (e.g. after SW restart)
  chrome.runtime.onMessage.addListener(function (msg, _sender, reply) {
    if (msg.type === 'REQUEST_TOKEN') {
      reply({ token: localStorage.getItem('auth_token') || null });
    }
  });

  // 3. Watch for login / logout while page is open
  window.addEventListener('storage', function (e) {
    if (e.key === 'auth_token') {
      chrome.runtime.sendMessage({
        type: 'JWT_FROM_PAGE',
        token: e.newValue || null,
      });
    }
  });
})();