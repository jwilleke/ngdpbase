/**
 * Passkeys in the browser (#448): sign in, and enrol one from the profile.
 *
 * The server sends WebAuthn options with binary fields as base64url strings
 * (@simplewebauthn/server's JSON form); this turns them into ArrayBuffers for
 * navigator.credentials, and the result back into JSON. Only shown where
 * window.PublicKeyCredential exists. Every POST goes through csrfFetch.
 */
(function () {
  if (!window.PublicKeyCredential) return;
  // Bind once per page, however many times the script is included: the
  // step-down banner (header) and the profile both load it, and two handlers
  // on one button fetched two challenges for one click — the second replaced
  // the first in the session, so the passkey's answer never verified.
  if (window.__ngdpbasePasskeyBound) return;
  window.__ngdpbasePasskeyBound = true;

  function toBuffer(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    var pad = b64.length % 4 === 0 ? '' : '===='.slice(b64.length % 4);
    var bin = atob(b64 + pad);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function toB64url(buffer) {
    var bytes = new Uint8Array(buffer);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function credentialJSON(cred) {
    var r = cred.response;
    var response = { clientDataJSON: toB64url(r.clientDataJSON) };
    if (r.attestationObject) {
      response.attestationObject = toB64url(r.attestationObject);
      if (typeof r.getTransports === 'function') response.transports = r.getTransports();
    } else {
      response.authenticatorData = toB64url(r.authenticatorData);
      response.signature = toB64url(r.signature);
      if (r.userHandle) response.userHandle = toB64url(r.userHandle);
    }
    return {
      id: cred.id,
      rawId: toB64url(cred.rawId),
      type: cred.type,
      response: response,
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
      authenticatorAttachment: cred.authenticatorAttachment || undefined
    };
  }

  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.error || 'Request failed');
        return body;
      });
    });
  }

  function postJSON(url, body) {
    return window.csrfFetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (out) {
        if (!r.ok) throw new Error(out.error || 'Request failed');
        return out;
      });
    });
  }

  function showError(el, message) {
    if (el) { el.textContent = message; el.classList.remove('d-none'); }
  }

  // Sign in: any button with data-passkey-signin
  document.querySelectorAll('[data-passkey-signin]').forEach(function (button) {
    button.classList.remove('d-none');
    button.addEventListener('click', function () {
      var errorEl = document.getElementById(button.dataset.errorTarget || '');
      button.disabled = true;
      getJSON('/auth/passkey/authenticate/options')
        .then(function (options) {
          options.challenge = toBuffer(options.challenge);
          (options.allowCredentials || []).forEach(function (c) { c.id = toBuffer(c.id); });
          return navigator.credentials.get({ publicKey: options });
        })
        .then(function (cred) {
          return postJSON('/auth/passkey/authenticate/verify', { response: credentialJSON(cred), redirect: button.dataset.redirect || '/' });
        })
        .then(function (out) { window.location.href = out.redirect || '/'; })
        .catch(function (err) {
          button.disabled = false;
          showError(errorEl, err && err.name === 'NotAllowedError' ? 'Passkey sign-in was cancelled.' : (err.message || 'Passkey sign-in failed.'));
        });
    });
  });

  // A starting name for a new passkey: the browser and the kind of device.
  // Browsers never reveal a device's own name ("Jim's Pixel"); Chromium can
  // report the phone model when asked, and that replaces the generic word.
  function suggestedName() {
    var ua = navigator.userAgent || '';
    var browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    var device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone'
      : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'this device';
    return { browser: browser, device: device };
  }

  function prefillName(input) {
    if (!input || input.value) return;
    var s = suggestedName();
    input.value = s.browser + ' on ' + s.device;
    var guess = input.value;
    var data = navigator.userAgentData;
    if (data && data.getHighEntropyValues) {
      data.getHighEntropyValues(['model']).then(function (v) {
        // Only while the field still holds our guess: never overwrite a typed name.
        if (v && v.model && input.value === guess) input.value = s.browser + ' on ' + v.model;
      }).catch(function () {});
    }
  }

  // Enrol: any button with data-passkey-enrol (profile)
  document.querySelectorAll('[data-passkey-enrol]').forEach(function (button) {
    button.classList.remove('d-none');
    var labelInput = document.getElementById(button.dataset.labelInput || '');
    prefillName(labelInput);
    button.addEventListener('click', function () {
      var errorEl = document.getElementById(button.dataset.errorTarget || '');
      var labelEl = document.getElementById(button.dataset.labelInput || '');
      if (labelEl && !labelEl.value.trim()) {
        showError(errorEl, 'Give this passkey a name, so you can tell it apart from your others.');
        labelEl.focus();
        return;
      }
      button.disabled = true;
      getJSON('/auth/passkey/register/options')
        .then(function (options) {
          options.challenge = toBuffer(options.challenge);
          options.user.id = toBuffer(options.user.id);
          (options.excludeCredentials || []).forEach(function (c) { c.id = toBuffer(c.id); });
          return navigator.credentials.create({ publicKey: options });
        })
        .then(function (cred) {
          return postJSON('/auth/passkey/register/verify', { response: credentialJSON(cred), label: labelEl ? labelEl.value : '' });
        })
        .then(function () { window.location.href = '/profile?success=Passkey+added'; })
        .catch(function (err) {
          button.disabled = false;
          showError(errorEl, err && err.name === 'InvalidStateError' ? 'This device already has a passkey for this site.' : (err.message || 'Adding the passkey failed.'));
        });
    });
  });
})();
