'use strict';

(function () {
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
          result.innerHTML = '<div class="alert alert-success"><i class="fas fa-check-circle me-2"></i>Your submission was received. Thank you!</div>';
        } else {
          result.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-circle me-2"></i>' +
            (json.error || 'Submission failed. Please try again.') + '</div>';
          if (btn) btn.disabled = false;
        }
      } catch {
        result.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-circle me-2"></i>Network error — please try again.</div>';
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
