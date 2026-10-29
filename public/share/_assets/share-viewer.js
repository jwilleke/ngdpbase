/**
 * The viewer for a link to an encrypted vault (#1388).
 *
 * The key is the part of the address after `#`, which the browser never sends.
 * This fetches the link's locked copies and opens them here, with the same
 * steps the server used to lock them (src/utils/shareLockbox.ts): ECDH on
 * P-256 with the lockbox's ephemeral key, HKDF-SHA-256, AES-256-GCM. A page is
 * shown in a sandboxed frame where no script runs; its pictures and files are
 * put back from their own locked copies.
 */
(function () {
  'use strict';

  const root = document.getElementById('shareViewer');
  if (!root) return;
  const token = root.getAttribute('data-token');
  const base = '/share/' + encodeURIComponent(token) + '/lockbox/';
  const linkKey = window.location.hash.slice(1);
  const LABEL = new TextEncoder().encode('ngdp-share-lockbox-v1');
  const status = document.getElementById('viewerStatus');
  const list = document.getElementById('pageList');
  const frame = document.getElementById('pageFrame');
  const tools = document.getElementById('pageTools');
  const titleEl = document.getElementById('pageTitle');
  let current = null;

  function say(message, kind) {
    status.textContent = message;
    status.className = 'alert alert-' + (kind || 'info');
    status.classList.remove('d-none');
  }

  function fromB64url(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
  }

  async function open(box) {
    const parts = linkKey.split('.');
    const privateKey = await crypto.subtle.importKey('jwk',
      { kty: 'EC', crv: 'P-256', d: parts[0], x: parts[1], y: parts[2], ext: true },
      { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const ephemeral = await crypto.subtle.importKey('jwk',
      { kty: 'EC', crv: 'P-256', x: box.epk.x, y: box.epk.y, ext: true },
      { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephemeral }, privateKey, 256);
    const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: LABEL, info: LABEL },
      hkdf, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(box.iv) }, key, fromB64url(box.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function fetchOpen(path) {
    const response = await fetch(base + path, { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('gone');
    return open(await response.json());
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function documentFor(page, html) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(page.title) + '</title>' +
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">' +
      '</head><body class="p-3"><h1 class="h3">' + escapeHtml(page.title) + '</h1><hr>' + html + '</body></html>';
  }

  async function showPage(uuid) {
    try {
      say('Opening the page…');
      const page = await fetchOpen('pages/' + encodeURIComponent(uuid));
      let html = page.html;
      for (const id of page.files || []) {
        const file = await fetchOpen('files/' + encodeURIComponent(id));
        const url = 'data:' + file.type + ';base64,' + file.data;
        html = html.split('lockbox-file:' + id).join(url);
      }
      current = { title: page.title, doc: documentFor(page, html) };
      frame.srcdoc = current.doc;
      frame.classList.remove('d-none');
      titleEl.textContent = page.title;
      tools.classList.remove('d-none');
      status.classList.add('d-none');
    } catch (err) {
      say('This page could not be opened. The link may have expired or been revoked.', 'warning');
    }
  }

  document.getElementById('printPage').addEventListener('click', function () {
    if (frame.contentWindow) frame.contentWindow.print();
  });
  document.getElementById('downloadPage').addEventListener('click', function () {
    if (!current) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([current.doc], { type: 'text/html' }));
    a.download = current.title.replace(/[\\/:*?"<>|]/g, '_') + '.html';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  (async function start() {
    if (linkKey.split('.').length !== 3) {
      say('This link is missing its key: the part after # was not included when it was copied.', 'warning');
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      say('This browser cannot open encrypted links.', 'warning');
      return;
    }
    try {
      const manifest = await fetchOpen('manifest');
      document.getElementById('sharedBy').textContent = 'Shared by ' + manifest.sharedBy;
      list.innerHTML = '';
      for (const page of manifest.pages) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'list-group-item list-group-item-action';
        button.textContent = page.title;
        button.addEventListener('click', function () { showPage(page.uuid); });
        list.appendChild(button);
      }
      if (manifest.pages.length === 1) {
        await showPage(manifest.pages[0].uuid);
      } else {
        say(manifest.pages.length ? 'Choose a page.' : 'Nothing is shared through this link yet.');
      }
    } catch (err) {
      say('This link could not be opened: its key does not match, or it has expired or been revoked.', 'warning');
    }
  })();
})();
