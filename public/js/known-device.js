/**
 * #1523 slice 1c — "Remember this browser".
 *
 * Remembering: after a sign-in that ticked the box, make an ECDSA P-256 key
 * that cannot be exported (`extractable: false`), keep it in IndexedDB, and
 * send only the public half. Proving: at the second step, sign the server's
 * one-time challenge with it; when the server accepts, submit the completion
 * form. Any failure leaves the normal prompt in place. The key and the
 * signature are never logged.
 */
(function () {
  var DB = 'ngdpbase-known-device';
  var STORE = 'keys';
  var PREFIX = 'ngdpbase known device v1\n';

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(mode, run) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var req = run(t.objectStore(STORE));
        t.oncomplete = function () { db.close(); resolve(req && req.result); };
        t.onerror = function () { db.close(); reject(t.error); };
      });
    });
  }
  function b64url(buf) {
    var s = '';
    new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function post(url, fields) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString()
    }).then(function (r) { return r.json(); });
  }

  var prove = document.querySelector('[data-known-device]');
  if (prove && window.indexedDB && window.crypto && crypto.subtle) {
    var user = prove.getAttribute('data-user');
    tx('readonly', function (s) { return s.get(user); })
      .then(function (entry) {
        if (!entry || !entry.privateKey) return null;
        var data = new TextEncoder().encode(PREFIX + prove.getAttribute('data-challenge'));
        return crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, entry.privateKey, data).then(function (sig) {
          return post('/login/second-factor/device', { _csrf: prove.getAttribute('data-csrf'), deviceId: entry.deviceId, signature: b64url(sig) });
        });
      })
      .then(function (body) {
        if (body && body.ok) document.querySelector('[data-known-device-complete]').submit();
      })
      .catch(function () { /* the normal prompt stays */ });
  }

  var remember = document.querySelector('[data-remember-browser]');
  if (remember) {
    var next = remember.getAttribute('data-next') || '/';
    var status = remember.querySelector('[data-remember-status]');
    var done = function (text) { if (status) status.textContent = text; setTimeout(function () { window.location.assign(next); }, 600); };
    if (!window.indexedDB || !window.crypto || !crypto.subtle) { done('This browser cannot be remembered.'); return; }
    var pair;
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
      .then(function (p) { pair = p; return crypto.subtle.exportKey('spki', p.publicKey); })
      .then(function (spki) { return post('/login/remember-browser', { _csrf: remember.getAttribute('data-csrf'), publicKey: b64url(spki) }); })
      .then(function (body) {
        if (!body || !body.ok) { done('This browser could not be remembered.'); return; }
        var user = remember.getAttribute('data-user');
        return tx('readwrite', function (s) { return s.put({ deviceId: body.deviceId, privateKey: pair.privateKey }, user); })
          .then(function () { done('This browser is remembered.'); });
      })
      .catch(function () { done('This browser could not be remembered.'); });
  }
})();
