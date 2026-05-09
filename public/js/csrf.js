/**
 * CSRF token helpers for client-side fetch (#663).
 *
 * The token is rendered into <meta name="csrf-token" content="..."> by
 * views/header.ejs. State-changing requests (POST/PUT/DELETE/PATCH) must
 * present it as the X-CSRF-Token header or as `_csrf` in the request body.
 *
 * Use `csrfFetch()` instead of `fetch()` for any state-changing same-origin
 * call — it auto-injects the header. Read-only calls (GET/HEAD) can keep
 * using plain `fetch()`.
 */
(function () {
  'use strict';

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return (meta && meta.getAttribute('content')) || '';
  }

  /**
   * fetch() wrapper that injects the X-CSRF-Token header for non-safe
   * methods. Safe-method calls pass straight through. Existing headers in
   * the caller's options are preserved.
   *
   * @param {RequestInfo} input - same as fetch()
   * @param {RequestInit} [init] - same as fetch()
   * @returns {Promise<Response>}
   */
  function csrfFetch(input, init) {
    const opts = init || {};
    const method = (opts.method || 'GET').toUpperCase();
    const safe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (safe) {
      return fetch(input, opts);
    }
    const token = getCsrfToken();
    const headers = new Headers(opts.headers || {});
    if (!headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', token);
    }
    return fetch(input, Object.assign({}, opts, { headers: headers }));
  }

  window.getCsrfToken = getCsrfToken;
  window.csrfFetch = csrfFetch;
})();
