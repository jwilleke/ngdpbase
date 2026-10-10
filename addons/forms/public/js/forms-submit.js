'use strict';

(function () {
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

  function initForm(formWrapper) {
    const formId = formWrapper.dataset.ngdpForm;
    const form   = formWrapper.closest('.ngdp-form')?.querySelector('form') ?? formWrapper.querySelector('form');
    const result = document.getElementById('form-result-' + formId);
    if (!form || !result) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Client-side HTML5 validation
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
      }
      form.classList.remove('was-validated');

      // Collect form data — handle nested onBehalfOf[name] keys
      const raw = new FormData(form);
      const data = {};
      for (const [key, value] of raw.entries()) {
        const nested = key.match(/^(\w+)\[(\w+)\]$/);
        if (nested) {
          if (!data[nested[1]]) data[nested[1]] = {};
          data[nested[1]][nested[2]] = value;
        } else {
          data[key] = value;
        }
      }

      clearFieldErrors(form);
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
