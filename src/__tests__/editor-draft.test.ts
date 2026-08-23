/**
 * @vitest-environment jsdom
 *
 * #1083 Option A — the editor is a plain POST form (`views/_basicEditor.ejs`),
 * so closing the tab, a browser crash, or a session expiring mid-edit loses
 * everything typed. No autosave, no draft, no `beforeunload` guard.
 *
 * These test the real `public/js/editor-draft.js` in jsdom rather than a
 * reimplementation, because the value of a draft feature is entirely in its
 * edge cases: keying so a section edit never restores into a full-page edit,
 * and refusing to silently restore a draft written against a version of the
 * page that has since changed. Getting either wrong turns a safety net into
 * the silent clobber #1061's conflict check exists to prevent.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../../public/js/editor-draft.js');

interface DraftApi {
  draftKey(page: string, uuid: string | null, section: string | null): string;
  save(key: string, body: { content: string; baseLastModified: string | null }): boolean;
  load(key: string): { content: string; baseLastModified: string | null; savedAt: number } | null;
  clear(key: string): void;
  evaluate(
    draft: { content: string; baseLastModified: string | null } | null,
    current: { content: string; baseLastModified: string | null }
  ): { action: 'none' | 'offer' | 'offer-stale'; };
}

function loadModule(): DraftApi {
  // Evaluate the shipped file exactly as a browser would, against jsdom's real
  // window — so these test the file that actually gets served, not a copy.
  const code = readFileSync(SOURCE, 'utf8');
  vm.runInNewContext(code, {
    window: globalThis.window,
    globalThis: globalThis.window,
    document: globalThis.document
  });
  return (globalThis.window as unknown as { EditorDraft: DraftApi }).EditorDraft;
}

describe('editor-draft.js', () => {
  let EditorDraft: DraftApi;

  beforeEach(() => {
    globalThis.localStorage.clear();
    EditorDraft = loadModule();
  });

  describe('draftKey', () => {
    it('prefers the uuid, which survives a page being renamed', () => {
      expect(EditorDraft.draftKey('My Page', 'uuid-1', null)).toContain('uuid-1');
    });

    it('falls back to the page name when there is no uuid (a new page)', () => {
      expect(EditorDraft.draftKey('My Page', null, null)).toContain('My Page');
    });

    it('keys a section edit separately from a full-page edit', () => {
      // Critical: a section edit's content is a FRAGMENT. Restoring it into a
      // full-page edit would replace the whole page with one section — data
      // loss dressed up as a recovery feature.
      const full = EditorDraft.draftKey('My Page', 'uuid-1', null);
      const section = EditorDraft.draftKey('My Page', 'uuid-1', '2');
      expect(section).not.toBe(full);
    });

    it('keys different sections separately from each other', () => {
      expect(EditorDraft.draftKey('P', 'u', '1')).not.toBe(EditorDraft.draftKey('P', 'u', '2'));
    });

    it('is stable for the same inputs', () => {
      expect(EditorDraft.draftKey('P', 'u', '1')).toBe(EditorDraft.draftKey('P', 'u', '1'));
    });
  });

  describe('save / load / clear', () => {
    it('round-trips a draft', () => {
      const key = EditorDraft.draftKey('P', 'u', null);
      EditorDraft.save(key, { content: 'hello', baseLastModified: 'T1' });
      expect(EditorDraft.load(key)).toMatchObject({ content: 'hello', baseLastModified: 'T1' });
    });

    it('stamps the draft so the UI can say how old it is', () => {
      const key = EditorDraft.draftKey('P', 'u', null);
      EditorDraft.save(key, { content: 'hello', baseLastModified: 'T1' });
      expect(typeof EditorDraft.load(key)?.savedAt).toBe('number');
    });

    it('returns null for a key with no draft', () => {
      expect(EditorDraft.load('nope')).toBeNull();
    });

    it('returns null rather than throwing on corrupt stored JSON', () => {
      globalThis.localStorage.setItem('corrupt', '{not json');
      expect(EditorDraft.load('corrupt')).toBeNull();
    });

    it('clear removes the draft', () => {
      const key = EditorDraft.draftKey('P', 'u', null);
      EditorDraft.save(key, { content: 'hello', baseLastModified: 'T1' });
      EditorDraft.clear(key);
      expect(EditorDraft.load(key)).toBeNull();
    });

    it('save reports false instead of throwing when storage throws', () => {
      // Private browsing and quota-exceeded both throw on setItem. Losing the
      // draft is acceptable; breaking the editor is not.
      //
      // The whole object is substituted rather than patching setItem, because
      // jsdom's Storage is a Proxy that turns a property assignment into a
      // stored ITEM — patching it writes a key called "setItem" and leaves the
      // real method in place, so the test would pass against broken code.
      const original = Object.getOwnPropertyDescriptor(globalThis.window, 'localStorage');
      Object.defineProperty(globalThis.window, 'localStorage', {
        configurable: true,
        value: {
          setItem: () => { throw new Error('QuotaExceededError'); },
          getItem: () => null,
          removeItem: () => undefined
        }
      });
      try {
        const scoped = loadModule();
        expect(scoped.save('k', { content: 'x', baseLastModified: null })).toBe(false);
      } finally {
        if (original) Object.defineProperty(globalThis.window, 'localStorage', original);
      }
    });

    it('save reports false when there is no storage at all', () => {
      const original = Object.getOwnPropertyDescriptor(globalThis.window, 'localStorage');
      Object.defineProperty(globalThis.window, 'localStorage', { configurable: true, value: null });
      try {
        const scoped = loadModule();
        expect(scoped.save('k', { content: 'x', baseLastModified: null })).toBe(false);
        expect(scoped.load('k')).toBeNull();
      } finally {
        if (original) Object.defineProperty(globalThis.window, 'localStorage', original);
      }
    });
  });

  describe('evaluate — whether to offer a restore', () => {
    it('offers nothing when there is no draft', () => {
      expect(EditorDraft.evaluate(null, { content: 'a', baseLastModified: 'T1' }).action).toBe('none');
    });

    it('offers nothing when the draft matches what is already in the box', () => {
      // The common case: saved successfully, came back, nothing to recover.
      const draft = { content: 'same', baseLastModified: 'T1' };
      expect(EditorDraft.evaluate(draft, { content: 'same', baseLastModified: 'T1' }).action).toBe('none');
    });

    it('offers a restore when the draft differs and was based on the current version', () => {
      const draft = { content: 'my unsaved work', baseLastModified: 'T1' };
      expect(EditorDraft.evaluate(draft, { content: 'server text', baseLastModified: 'T1' }).action)
        .toBe('offer');
    });

    it('warns instead when the page changed after the draft was written', () => {
      // The draft is now a divergent copy. Restoring it silently would paste
      // over someone else's edit — exactly the clobber #1061 exists to stop.
      const draft = { content: 'my unsaved work', baseLastModified: 'T1' };
      expect(EditorDraft.evaluate(draft, { content: 'server text', baseLastModified: 'T2' }).action)
        .toBe('offer-stale');
    });

    it('treats a draft with no base token as stale rather than assuming it is current', () => {
      const draft = { content: 'work', baseLastModified: null };
      expect(EditorDraft.evaluate(draft, { content: 'server', baseLastModified: 'T1' }).action)
        .toBe('offer-stale');
    });

    it('offers a normal restore on a new page, where neither side has a token', () => {
      // A page being created has no lastModified on either side; that is not
      // staleness, it is just a new page.
      const draft = { content: 'draft of new page', baseLastModified: null };
      expect(EditorDraft.evaluate(draft, { content: '', baseLastModified: null }).action)
        .toBe('offer');
    });

    it('ignores a whitespace-only draft', () => {
      const draft = { content: '   \n  ', baseLastModified: 'T1' };
      expect(EditorDraft.evaluate(draft, { content: '', baseLastModified: 'T1' }).action).toBe('none');
    });
  });
});
