/**
 * One in-page message box for errors, warnings, progress and confirmations
 * (#1369, #1327, #1333).
 *
 *   showPageMessage('error', 'Save failed', ['line 9: unclosed link'])
 *   showPageMessage('info', 'Saving changes…', null, { dismissible: false })
 *   clearPageMessage()
 *
 * level: 'error' | 'warning' | 'success' | 'info' → Bootstrap alert-danger /
 * -warning / -success / -info. Text only — message and details are set with
 * textContent, never parsed as HTML.
 *
 * The box goes in `#page-message` when the page has one, otherwise at the top
 * of the first `.container-fluid` / `.container` / `main`. One box per page:
 * a new message replaces the old one.
 */
(function () {
  const LEVEL_CLASS = { error: 'danger', warning: 'warning', success: 'success', info: 'info' };
  const LEVEL_ICON = {
    error: 'fa-exclamation-triangle',
    warning: 'fa-exclamation-circle',
    success: 'fa-check-circle',
    info: 'fa-info-circle'
  };

  function host() {
    let el = document.getElementById('page-message');
    if (el) return el;
    const parent = document.querySelector('.container-fluid, .container, main') || document.body;
    el = document.createElement('div');
    el.id = 'page-message';
    parent.insertBefore(el, parent.firstChild);
    return el;
  }

  function clearPageMessage() {
    const el = document.getElementById('page-message');
    if (el) el.replaceChildren();
  }

  function showPageMessage(level, message, details, options) {
    const opts = options || {};
    const kind = LEVEL_CLASS[level] ? level : 'info';
    const dismissible = opts.dismissible !== false;

    const box = document.createElement('div');
    box.className = 'alert alert-' + LEVEL_CLASS[kind] + ' d-flex align-items-start mb-3'
      + (dismissible ? ' alert-dismissible' : '');
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    box.dataset.level = kind;

    const icon = document.createElement('i');
    icon.className = 'fas ' + LEVEL_ICON[kind] + ' me-2 mt-1 flex-shrink-0';
    icon.setAttribute('aria-hidden', 'true');
    box.appendChild(icon);

    const body = document.createElement('div');
    const text = document.createElement('div');
    text.className = 'page-message-text';
    text.textContent = message;
    body.appendChild(text);
    if (Array.isArray(details) && details.length > 0) {
      const list = document.createElement('ul');
      list.className = 'page-message-details mb-0 mt-1';
      details.forEach(function (d) {
        const li = document.createElement('li');
        li.textContent = d;
        list.appendChild(li);
      });
      body.appendChild(list);
    }
    box.appendChild(body);

    if (dismissible) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'btn-close';
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', function () { box.remove(); });
      box.appendChild(close);
    }

    const el = host();
    el.replaceChildren(box);
    if (opts.scroll !== false) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return box;
  }

  window.showPageMessage = showPageMessage;
  window.clearPageMessage = clearPageMessage;
})();
