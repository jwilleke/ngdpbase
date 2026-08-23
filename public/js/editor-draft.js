/**
 * Editor draft persistence (#1083, Option A).
 *
 * The editor (`views/_basicEditor.ejs`) is a plain POST form: no autosave, no
 * draft, no `beforeunload` guard. Close the tab, crash the browser, or let a
 * session expire mid-edit and everything typed is gone.
 *
 * This keeps a copy of the textarea in `localStorage` while you type and
 * offers it back when you reopen the editor. Nothing is sent to the server and
 * the save path is untouched, which is the point of doing this before real
 * server-side autosave (Option B): almost all of that feature's complexity is
 * in the interaction between autosave and conflict detection, and a local
 * draft removes the data-loss risk without entering it.
 *
 * ## Two things this must not get wrong
 *
 * **Keying.** A section edit's content is a *fragment*. Restoring one into a
 * full-page edit would replace the whole page with a single section — data
 * loss dressed up as a recovery feature. Full-page and per-section drafts are
 * therefore separate keys, and the uuid is preferred over the title so a draft
 * survives the page being renamed.
 *
 * **Staleness.** A draft carries the `baseLastModified` it was written
 * against. If the page has moved on since, restoring silently would paste over
 * whatever someone else saved — precisely the clobber #1061's conflict check
 * exists to prevent. Such a draft is still offered, because it is the user's
 * own work and discarding it would be worse, but it is offered as a divergent
 * copy with the difference stated, and restoring it is a deliberate act.
 *
 * Every storage call is guarded: private browsing and quota-exceeded both
 * throw on `setItem`. Losing a draft is acceptable; breaking the editor is not.
 */
(function (global) {
  'use strict';

  const PREFIX = 'ngdpbase:draft:';
  const DEBOUNCE_MS = 1000;

  /** localStorage, or null when unavailable (private mode, disabled storage). */
  function storage() {
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  /**
   * Storage key for one editing surface.
   *
   * Prefers the uuid, which is stable across renames. Falls back to the page
   * name for a page being created, which has no uuid yet. A section index —
   * when present — is part of the key, never merged with the full-page draft.
   */
  function draftKey(pageName, uuid, section) {
    const subject = uuid || pageName || 'unknown';
    const scope = (section === null || section === undefined || section === '')
      ? 'full'
      : 'section-' + section;
    return PREFIX + subject + ':' + scope;
  }

  function save(key, body) {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(key, JSON.stringify({
        content: body.content,
        baseLastModified: body.baseLastModified || null,
        savedAt: Date.now()
      }));
      return true;
    } catch {
      // Quota exceeded or storage disabled. The editor keeps working.
      return false;
    }
  }

  function load(key) {
    const store = storage();
    if (!store) return null;
    try {
      const raw = store.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.content !== 'string') return null;
      return {
        content: parsed.content,
        baseLastModified: parsed.baseLastModified || null,
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
      };
    } catch {
      // Corrupt entry — treat as absent rather than breaking the editor.
      return null;
    }
  }

  function clear(key) {
    const store = storage();
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      // ignore
    }
  }

  /**
   * Decide what to do with a stored draft.
   *
   * - `none`        — nothing worth restoring (no draft, empty, or identical
   *                   to what the server already gave us).
   * - `offer`       — a real difference, written against the version now open.
   * - `offer-stale` — a real difference, but the page changed underneath. Still
   *                   the user's work, so still offered — with the divergence
   *                   made explicit rather than pasted over their colleague's
   *                   save.
   */
  function evaluate(draft, current) {
    if (!draft || typeof draft.content !== 'string') return { action: 'none' };
    if (draft.content.trim() === '') return { action: 'none' };
    if (draft.content === current.content) return { action: 'none' };

    const draftBase = draft.baseLastModified || null;
    const currentBase = current.baseLastModified || null;

    // Neither side has a token: a page being created. Not staleness.
    if (draftBase === null && currentBase === null) return { action: 'offer' };

    // A draft with no token cannot be shown to match the current version, and
    // assuming it does is the unsafe direction.
    if (draftBase !== currentBase) return { action: 'offer-stale' };

    return { action: 'offer' };
  }

  const EditorDraft = { draftKey, save, load, clear, evaluate, DEBOUNCE_MS };
  global.EditorDraft = EditorDraft;
})(typeof window !== 'undefined' ? window : globalThis);
