/**
 * #848 part 3 — "why isn't my file showing?" for a single path.
 *
 * Every branch here is a reason #814 saw as data loss, so each gets a case.
 * The ordering tests are the ones that matter most: the answer must be the
 * reason the scanner ACTUALLY stopped, not the first rule that happens to
 * match, or the probe sends the operator to fix the wrong thing.
 */
import { describe, test, expect } from 'vitest';
import { explainMediaPath, scanRootFor, type MediaPathRules } from '../explainMediaPath.js';

const RULES: MediaPathRules = {
  folders: ['/media/photos'],
  ignoreDirs: ['.dtrash', '.ts'],
  maxDepth: 0,
  extensions: new Set(['jpg', 'png', 'heic', 'mp4'])
};

const P = '/media/photos/2024/IMG_1234.jpg';

describe('scanRootFor', () => {
  test('finds the containing root', () => {
    expect(scanRootFor(P, ['/media/photos'])).toBe('/media/photos');
  });

  test('does not treat a sibling with a shared prefix as containing', () => {
    // `/media/photos-old` must not be matched by the root `/media/photos`.
    expect(scanRootFor('/media/photos-old/a.jpg', ['/media/photos'])).toBeNull();
  });

  test('prefers the longest matching root when they nest', () => {
    expect(scanRootFor('/media/photos/2024/a.jpg', ['/media', '/media/photos']))
      .toBe('/media/photos');
  });

  test('returns null for no folders', () => {
    expect(scanRootFor(P, [])).toBeNull();
  });
});

describe('explainMediaPath', () => {
  describe('states before rules', () => {
    test('indexed wins over everything', () => {
      // Answer "it is here" before explaining rules it also satisfies.
      const out = explainMediaPath('/nowhere/near/a/root.jpg', RULES, { indexedId: 'abc' });
      expect(out.verdict).toBe('indexed');
      expect(out.itemId).toBe('abc');
    });

    test('alternate names the primary it was folded into', () => {
      const out = explainMediaPath('/media/photos/a.png', RULES, {
        alternateOf: { id: 'id1', filePath: '/media/photos/a.jpg' }
      });
      expect(out.verdict).toBe('alternate');
      expect(out.primaryPath).toBe('/media/photos/a.jpg');
      expect(out.detail).toContain('a.jpg');
    });
  });

  test('outside every scan folder', () => {
    const out = explainMediaPath('/home/jim/holiday.jpg', RULES);
    expect(out.verdict).toBe('not-in-scanned-folder');
  });

  describe('file-level rules', () => {
    test('dotfile', () => {
      expect(explainMediaPath('/media/photos/.hidden.jpg', RULES).verdict).toBe('dotfile');
    });

    test('unsupported extension names the extension', () => {
      const out = explainMediaPath('/media/photos/notes.txt', RULES);
      expect(out.verdict).toBe('extension');
      expect(out.matched).toBe('txt');
    });

    test('no extension at all is reported, not crashed on', () => {
      const out = explainMediaPath('/media/photos/README', RULES);
      expect(out.verdict).toBe('extension');
      expect(out.matched).toBe('(none)');
    });

    test('extension matching is case-insensitive', () => {
      expect(explainMediaPath('/media/photos/IMG.JPG', RULES).verdict)
        .toBe('eligible-not-indexed');
    });
  });

  describe('directory rules', () => {
    test('an ignored directory anywhere in the path', () => {
      const out = explainMediaPath('/media/photos/.dtrash/old/a.jpg', RULES);
      expect(out.verdict).toBe('ignore-dir');
      expect(out.matched).toBe('.dtrash');
    });

    test('maxDepth 0 means unlimited', () => {
      expect(explainMediaPath('/media/photos/a/b/c/d/e/f.jpg', RULES).verdict)
        .toBe('eligible-not-indexed');
    });

    test('beyond maxDepth reports how deep it actually is', () => {
      const out = explainMediaPath('/media/photos/a/b/c/f.jpg', { ...RULES, maxDepth: 2 });
      expect(out.verdict).toBe('max-depth');
      expect(out.matched).toBe('3');
    });

    test('exactly at maxDepth is still eligible', () => {
      // Off-by-one here would hide a whole directory level from the operator.
      expect(explainMediaPath('/media/photos/a/b/f.jpg', { ...RULES, maxDepth: 2 }).verdict)
        .toBe('eligible-not-indexed');
    });

    test('a file directly in the scan root is depth 0', () => {
      expect(explainMediaPath('/media/photos/f.jpg', { ...RULES, maxDepth: 1 }).verdict)
        .toBe('eligible-not-indexed');
    });
  });

  describe('caller-supplied facts', () => {
    test('ignore pattern names the pattern that matched', () => {
      const out = explainMediaPath(P, RULES, { ignorePatternMatch: '*.jpg' });
      expect(out.verdict).toBe('ignore-pattern');
      expect(out.matched).toBe('*.jpg');
    });

    test('ignore keyword', () => {
      expect(explainMediaPath(P, RULES, { hasIgnoreKeyword: true }).verdict)
        .toBe('ignore-keyword');
    });
  });

  test('eligible but absent points at the actionable next step', () => {
    const out = explainMediaPath(P, RULES);
    expect(out.verdict).toBe('eligible-not-indexed');
    expect(out.detail).toContain('scan');
  });

  describe('evaluation order mirrors the scanner', () => {
    test('a dotfile with a bad extension is reported as a dotfile', () => {
      // The scanner tests the dot first, so the operator should be told about
      // the dot — renaming the extension would not help.
      expect(explainMediaPath('/media/photos/.notes.txt', RULES).verdict).toBe('dotfile');
    });

    test('outside the root beats every file rule', () => {
      expect(explainMediaPath('/elsewhere/.hidden.txt', RULES).verdict)
        .toBe('not-in-scanned-folder');
    });

    test('an ignored directory beats an ignore pattern', () => {
      const out = explainMediaPath('/media/photos/.dtrash/a.jpg', RULES, { ignorePatternMatch: '*' });
      expect(out.verdict).toBe('ignore-dir');
    });

    test('an ignore pattern beats the EXIF keyword', () => {
      // The scanner never reads EXIF for a file it filtered out by name.
      const out = explainMediaPath(P, RULES, { ignorePatternMatch: '*.jpg', hasIgnoreKeyword: true });
      expect(out.verdict).toBe('ignore-pattern');
    });
  });
});
