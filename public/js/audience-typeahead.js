/**
 * Audience Users Typeahead (#710)
 *
 * Renders a search input + results dropdown that grants individual users
 * view access to a page, complementing the role-checkbox dropdown that
 * already lives above it in the Audience section of /edit and /create.
 *
 * Picked users are added as removable badges with hidden
 * `<input name="audience" value="<username>">` siblings — so the wire
 * format is identical to the role-checkbox shape, and the server-side
 * ACLManager.checkFrontmatterAccess path (`userRoles.includes(p) ||
 * username === p`) honours both without any changes.
 *
 * Markup contract (server-side; see _audience-typeahead.ejs partial):
 *
 *   <div data-audience-typeahead>
 *     <div data-audience-chips>
 *       <!-- server pre-renders one chip per existing user audience entry -->
 *     </div>
 *     <input data-audience-search type="text" …>
 *     <ul data-audience-results …></ul>
 *   </div>
 *
 * The widget auto-initialises every `[data-audience-typeahead]` on
 * DOMContentLoaded — no per-page config needed.
 */
(function () {
  'use strict';

  const ENDPOINT = '/api/assets/search';
  const DEBOUNCE_MS = 200;
  const MIN_CHARS = 1;
  const PAGE_SIZE = 20;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pickedUsernames(chipsContainer) {
    return Array.from(chipsContainer.querySelectorAll('input[name="audience"]'))
      .map((el) => el.value);
  }

  function checkedRoleNames(root) {
    // The role-checkbox dropdown lives in the same Audience section.
    // We exclude its names from typeahead results so the user can't
    // accidentally double-add a role-as-username.
    const audienceSection = root.closest('.row') || document;
    return Array.from(audienceSection.querySelectorAll('input.audience-checkbox'))
      .map((el) => el.value);
  }

  function allRoleNames(root) {
    // Every role checkbox (checked or not). Used to filter typeahead
    // results so a username that collides with a role name isn't offered
    // here — pick the role checkbox instead.
    const audienceSection = root.closest('.row') || document;
    return Array.from(audienceSection.querySelectorAll('input.audience-checkbox'))
      .map((el) => el.value);
  }

  function makeChip(username, displayName) {
    const li = document.createElement('span');
    li.className = 'badge bg-info-subtle text-dark border d-inline-flex align-items-center me-1 mb-1';
    li.style.fontWeight = 'normal';
    li.innerHTML =
      '<i class="fas fa-user me-1" aria-hidden="true"></i>' +
      '<span class="audience-chip-label">' + escapeHtml(displayName || username) + '</span>' +
      '<input type="hidden" name="audience" value="' + escapeHtml(username) + '">' +
      '<button type="button" class="btn-close btn-close-sm ms-2 audience-user-remove" ' +
        'aria-label="Remove ' + escapeHtml(username) + ' from audience"></button>';
    return li;
  }

  function init(root) {
    const chips = root.querySelector('[data-audience-chips]');
    const input = root.querySelector('[data-audience-search]');
    const list = root.querySelector('[data-audience-results]');
    if (!chips || !input || !list) return;

    let debounceTimer = null;
    let selectedIndex = -1;
    let currentResults = [];

    function hideResults() {
      list.classList.add('d-none');
      list.innerHTML = '';
      selectedIndex = -1;
      currentResults = [];
    }

    function highlight(index) {
      const items = list.querySelectorAll('.audience-result-item');
      items.forEach((el, i) => {
        el.classList.toggle('active', i === index);
      });
      selectedIndex = index;
    }

    function addUser(username, displayName) {
      if (!username) return;
      const already = pickedUsernames(chips);
      if (already.indexOf(username) !== -1) return;
      chips.appendChild(makeChip(username, displayName));
      input.value = '';
      hideResults();
      input.focus();
    }

    function renderResults(results) {
      const picked = pickedUsernames(chips);
      const roles = allRoleNames(root);
      const filtered = results.filter((r) => {
        const u = r.id || (r.metadata && r.metadata.username);
        if (!u) return false;
        if (picked.indexOf(u) !== -1) return false;
        if (roles.indexOf(u) !== -1) return false;
        return true;
      });
      currentResults = filtered;
      if (filtered.length === 0) {
        hideResults();
        return;
      }
      list.innerHTML = filtered
        .map((r, i) => {
          const u = r.id || (r.metadata && r.metadata.username) || '';
          const label = r.name || u;
          const sameAsId = label === u;
          return (
            '<li class="list-group-item list-group-item-action audience-result-item" ' +
              'data-username="' + escapeHtml(u) + '" ' +
              'data-display-name="' + escapeHtml(label) + '" ' +
              'data-index="' + i + '" ' +
              'style="cursor:pointer;">' +
              '<i class="fas fa-user me-2 text-muted" aria-hidden="true"></i>' +
              '<strong>' + escapeHtml(label) + '</strong>' +
              (sameAsId ? '' : ' <small class="text-muted">' + escapeHtml(u) + '</small>') +
            '</li>'
          );
        })
        .join('');
      list.classList.remove('d-none');
      highlight(0);
    }

    async function search(query) {
      try {
        const url =
          ENDPOINT +
          '?types=user&q=' + encodeURIComponent(query) +
          '&pageSize=' + PAGE_SIZE;
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) {
          hideResults();
          return;
        }
        const data = await res.json();
        renderResults(data.results || []);
      } catch (err) {
        hideResults();
      }
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (q.length < MIN_CHARS) {
        hideResults();
        return;
      }
      debounceTimer = setTimeout(() => search(q), DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
      const open = !list.classList.contains('d-none');
      if (e.key === 'ArrowDown' && open) {
        e.preventDefault();
        highlight(Math.min(selectedIndex + 1, currentResults.length - 1));
      } else if (e.key === 'ArrowUp' && open) {
        e.preventDefault();
        highlight(Math.max(selectedIndex - 1, 0));
      } else if (e.key === 'Enter' && open && selectedIndex >= 0) {
        e.preventDefault();
        const r = currentResults[selectedIndex];
        const u = r.id || (r.metadata && r.metadata.username);
        addUser(u, r.name || u);
      } else if (e.key === 'Escape') {
        hideResults();
      }
    });

    list.addEventListener('click', (e) => {
      const item = e.target.closest('.audience-result-item');
      if (!item) return;
      addUser(item.dataset.username, item.dataset.displayName);
    });

    // Hover to highlight (mirrors page-autocomplete behaviour).
    list.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.audience-result-item');
      if (!item) return;
      highlight(parseInt(item.dataset.index, 10));
    });

    // Clicking the X on a chip removes it.
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('.audience-user-remove');
      if (!btn) return;
      const chip = btn.closest('.badge');
      if (chip) chip.remove();
    });

    // Click outside closes results.
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) hideResults();
    });
  }

  function initAll() {
    document.querySelectorAll('[data-audience-typeahead]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
