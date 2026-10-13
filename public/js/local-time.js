/**
 * Shows times in the viewer's own time zone (operator rule: end users never
 * see UTC). A view emits
 *
 *   <time datetime="2026-10-12T20:00:00.000Z" data-local-time>2026-10-12 20:00 UTC</time>
 *
 * and this replaces the text with the browser's local date and time. The UTC
 * text stays as the tooltip, and is what shows if this script does not run.
 * Loaded once by the page layout (header.ejs); a file, not inline, so it needs
 * no CSP nonce.
 */
(function () {
  function localize(root) {
    (root || document).querySelectorAll('time[data-local-time][datetime]').forEach(function (el) {
      const d = new Date(el.getAttribute('datetime'));
      if (isNaN(d.getTime())) return;
      if (!el.title) el.title = el.textContent.trim();
      el.textContent = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    });
  }
  window.localizeTimes = localize;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { localize(); });
  else localize();
})();
