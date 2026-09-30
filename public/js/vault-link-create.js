/**
 * Making a link to an ENCRYPTED vault (#1388), in the owner's browser.
 *
 * The link's key pair is made here. Only the public half goes to the server,
 * which locks the link's pages for it; the private half goes into the link
 * after `#`, which browsers never send, so the server never holds it. The
 * full link is shown once, here, and nowhere else.
 *
 * A form for an unencrypted vault is left alone: it posts as a plain form.
 */
(function () {
  'use strict';

  function isEncrypted(form) {
    const vault = form.querySelector('[name="vault"]');
    if (!vault) return false;
    const chosen = vault.tagName === 'SELECT' ? vault.selectedOptions[0] : vault;
    return !!chosen && chosen.getAttribute('data-encrypted') === 'true';
  }

  function show(form, link) {
    const box = document.getElementById('lockedLinkResult');
    const input = document.getElementById('lockedLinkUrl');
    if (!box || !input) return;
    input.value = link;
    box.classList.remove('d-none');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.select();
  }

  function fail(message) {
    const el = document.getElementById('lockedLinkError');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('d-none');
  }

  const messages = {
    'needs-browser': 'This browser could not make the link\'s key.',
    locked: 'Your encrypted vault is locked in this session. Sign out, sign in with your password, and try again.',
    pages: 'Choose at least one page.',
    days: 'Choose a lifetime within that vault\'s limit.',
    vault: 'Choose one of your vaults.'
  };

  document.querySelectorAll('form[data-vault-link]').forEach(function (form) {
    form.addEventListener('submit', async function (event) {
      if (!isEncrypted(form)) return;
      event.preventDefault();
      if (!window.crypto || !window.crypto.subtle) {
        fail(messages['needs-browser']);
        return;
      }
      try {
        const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
        const data = new FormData(form);
        const body = {
          vault: data.get('vault'),
          scope: data.get('scope'),
          pages: data.getAll('pages'),
          days: data.get('days'),
          label: data.get('label') || '',
          publicKey: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
        };
        const response = await window.csrfFetch(form.getAttribute('action'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body)
        });
        const result = await response.json().catch(function () { return {}; });
        if (!response.ok || !result.token) {
          fail(messages[result.error] || 'The link could not be made.');
          return;
        }
        const base = form.getAttribute('data-base-url') || window.location.origin;
        show(form, base + '/share/' + result.token + '#' + jwk.d + '.' + jwk.x + '.' + jwk.y);
      } catch (err) {
        fail('The link could not be made.');
      }
    });
  });

  const copy = document.getElementById('lockedLinkCopy');
  if (copy) {
    copy.addEventListener('click', function () {
      const input = document.getElementById('lockedLinkUrl');
      if (input) navigator.clipboard.writeText(input.value);
    });
  }
})();
