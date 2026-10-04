/**
 * Two-step sign-in (#1523): while the email link waits for approval, ask the
 * server every few seconds. Approved: submit the completion form (a POST, so
 * the session is created by a request carrying the CSRF token). Refused or
 * expired: say so and stop.
 */
(function () {
  var status = document.querySelector('[data-second-factor-status]');
  var complete = document.querySelector('[data-second-factor-complete]');
  if (!status || !complete) return;
  var stopped = false;
  function check() {
    if (stopped) return;
    fetch('/login/second-factor/status', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (body.state === 'approved') { stopped = true; status.textContent = 'Approved. Signing you in…'; complete.submit(); return; }
        if (body.state === 'denied') { stopped = true; status.textContent = 'This sign-in was refused from the email link.'; return; }
        if (body.state === 'expired') { stopped = true; status.textContent = 'This sign-in expired. Sign in again.'; return; }
        setTimeout(check, 3000);
      })
      .catch(function () { setTimeout(check, 5000); });
  }
  setTimeout(check, 2000);
})();
