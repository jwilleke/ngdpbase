/**
 * Shared user-keywords typeahead (#897, #915, #916). One widget for every
 * keyword field — the page editor (create.ejs / _basicEditor.ejs) and the media
 * item edit form (media-item.ejs) — so one vocabulary and one behavior serve
 * pages and media alike.
 *
 * Markup contract — any number of fields per page:
 *   <input data-kw-typeahead data-kw-menu="<menuId>" data-kw-pool="<poolId>">
 *   <div class="dropdown-menu" id="<menuId>"></div>
 *   <script type="application/json" id="<poolId>">["Label A","Label B", …]</script>
 *
 * Behavior:
 *   - Case-insensitive matching; a committed token SNAPS to the vocabulary's
 *     canonical display form (typing `dining` yields catalogued `Dining`), on
 *     both pick and blur.
 *   - Explicit-add affordance: when the current token isn't an exact vocabulary
 *     term, the dropdown offers "➕ Add new keyword: '<token>'", so new keywords
 *     are a deliberate choice, not a typo side effect.
 *   - Case-insensitive de-dup of the field on blur.
 */
(function () {
  function bind(input) {
    if (input.dataset.kwBound) return;
    var menu = document.getElementById(input.getAttribute('data-kw-menu') || '');
    var poolEl = document.getElementById(input.getAttribute('data-kw-pool') || '');
    if (!menu || !poolEl) return;
    input.dataset.kwBound = '1';

    var pool = [];
    try { pool = JSON.parse(poolEl.textContent) || []; } catch (e) { pool = []; }
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
      matches.forEach(function (label, i) { menu.appendChild(mkItem(label, label, i === active, false)); });
      if (!exact && currentRaw.length) {
        var addIdx = matches.length;
        menu.appendChild(mkItem('➕ Add new keyword: "' + currentRaw + '"', currentRaw, addIdx === active, true));
      }
      if (!menu.children.length) { hide(); return; }
      menu.classList.add('show');
    }

    input.addEventListener('input', function () { active = -1; update(); });
    input.addEventListener('blur', function () {
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

  function init() {
    var inputs = document.querySelectorAll('input[data-kw-typeahead]');
    for (var i = 0; i < inputs.length; i++) bind(inputs[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
