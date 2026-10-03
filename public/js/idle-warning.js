/**
 * Session idle timeout warning (#1546).
 *
 * The server ends a session idle past its limit; this only warns first. It
 * reads the limit from data attributes on its own <script> tag, asks the
 * server where the session stands (a status poll the server does NOT count as
 * activity), shows a warning shortly before sign-out with "Stay signed in",
 * and goes to the sign-in page once the server says the session has ended.
 * Another tab's activity keeps the session alive, so it always asks the server
 * before acting.
 */
(function () {
  var script = document.currentScript;
  var timeoutMs = Number(script && script.dataset.timeoutMs);
  if (!timeoutMs || timeoutMs <= 0) return;

  var box = null;
  var timer = null;

  function hideWarning() {
    if (box) { box.remove(); box = null; }
  }

  function showWarning(remainingMs) {
    if (box) return;
    box = document.createElement('div');
    box.className = 'alert alert-warning shadow position-fixed bottom-0 end-0 m-3 d-flex align-items-center gap-3';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-live', 'assertive');
    box.style.zIndex = '1080';
    var text = document.createElement('span');
    var minutes = Math.max(1, Math.round(remainingMs / 60000));
    text.textContent = 'You will be signed out in about ' + minutes + ' minute' + (minutes === 1 ? '' : 's') + ' because of inactivity.';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-primary';
    button.textContent = 'Stay signed in';
    button.addEventListener('click', stayAlive);
    box.appendChild(text);
    box.appendChild(button);
    document.body.appendChild(box);
    button.focus();
  }

  function schedule(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, Math.max(1000, ms));
  }

  function check() {
    fetch('/api/session/idle-status', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!s.signedIn) {
          window.location.href = '/login?reason=idle&redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
          return;
        }
        if (!s.limited) { hideWarning(); return; }
        if (s.remainingMs <= s.warnBeforeMs) {
          showWarning(s.remainingMs);
          schedule(Math.min(s.remainingMs + 1000, 30000));
        } else {
          hideWarning();
          schedule(s.remainingMs - s.warnBeforeMs);
        }
      })
      .catch(function () { schedule(60000); });
  }

  function stayAlive() {
    window.csrfFetch('/api/session/keepalive', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function () { hideWarning(); check(); })
      .catch(function () { check(); });
  }

  // First look after most of the limit has passed since this page loaded.
  schedule(timeoutMs - Math.min(120000, Math.floor(timeoutMs / 4)));
})();
