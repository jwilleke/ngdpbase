/**
 * Shared user-keywords typeahead (#897, #915). Initializes on the editor
 * keyword field (#userKeywordsInput + #userKeywordsSuggest + #userKeywordsPool),
 * used by both create.ejs and _basicEditor.ejs.
 *
 * #915 additions over the original inline widget:
 *   - Case-insensitive matching that SNAPS a committed token to the vocabulary's
 *     canonical display form (typing `dining` yields catalogued `Dining`).
 *   - Explicit-add affordance: when the current token isn't an exact vocabulary
 *     term, the dropdown offers "➕ Add new keyword: '<token>'" so creating a new
 *     keyword is a deliberate choice, not a typo side effect.
 *   - On blur, exact case-insensitive matches snap to canonical form and the
 *     list is de-duplicated case-insensitively — immediate feedback mirroring
 *     the server-side save enforcement.
 */
(function () {
  function init() {
    var input = document.getElementById('userKeywordsInput');
    var menu = document.getElementById('userKeywordsSuggest');
    var poolEl = document.getElementById('userKeywordsPool');
    if (!input || !menu || !poolEl || input.dataset.kwBound) return;
    input.dataset.kwBound = '1';

    var pool = [];
    try { pool = JSON.parse(poolEl.textContent) || []; } catch (e) { pool = []; }
    // Lowercase → canonical display label, for case-insensitive snapping.
    var byLower = {};
    pool.forEach(function (label) { byLower[String(label).toLowerCase()] = label; });
    var active = -1;

    function tokens() { return input.value.split(',').map(function (t) { return t.trim(); }); }
    function hide() { menu.classList.remove('show'); menu.innerHTML = ''; active = -1; }

    function dedupeCanonical(parts) {
      var seen = {}, out = [];
      parts.filter(Boolean).forEach(function (t) {
        var k = t.toLowerCase();
        if (!seen[k]) { seen[k] = 1; out.push(byLower[k] || t); }
      });
      return out;
    }

    function commit(value) {
      var parts = tokens();
      parts[parts.length - 1] = value;
      input.value = dedupeCanonical(parts).join(', ');
      hide();
      input.focus();
    }

    function mkItem(text, value, isActive, isAdd) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item py-1' + (isActive ? ' active' : '') + (isAdd ? ' text-primary' : '');
      item.style.fontSize = '0.85em';
      item.textContent = text;
      item.addEventListener('mousedown', function (e) { e.preventDefault(); commit(value); });
      return item;
    }

    function update() {
      var parts = tokens();
      var currentRaw = parts[parts.length - 1] || '';
      var current = currentRaw.toLowerCase();
      if (!current) { hide(); return; }
      var chosen = parts.slice(0, -1).map(function (t) { return t.toLowerCase(); });
      var matches = pool.filter(function (label) {
        var l = String(label).toLowerCase();
        return l.indexOf(current) !== -1 && chosen.indexOf(l) === -1;
      }).slice(0, 8);
      var exact = Object.prototype.hasOwnProperty.call(byLower, current);

      menu.innerHTML = '';
      matches.forEach(function (label, i) {
        menu.appendChild(mkItem(label, label, i === active, false));
      });
      // Explicit-add: only when the token isn't already a known vocabulary term.
      if (!exact && currentRaw.length) {
        var addIdx = matches.length;
        menu.appendChild(mkItem('➕ Add new keyword: "' + currentRaw + '"', currentRaw, addIdx === active, true));
      }
      if (!menu.children.length) { hide(); return; }
      menu.classList.add('show');
    }

    input.addEventListener('input', function () { active = -1; update(); });
    input.addEventListener('blur', function () {
      // Snap exact matches to canonical form + de-dup on leave.
      input.value = dedupeCanonical(tokens()).join(', ');
      setTimeout(hide, 120);
    });
    input.addEventListener('keydown', function (e) {
      if (!menu.classList.contains('show')) return;
      var items = menu.querySelectorAll('.dropdown-item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = e.key === 'ArrowDown' ? (active + 1) % items.length : (active - 1 + items.length) % items.length;
        items.forEach(function (el, i) { el.classList.toggle('active', i === active); });
      } else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
        e.preventDefault();
        items[active].dispatchEvent(new MouseEvent('mousedown'));
      } else if (e.key === 'Escape') {
        hide();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
