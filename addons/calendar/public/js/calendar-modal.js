/**
 * calendar-modal.js — inline create/edit/delete modal for managed-workflow calendars.
 *
 * Activated when [{Calendar modal='true'}] is used on a wiki page.
 * Requires Bootstrap 5 (loaded by the main layout).
 *
 * Exposes window.calendarModal:
 *   openCreate(dateStr, calendarId) — pre-fill start date from FullCalendar dateClick
 *   openEdit(fcEvent)               — load an existing FullCalendar event for editing
 */
(function () {
  'use strict';

  /* ── Build modal HTML ────────────────────────────────────────────────── */
  const MODAL_ID = 'calModalContainer';

  function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;

    const html = `
<div id="${MODAL_ID}">
  <div class="modal fade" id="calModal" tabindex="-1" aria-labelledby="calModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="calModalLabel">Event</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <form id="calModalForm">
          <input type="hidden" id="calModalEventId">
          <input type="hidden" id="calModalCalendarId">
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Title <span class="text-danger">*</span></label>
              <input type="text" id="calModalTitle" class="form-control" required>
            </div>
            <div class="row">
              <div class="col-sm-6 mb-3">
                <label class="form-label">Start <span class="text-danger">*</span></label>
                <input type="datetime-local" id="calModalStart" class="form-control" required>
              </div>
              <div class="col-sm-6 mb-3">
                <label class="form-label">End</label>
                <input type="datetime-local" id="calModalEnd" class="form-control">
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">Location</label>
              <input type="text" id="calModalLocation" class="form-control">
            </div>
            <div class="mb-3">
              <label class="form-label">Description</label>
              <textarea id="calModalDescription" class="form-control" rows="3"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Status</label>
              <select id="calModalStatus" class="form-select">
                <option value="CONFIRMED">Confirmed</option>
                <option value="TENTATIVE">Tentative</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div id="calModalError" class="alert alert-danger d-none"></div>
          </div>
          <div class="modal-footer" id="calModalFooter">
            <button type="button" class="btn btn-danger me-auto d-none" id="calModalDeleteBtn">
              Delete
            </button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const form = document.getElementById('calModalForm');
    const deleteBtn = document.getElementById('calModalDeleteBtn');
    const errorBox = document.getElementById('calModalError');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.classList.add('d-none');
      const id = document.getElementById('calModalEventId').value;
      const body = {
        calendarId:  document.getElementById('calModalCalendarId').value,
        title:       document.getElementById('calModalTitle').value,
        start:       document.getElementById('calModalStart').value,
        end:         document.getElementById('calModalEnd').value || undefined,
        location:    document.getElementById('calModalLocation').value || undefined,
        description: document.getElementById('calModalDescription').value || undefined,
        status:      document.getElementById('calModalStatus').value
      };
      const url    = id ? '/api/calendar/events/' + id : '/api/calendar/events';
      const method = id ? 'PUT' : 'POST';

      fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('calModal')).hide();
            location.reload();
          } else {
            errorBox.textContent = res.body.error || 'Save failed';
            errorBox.classList.remove('d-none');
          }
        })
        .catch(function (err) {
          errorBox.textContent = err.message || 'Network error';
          errorBox.classList.remove('d-none');
        });
    });

    deleteBtn.addEventListener('click', function () {
      const id = document.getElementById('calModalEventId').value;
      if (!id || !confirm('Delete this event?')) return;
      // #727: DELETE is state-changing — needs the CSRF token (#663
      // app-wide middleware). csrfFetch injects X-CSRF-Token.
      (window.csrfFetch || fetch)('/api/calendar/events/' + id, { method: 'DELETE' })
        .then(function (r) {
          if (r.ok || r.status === 204) {
            bootstrap.Modal.getInstance(document.getElementById('calModal')).hide();
            location.reload();
          } else {
            return r.json().then(function (b) {
              errorBox.textContent = b.error || 'Delete failed';
              errorBox.classList.remove('d-none');
            });
          }
        })
        .catch(function (err) {
          errorBox.textContent = err.message || 'Network error';
          errorBox.classList.remove('d-none');
        });
    });
  }

  /* ── Public API ──────────────────────────────────────────────────────── */

  function openCreate(dateStr, calendarId) {
    ensureModal();
    document.getElementById('calModalLabel').textContent = 'New Event';
    document.getElementById('calModalEventId').value = '';
    document.getElementById('calModalCalendarId').value = calendarId || '';
    document.getElementById('calModalTitle').value = '';
    // dateStr may be 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss'
    document.getElementById('calModalStart').value = (dateStr || '').slice(0, 16);
    document.getElementById('calModalEnd').value = '';
    document.getElementById('calModalLocation').value = '';
    document.getElementById('calModalDescription').value = '';
    document.getElementById('calModalStatus').value = 'CONFIRMED';
    document.getElementById('calModalDeleteBtn').classList.add('d-none');
    document.getElementById('calModalError').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('calModal')).show();
  }

  function openEdit(fcEvent) {
    ensureModal();
    const props = fcEvent.extendedProps || {};
    document.getElementById('calModalLabel').textContent = 'Edit Event';
    document.getElementById('calModalEventId').value = fcEvent.id;
    document.getElementById('calModalCalendarId').value = props.calendarId || '';
    document.getElementById('calModalTitle').value = fcEvent.title || '';
    document.getElementById('calModalStart').value =
      (fcEvent.startStr || '').slice(0, 16);
    document.getElementById('calModalEnd').value =
      (fcEvent.endStr || '').slice(0, 16);
    document.getElementById('calModalLocation').value = props.location || '';
    document.getElementById('calModalDescription').value = props.description || '';
    document.getElementById('calModalStatus').value = props.status || 'CONFIRMED';
    document.getElementById('calModalDeleteBtn').classList.remove('d-none');
    document.getElementById('calModalError').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('calModal')).show();
  }

  window.calendarModal = { openCreate: openCreate, openEdit: openEdit };
}());
