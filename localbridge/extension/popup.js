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

var KNOWN_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

function span(className, text) {
  var el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

// Log entries carry method/url straight from the bridge server's REQUEST
// frames, so they are untrusted strings — build nodes, never innerHTML.
function logRow(e) {
  var path;
  try { path = new URL(e.url).pathname; } catch (err) { path = e.url; }

  var method = String(e.method || '');
  var methodClass = KNOWN_METHODS.indexOf(method) !== -1 ? ' ' + method : '';
  var sOk = !e.error && e.status >= 200 && e.status < 300;

  var url = span('log-url', path);
  url.title = e.url;

  var row = document.createElement('div');
  row.className = 'log-row';
  row.appendChild(span('method' + methodClass, method));
  row.appendChild(url);
  row.appendChild(span('log-status ' + (sOk ? 'ok' : 'err'), e.error ? 'ERR' : (e.status || '?')));
  return row;
}

function renderLog() {
  var el = document.getElementById('logEl');
  el.textContent = '';

  if (!log.length) {
    var empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'no requests yet';
    el.appendChild(empty);
    return;
  }

  log.slice(0, 30).forEach(function(e) { el.appendChild(logRow(e)); });

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
