'use strict';

(function () {
  // #1893: FormsPlugin writes a <script> tag per form, so on a page with N
  // forms this file runs N times. Only the first run sets the page up.
  if (window.__ngdpFormsSubmitLoaded) return;
  window.__ngdpFormsSubmitLoaded = true;

  // Messages are set as text, never as HTML: a handler's error may echo what was typed.
  function showAlert(result, kind, icon, message, reauth) {
    result.replaceChildren();
    const box = document.createElement('div');
    box.className = 'alert alert-' + kind;
    const i = document.createElement('i');
    i.className = 'fas ' + icon + ' me-2';
    box.append(i, document.createTextNode(message));
    // A step-up refusal (#1745): the way to re-authenticate, back to this page.
    if (typeof reauth === 'string' && reauth.startsWith('/auth/reauth?')) {
      const link = document.createElement('a');
      link.href = reauth;
      link.className = 'alert-link ms-2';
      link.textContent = 'Sign in again';
      box.append(link);
    }
    result.append(box);
  }

  function clearFieldErrors(form) {
    form.querySelectorAll('[data-field-error]').forEach((el) => { el.textContent = ''; });
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  }

  function showFieldErrors(form, fields) {
    if (!fields || typeof fields !== 'object') return;
    for (const [name, message] of Object.entries(fields)) {
      const slot = Array.from(form.querySelectorAll('[data-field-error]')).find((el) => el.dataset.fieldError === name);
      if (slot) slot.textContent = String(message);
      const input = form.elements.namedItem(name);
      if (input && input.classList) input.classList.add('is-invalid');
    }
  }

  // ── Checklists (#1904) ────────────────────────────────────────────────
  // The browser cannot call core's formatMoney or the add-on's parseAmount, so
  // these two follow them line for line; formsSubmitJs.test.ts holds each to
  // the original.

  /** formatMoney (core pluginFormatters): whole minor units, shown in the currency. */
  function formatMoney(minorUnits, currency) {
    try {
      const format = new Intl.NumberFormat('en-US', { style: 'currency', currency });
      const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
      return format.format(minorUnits / 10 ** digits);
    } catch {
      const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minorUnits / 100);
      return number + ' ' + currency;
    }
  }

  /** parseAmount (FormsDataManager): `$1,250.50` to 125050 cents, or null. */
  function parseAmount(raw) {
    const text = String(raw).trim().replace(/^\$/, '').replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    const [whole, frac = ''] = text.split('.');
    const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  }

  function checklistBoxes(group) {
    return Array.from(group.querySelectorAll('input[type=checkbox]'));
  }

  /** Redraw "Ticked: N · $sum" and, with a total field, whether the sum matches it. */
  function updateChecklistTotal(form, group) {
    const totalLine = group.querySelector('[data-checklist-total]');
    if (!totalLine) return;
    const currency = group.dataset.currency || 'USD';
    const ticked = checklistBoxes(group).filter((box) => box.checked);
    const sum = ticked.reduce((acc, box) => acc + (Number.parseInt(box.dataset.amount || '0', 10) || 0), 0);
    totalLine.textContent = 'Ticked: ' + ticked.length + ' · ' + formatMoney(sum, currency);

    const matchLine = group.querySelector('[data-checklist-match]');
    const totalName = group.dataset.totalField;
    if (!matchLine || !totalName) return;
    const totalInput = form.elements.namedItem(totalName);
    const typed = totalInput && 'value' in totalInput ? parseAmount(totalInput.value) : null;
    matchLine.classList.remove('text-success', 'text-danger');
    if (typed === null) {
      matchLine.textContent = 'Enter the total to compare.';
    } else if (typed === sum) {
      matchLine.textContent = 'Matches the total of ' + formatMoney(typed, currency) + '.';
      matchLine.classList.add('text-success');
    } else {
      matchLine.textContent = 'Does not match the total of ' + formatMoney(typed, currency) + '.';
      matchLine.classList.add('text-danger');
    }
  }

  /**
   * A required checklist needs one box ticked. The boxes carry no `required`
   * (that would mean every box), so the first one carries the refusal.
   * Returns the message, or '' when the group is fine.
   */
  function checklistError(group) {
    if (!group.dataset.required) return '';
    const boxes = checklistBoxes(group);
    const message = boxes.some((box) => box.checked) ? '' : (group.dataset.label || 'This field') + ': tick at least one';
    if (boxes[0]) boxes[0].setCustomValidity(message);
    return message;
  }

  function initForm(formWrapper) {
    const formId = formWrapper.dataset.ngdpForm;
    const form   = formWrapper.closest('.ngdp-form')?.querySelector('form') ?? formWrapper.querySelector('form');
    const result = document.getElementById('form-result-' + formId);
    if (!form || !result) return;
    // #1893: bind each form once, whichever path (page load or the
    // MutationObserver) reaches it, however often.
    if (form.dataset.ngdpBound) return;
    form.dataset.ngdpBound = '1';
    let inFlight = false;

    const checklists = Array.from(form.querySelectorAll('[data-checklist]'));
    const checklistNames = new Set(checklists.map((group) => group.dataset.checklist));
    const refreshChecklists = () => checklists.forEach((group) => updateChecklistTotal(form, group));
    if (checklists.length > 0) {
      // One listener each for the whole form: a ticked box, or a typed total.
      form.addEventListener('change', refreshChecklists);
      form.addEventListener('input', refreshChecklists);
      form.addEventListener('reset', () => setTimeout(refreshChecklists, 0));
      refreshChecklists();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // One request at a time: a second click, Enter or requestSubmit() while
      // the first is in flight posts nothing (#1893).
      if (inFlight) return;

      // A required checklist with nothing ticked is refused next to it.
      clearFieldErrors(form);
      const unticked = {};
      for (const group of checklists) {
        const message = checklistError(group);
        if (message) unticked[group.dataset.checklist] = message;
      }
      if (Object.keys(unticked).length > 0) {
        form.classList.add('was-validated');
        showFieldErrors(form, unticked);
        return;
      }

      // Client-side HTML5 validation
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
      }
      form.classList.remove('was-validated');

      // Collect form data — handle nested onBehalfOf[name] keys
      const raw = new FormData(form);
      const data = {};
      // A checklist is always an array of the ticked values, even when empty.
      for (const name of checklistNames) data[name] = [];
      for (const [key, value] of raw.entries()) {
        if (checklistNames.has(key)) {
          data[key].push(value);
          continue;
        }
        const nested = key.match(/^(\w+)\[(\w+)\]$/);
        if (nested) {
          if (!data[nested[1]]) data[nested[1]] = {};
          data[nested[1]][nested[2]] = value;
        } else {
          data[key] = value;
        }
      }

      clearFieldErrors(form);
      inFlight = true;
      const btn = form.querySelector('[type=submit]');
      if (btn) btn.disabled = true;
      result.innerHTML = '<div class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Submitting…</div>';

      try {
        // #727: form submission is state-changing — needs the CSRF
        // token (#663 app-wide middleware). csrfFetch injects
        // X-CSRF-Token; without it the POST gets a text/plain 403.
        const res = await (window.csrfFetch || fetch)('/api/forms/submit/' + encodeURIComponent(formId), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(data),
        });
        const json = await res.json();

        if (json.ok) {
          form.reset();
          form.classList.add('d-none');
          showAlert(result, 'success', 'fa-check-circle', 'Your submission was received. Thank you!');
        } else {
          // What was typed stays in the form; each field's message goes next to it.
          showFieldErrors(form, json.fields);
          showAlert(result, 'danger', 'fa-exclamation-circle', json.error || 'Submission failed. Please try again.', json.reauth);
          if (btn) btn.disabled = false;
        }
      } catch {
        showAlert(result, 'danger', 'fa-exclamation-circle', 'Network error — please try again.');
        if (btn) btn.disabled = false;
      } finally {
        inFlight = false;
      }
    });
  }

  // Init all forms on page load
  document.querySelectorAll('[data-ngdp-form]').forEach(initForm);

  // Support dynamic injection (e.g. via wiki plugin re-render)
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node;
          if (el.dataset?.ngdpForm) initForm(el);
          el.querySelectorAll?.('[data-ngdp-form]').forEach(initForm);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
