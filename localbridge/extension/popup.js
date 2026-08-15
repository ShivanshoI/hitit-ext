var log = [];

var STATUS_LABELS = {
  connected:         'active',
  connecting:        'connecting',
  disconnected:      'offline',
  waiting_for_login: 'not logged in',
  auth_error:        'session expired',
  error:             'error',
};

function setStatus(s) {
  var pill = document.getElementById('pill');
  var dot  = document.getElementById('dot');
  var txt  = document.getElementById('pillTxt');

  pill.className = 'pill ' + s;
  dot.className  = 'dot ' + (s === 'connecting' ? 'blink' : '');
  txt.textContent = STATUS_LABELS[s] || s;

  // Show the right card / view
  document.getElementById('cardLogin').classList.toggle('visible',
    s === 'waiting_for_login' || s === 'disconnected');
  document.getElementById('cardAuthError').classList.toggle('visible',
    s === 'auth_error');
  document.getElementById('connectedView').style.display =
    (s === 'connected' || s === 'connecting') ? 'block' : 'none';
}

function renderLog() {
  var el = document.getElementById('logEl');
  if (!log.length) { el.innerHTML = '<div class="empty">no requests yet</div>'; return; }

  el.innerHTML = log.slice(0, 30).map(function(e) {
    var path;
    try { path = new URL(e.url).pathname; } catch(err) { path = e.url; }
    var sOk = !e.error && e.status >= 200 && e.status < 300;
    return '<div class="log-row">' +
      '<span class="method ' + e.method + '">' + e.method + '</span>' +
      '<span class="log-url" title="' + e.url + '">' + path + '</span>' +
      '<span class="log-status ' + (sOk ? 'ok' : 'err') + '">' + (e.error ? 'ERR' : (e.status || '?')) + '</span>' +
      '</div>';
  }).join('');

  document.getElementById('sTotal').textContent = log.length;
  document.getElementById('sOk').textContent  = log.filter(function(e) { return !e.error && e.status >= 200 && e.status < 300; }).length;
  document.getElementById('sErr').textContent = log.filter(function(e) { return e.error || e.status >= 400; }).length;
}

// Load state from background
chrome.runtime.sendMessage({ type: 'GET_STATE' }, function(res) {
  if (!res) return;
  setStatus(res.status);
  log = res.log || [];
  renderLog();
});

// Live updates
chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.type === 'STATUS')     setStatus(msg.status);
  if (msg.type === 'LOG_UPDATE') { log = msg.log; renderLog(); }
});

document.getElementById('btnClr').onclick = function() {
  chrome.runtime.sendMessage({ type: 'CLEAR_LOG' }, function() { log = []; renderLog(); });
};

document.getElementById('btnDisc').onclick = function() {
  chrome.runtime.sendMessage({ type: 'DISCONNECT' });
};
