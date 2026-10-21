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
    const ticked = checklistBoxes(group).filter((box) => box.checked);
    const sum = ticked.reduce((acc, box) => acc + (Number.parseInt(box.dataset.amount || '0', 10) || 0), 0);
    drawTotal(form, group, 'checklist', 'Ticked', ticked.length, sum);
  }

  /**
   * Write "<prefix>: N · $sum" into a group's total line and, with a total
   * field, whether the sum matches what was typed there. One drawing for
   * checklists (#1904) and lines (#1913); FormsPlugin's renderTotal draws
   * the lines it writes into.
   */
  function drawTotal(form, group, kind, prefix, count, sum) {
    const totalLine = group.querySelector('[data-' + kind + '-total]');
    if (!totalLine) return;
    const currency = group.dataset.currency || 'USD';
    totalLine.textContent = prefix + ': ' + count + ' · ' + formatMoney(sum, currency);

    const matchLine = group.querySelector('[data-' + kind + '-match]');
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

  // ── Lines (#1913) ─────────────────────────────────────────────────────
  // Rows of sub-fields, each control named `<lines>[<row>].<field>`: the key
  // a refusal comes back under, for this row's error slot.

  function lineRows(group) {
    return Array.from(group.querySelectorAll('[data-lines-row]'));
  }

  /** Rows are never removed below max(1, minRows): an empty row sends nothing anyway. */
  function linesFloor(group) {
    return Math.max(1, Number(group.dataset.minRows) || 0);
  }

  function linesMax(group) {
    return group.dataset.maxRows ? Number(group.dataset.maxRows) : Infinity;
  }

  /** A row's values by sub-field: `lines[2].memo` is `memo`. */
  function rowValues(row) {
    const values = {};
    row.querySelectorAll('[name]').forEach((el) => {
      const name = el.getAttribute('name');
      const sub = name.slice(name.indexOf('].') + 2);
      values[sub] = el.type === 'checkbox' ? (el.checked ? 'on' : '') : el.value;
    });
    return values;
  }

  /** The rows that are sent: fully empty rows at the end are dropped. */
  function keptRows(group) {
    const rows = lineRows(group);
    while (rows.length > 0 && Object.values(rowValues(rows[rows.length - 1])).every((v) => v === '')) rows.pop();
    return rows;
  }

  /** Name each row's controls, labels and error slots for where the row now is. */
  function renumber(group) {
    const prefix = group.dataset.lines + '[';
    lineRows(group).forEach((row, i) => {
      row.querySelectorAll('[name], [id], [for], [data-field-error]').forEach((el) => {
        for (const attr of ['name', 'id', 'for', 'data-field-error']) {
          const value = el.getAttribute(attr);
          const at = value === null ? -1 : value.indexOf(prefix);
          const end = at === -1 ? -1 : value.indexOf('].', at);
          if (end !== -1) el.setAttribute(attr, value.slice(0, at) + prefix + i + value.slice(end));
        }
      });
    });
  }

  /** A new row is a copy of the first, emptied. */
  function addLine(group) {
    const rows = lineRows(group);
    if (rows.length === 0 || rows.length >= linesMax(group)) return;
    const fresh = rows[0].cloneNode(true);
    fresh.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.type === 'checkbox') el.checked = false;
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
      el.classList.remove('is-invalid');
    });
    fresh.querySelectorAll('[data-field-error]').forEach((el) => { el.textContent = ''; });
    rows[rows.length - 1].after(fresh);
    renumber(group);
  }

  function removeLine(group, row) {
    if (!row || lineRows(group).length <= linesFloor(group)) return;
    row.remove();
    renumber(group);
  }

  /** The buttons at the limits, and "Lines: N · $sum" from the amount sub-field. */
  function refreshLines(form, group) {
    const rows = lineRows(group);
    const floor = linesFloor(group);
    rows.forEach((row) => {
      const remove = row.querySelector('[data-lines-remove]');
      if (remove) remove.disabled = rows.length <= floor;
    });
    const add = group.querySelector('[data-lines-add]');
    if (add) add.disabled = rows.length >= linesMax(group);
    const amountField = group.dataset.amountField;
    if (!amountField) return;
    const kept = keptRows(group);
    const sum = kept.reduce((acc, row) => acc + (parseAmount(rowValues(row)[amountField] ?? '') ?? 0), 0);
    drawTotal(form, group, 'lines', 'Lines', kept.length, sum);
  }

  /** The row count the server holds a lines field to. Returns the message, or ''. */
  function linesError(group) {
    const label = group.dataset.label || 'This field';
    const count = keptRows(group).length;
    const min = Number(group.dataset.minRows) || 0;
    if (group.dataset.required && count === 0) return label + ': add at least one line';
    if (count < min) return label + ': add at least ' + min + ' lines';
    if (count > linesMax(group)) return label + ': no more than ' + group.dataset.maxRows + ' lines';
    return '';
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
    const lineGroups = Array.from(form.querySelectorAll('[data-lines]'));
    const linePrefixes = lineGroups.map((group) => group.dataset.lines + '[');
    const refreshTotals = () => {
      checklists.forEach((group) => updateChecklistTotal(form, group));
      lineGroups.forEach((group) => refreshLines(form, group));
    };
    if (checklists.length > 0 || lineGroups.length > 0) {
      // One listener each for the whole form: a ticked box, a typed amount, or a typed total.
      form.addEventListener('change', refreshTotals);
      form.addEventListener('input', refreshTotals);
      form.addEventListener('reset', () => setTimeout(refreshTotals, 0));
      refreshTotals();
    }
    if (lineGroups.length > 0) {
      // "+ Add line" and each row's Remove, through one listener (no inline handlers).
      form.addEventListener('click', (e) => {
        const button = e.target.closest ? e.target.closest('[data-lines-add], [data-lines-remove]') : null;
        const group = button ? button.closest('[data-lines]') : null;
        if (!group) return;
        if (button.matches('[data-lines-add]')) addLine(group);
        else removeLine(group, button.closest('[data-lines-row]'));
        refreshLines(form, group);
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // One request at a time: a second click, Enter or requestSubmit() while
      // the first is in flight posts nothing (#1893).
      if (inFlight) return;

      // A required checklist with nothing ticked, or lines too few or too
      // many, is refused next to the field.
      clearFieldErrors(form);
      const refused = {};
      for (const group of checklists) {
        const message = checklistError(group);
        if (message) refused[group.dataset.checklist] = message;
      }
      for (const group of lineGroups) {
        const message = linesError(group);
        if (message) refused[group.dataset.lines] = message;
      }
      if (Object.keys(refused).length > 0) {
        form.classList.add('was-validated');
        showFieldErrors(form, refused);
        return;
      }

      // Client-side HTML5 validation. Empty rows at the end are not sent, so
      // their required sub-fields are left out of it.
      const dropped = lineGroups
        .flatMap((group) => lineRows(group).slice(keptRows(group).length))
        .flatMap((row) => Array.from(row.querySelectorAll('input, select, textarea')));
      dropped.forEach((el) => { el.disabled = true; });
      const valid = form.checkValidity();
      dropped.forEach((el) => { el.disabled = false; });
      if (!valid) {
        form.classList.add('was-validated');
        return;
      }
      form.classList.remove('was-validated');

      // Collect form data — handle nested onBehalfOf[name] keys
      const raw = new FormData(form);
      const data = {};
      // A checklist is always an array of the ticked values, even when empty.
      for (const name of checklistNames) data[name] = [];
      // Lines are an array of row objects, the sent rows only.
      for (const group of lineGroups) data[group.dataset.lines] = keptRows(group).map(rowValues);
      for (const [key, value] of raw.entries()) {
        if (linePrefixes.some((prefix) => key.startsWith(prefix))) continue;
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
