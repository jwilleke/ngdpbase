/**
 * "Give someone access" form (#1762 slice 7; views/_proxy-grant-form.ejs).
 *
 * - Ticking "give other people access" shows the warning, naming the person
 *   picked (the typeahead's chip), or "This person" before one is picked.
 * - The end date is sent as the end of that day in the viewer's own time
 *   zone (`expiresAt`); without this script the server takes the end of that
 *   day UTC.
 *
 * A file, not inline, so it needs no CSP nonce. A plain form POST carrying
 * `_csrf`; no fetch.
 */
(function () {
  'use strict';

  function init(form) {
    const warning = form.querySelector('[data-proxy-redelegate-warning]');
    const redelegate = form.querySelector('input[data-permission="proxy-grant"]');
    const chips = form.querySelector('[data-audience-chips]');

    function pickedName() {
      const label = chips && chips.querySelector('.audience-chip-label');
      return label && label.textContent.trim() ? label.textContent.trim() : 'This person';
    }

    function refresh() {
      if (!warning || !redelegate) return;
      warning.classList.toggle('d-none', !redelegate.checked);
      const name = warning.querySelector('[data-proxy-name]');
      if (name) name.textContent = pickedName();
    }

    if (redelegate) redelegate.addEventListener('change', refresh);
    if (chips) new MutationObserver(refresh).observe(chips, { childList: true });
    refresh();

    form.addEventListener('submit', function () {
      const day = form.querySelector('input[name="endDate"]');
      const out = form.querySelector('input[name="expiresAt"]');
      if (!day || !out) return;
      out.value = '';
      if (!day.value) return;
      const end = new Date(day.value + 'T23:59:59.999');
      if (!isNaN(end.getTime())) out.value = end.toISOString();
    });
  }

  function initAll() {
    document.querySelectorAll('[data-proxy-grant-form]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
})();
