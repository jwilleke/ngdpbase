/**
 * The Trail dropdown in the header (#2390): the last ten places the person
 * has been, newest first. A wiki page is stored under its name and opens
 * /view/<name>. Any other screen is stored under its heading and opens its own
 * path. Its query string is not kept: it can carry a one-time token.
 *
 * An entry is { page, title, timestamp } and, for a screen that is not a wiki
 * page, `path`. Entries stored before `path` existed are wiki pages.
 *
 * header.ejs defines ngdpCurrentPageRaw() (the wiki page's encoded name, or
 * undefined off a wiki page) and calls ngdpTrail.init() once the DOM is ready.
 */
(function () {
  'use strict';
  var KEY = 'navigationTrail';
  var MAX = 10;
  var RECENT_MS = 300000;

  function load() {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  var trail = load();

  function save() {
    localStorage.setItem(KEY, JSON.stringify(trail));
  }

  function same(a, b) {
    return a.page === b.page && (a.path || '') === (b.path || '');
  }

  // Only a path on this site is ever linked.
  function safePath(p) {
    return typeof p === 'string' && p.charAt(0) === '/' && p.charAt(1) !== '/' && p.indexOf('\\') === -1;
  }

  function hrefOf(item) {
    if (item.path !== undefined) return safePath(item.path) ? item.path : null;
    return '/view/' + encodeURIComponent(item.page);
  }

  function clean(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  // The screen's heading: its first h1, else the title in the header bar, else its path.
  function headingOf(path) {
    var h1 = document.querySelector('h1');
    var t = h1 ? clean(h1.textContent) : '';
    if (!t) {
      var h5 = document.querySelector('.navigation-title h5');
      var node = h5 && h5.firstChild;
      t = node && node.nodeType === 3 ? clean(node.nodeValue) : '';
    }
    return t || path;
  }

  function current() {
    var raw = typeof window.ngdpCurrentPageRaw === 'function' ? window.ngdpCurrentPageRaw(false) : undefined;
    if (raw) {
      var name = decodeURIComponent(raw);
      return { page: name, title: name };
    }
    var path = window.location.pathname;
    return { page: path, title: headingOf(path), path: path };
  }

  function clear() {
    trail = [];
    localStorage.removeItem(KEY);
    render();
  }

  function add(entry) {
    if (trail.length > 0 && same(trail[0], entry)) return;
    trail = trail.filter(function (item) { return !same(item, entry); });
    trail.unshift(Object.assign({ timestamp: Date.now() }, entry));
    trail = trail.slice(0, MAX);
    save();
  }

  function render() {
    var dropdown = document.getElementById('breadcrumbTrail');
    if (!dropdown) return;
    dropdown.textContent = '';
    var here = current();
    var shown = trail.filter(function (item) { return !same(item, here) && hrefOf(item) !== null; });

    if (shown.length === 0) {
      var empty = document.createElement('li');
      var note = document.createElement('span');
      note.className = 'dropdown-item-text text-muted';
      note.textContent = 'No trail available';
      empty.appendChild(note);
      dropdown.appendChild(empty);
      return;
    }

    shown.forEach(function (item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'dropdown-item';
      a.href = hrefOf(item);
      var icon = document.createElement('i');
      icon.className = 'fas ' + (item.path !== undefined ? 'fa-link' : 'fa-file-alt') + ' me-2';
      a.appendChild(icon);
      a.appendChild(document.createTextNode(item.path !== undefined ? item.title : item.page));
      if (Date.now() - item.timestamp < RECENT_MS) {
        var recent = document.createElement('small');
        recent.className = 'text-muted';
        recent.textContent = '(recent)';
        a.appendChild(document.createTextNode(' '));
        a.appendChild(recent);
      }
      li.appendChild(a);
      dropdown.appendChild(li);
    });

    var sep = document.createElement('li');
    var hr = document.createElement('hr');
    hr.className = 'dropdown-divider';
    sep.appendChild(hr);
    dropdown.appendChild(sep);

    var clearLi = document.createElement('li');
    var clearA = document.createElement('a');
    clearA.className = 'dropdown-item text-danger';
    clearA.href = '#';
    var trash = document.createElement('i');
    trash.className = 'fas fa-trash me-2';
    clearA.appendChild(trash);
    clearA.appendChild(document.createTextNode('Clear Trail'));
    clearA.addEventListener('click', function (e) {
      e.preventDefault();
      clear();
    });
    clearLi.appendChild(clearA);
    dropdown.appendChild(clearLi);
  }

  function init() {
    add(current());
    render();
  }

  window.ngdpTrail = { init: init, clear: clear };
})();
