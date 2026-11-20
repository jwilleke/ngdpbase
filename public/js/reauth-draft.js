/**
 * Keep what was typed across the fresh sign-in prompt (#2445).
 *
 * A page that sends by fetch and follows a step-up `reauth` link (see
 * `followReauth` in csrf.js) leaves the page, so what the person typed is lost
 * when they come back. Such a page calls `keep` before following the link and
 * `restore` when it loads:
 *
 *   if (data && data.reauth) reauthDraft.keep('my-form', form);
 *   if (window.followReauth(data)) return;
 *   ...
 *   reauthDraft.restore('my-form', form, { press: 'Save' });
 *
 * Restoring only fills the fields and shows a note; it never sends. The person
 * presses the button again, so the action is still theirs and still passes the
 * sign-in check.
 *
 * What is kept: the value of each text, number, select and textarea field with
 * an id or name, in this tab's sessionStorage, with the account's username and
 * the time. Never kept: password, hidden (the CSRF token among them), file,
 * checkbox and radio fields, a field with `data-no-draft` or an `autocomplete`
 * of a password or a one-time code. A draft is read once, dropped when it is
 * for another account or older than ten minutes, and a value the field does not
 * accept (a choice it does not offer, a number out of range, text past its
 * `maxlength`) is left out. Nothing is kept or restored on a page that does not say
 * who is signed in. Every page that loads this script drops the drafts that are old,
 * for another account or for nobody, and signing out drops them all.
 */
(function () {
  'use strict';

  var PREFIX = 'ngdpbase.draft.';
  var MAX_AGE_MS = 10 * 60 * 1000;
  var NEVER_TYPES = ['password', 'hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image'];

  function currentUser() {
    var meta = document.querySelector('meta[name="current-user"]');
    return (meta && meta.getAttribute('content')) || '';
  }

  /** A draft that may still be used: well-formed, for the signed-in account, under ten minutes old. */
  function usable(draft) {
    var user = currentUser();
    return !!draft && typeof draft === 'object' && !!draft.fields && typeof draft.fields === 'object' &&
      !!user && draft.user === user && typeof draft.at === 'number' && Date.now() - draft.at < MAX_AGE_MS;
  }

  function draftKeys() {
    var keys = [];
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) keys.push(k);
      }
    } catch (err) { /* no storage */ }
    return keys;
  }

  function parse(raw) {
    try { return JSON.parse(raw || 'null'); } catch (err) { return null; }
  }

  /** Drop every draft that can no longer be used. */
  function sweep() {
    draftKeys().forEach(function (k) {
      try {
        if (!usable(parse(sessionStorage.getItem(k)))) sessionStorage.removeItem(k);
      } catch (err) { /* no storage */ }
    });
  }

  function clearAll() {
    draftKeys().forEach(function (k) {
      try { sessionStorage.removeItem(k); } catch (err) { /* no storage */ }
    });
  }

  function idOf(el) {
    return el.id || el.name;
  }

  function keepable(el, skip) {
    var tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
    if (!idOf(el) || NEVER_TYPES.indexOf((el.type || '').toLowerCase()) !== -1) return false;
    if (el.hasAttribute('data-no-draft')) return false;
    if (/password|one-time-code/i.test(el.getAttribute('autocomplete') || '')) return false;
    return !(skip && skip(el));
  }

  /** A form's own fields, including any outside its element that belong to it. */
  function fieldsOf(root, skip) {
    var all = root.elements || root.querySelectorAll('input, select, textarea');
    return Array.prototype.filter.call(all, function (el) { return keepable(el, skip); });
  }

  /**
   * Keep the values of `root`'s fields under `key`. Returns true when something
   * was kept. `opts.skip(field)` leaves out a field this page knows to be secret.
   */
  function keep(key, root, opts) {
    if (!currentUser()) return false;
    var fields = {};
    var count = 0;
    fieldsOf(root, opts && opts.skip).forEach(function (el) {
      fields[idOf(el)] = el.value;
      count++;
    });
    if (!count) return false;
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify({ user: currentUser(), at: Date.now(), fields: fields }));
    } catch (err) {
      return false; // storage refused: the prompt still works, the form is just empty after it
    }
    return true;
  }

  /**
   * Fill `root` from the draft under `key`, once. Returns true when a field was
   * filled. `opts.press` names the button to press again; `opts.noteIn` is the
   * element the note goes at the top of (default `root`); `opts.label` says what it was for;
   * `opts.onRestore(root)` runs after a fill (to show a hidden form or its tab); `opts.skip` as for `keep`.
   */
  function restore(key, root, opts) {
    var o = opts || {};
    var draft = null;
    try {
      draft = parse(sessionStorage.getItem(PREFIX + key));
      sessionStorage.removeItem(PREFIX + key);
    } catch (err) {
      return false;
    }
    if (!usable(draft)) return false;

    var filled = 0;
    fieldsOf(root, o.skip).forEach(function (el) {
      var value = draft.fields[idOf(el)];
      if (typeof value !== 'string') return;
      var before = el.value;
      if (el.tagName === 'SELECT') {
        if (!Array.prototype.some.call(el.options, function (opt) { return opt.value === value; })) return;
        el.value = value;
      } else {
        if (el.maxLength >= 0 && value.length > el.maxLength) return;
        el.value = value;
        // The field turned the text into something else (a number input drops what is not a number), or rejects it.
        if (el.value !== value || (el.type === 'number' && !el.checkValidity())) { el.value = before; return; }
      }
      filled++;
    });
    if (!filled) return false;

    var note = document.createElement('div');
    note.className = 'alert alert-info py-2 small mb-2';
    note.setAttribute('role', 'status');
    note.setAttribute('data-draft-note', '');
    note.textContent = 'What you typed' + (o.label ? ' for ' + o.label : '') + ' has been put back. Nothing has been sent yet.' +
      (o.press ? ' Press ' + o.press + ' again to finish.' : '');
    var target = o.noteIn || root;
    target.insertBefore(note, target.firstChild);
    if (typeof o.onRestore === 'function') o.onRestore(root);
    return true;
  }

  /** Whether a fresh draft of the signed-in account is waiting in this tab (the sign-in prompt says so). */
  function pending() {
    sweep();
    return draftKeys().length > 0;
  }

  sweep();
  // Signing out leaves nothing typed behind in the tab.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form && form.getAttribute && /^\/logout\/?$/.test(form.getAttribute('action') || '')) clearAll();
  }, true);

  window.reauthDraft = { keep: keep, restore: restore, pending: pending };
})();
