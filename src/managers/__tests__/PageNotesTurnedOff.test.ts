/**
 * #1951 — a page, or a whole system-category, turns off core's Comments and
 * Footnotes. One rule decides (`pageNotesOn`, gathered by `pageNotesAllowed`);
 * CommentManager and FootnoteManager ask it at every write door and refuse,
 * keeping what the page already has.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import CommentManager from '../CommentManager';
import FootnoteManager from '../FootnoteManager';
import { pageNotesAllowed, pageNotesOn, PageNotesTurnedOffError } from '../../utils/pageNotes';
import { systemCategoryValueProblems } from '../../utils/systemCategoryRules';
import type { WikiEngine } from '../../types/WikiEngine';

describe('a system-category entry\'s comments and footnotes are booleans (#1951)', () => {
  test('a wrong type is a problem that names the entry and the field', () => {
    expect(systemCategoryValueProblems('phr', { comments: 'false', footnotes: 0 }).map(p => p.message)).toEqual([
      'system-category \'phr\': comments must be true or false, got "false"',
      'system-category \'phr\': footnotes must be true or false, got 0'
    ]);
    expect(systemCategoryValueProblems('phr', { comments: false, footnotes: true })).toEqual([]);
  });
});

let tmpDir: string;

/** What each test's pages say in their frontmatter, by page name. */
let pages: Record<string, Record<string, unknown> | null> = {};
/** The site's system-category entries, by label. */
let categories: Record<string, Record<string, unknown>> = {};

const mockPageManager = {
  getPageMetadata: vi.fn(async (name: string) => pages[name] ?? null),
  invalidatePageCache: vi.fn()
};
const mockValidationManager = {
  getCategoryConfig: vi.fn((label: string) => categories[label] ?? null),
  getDefaultSystemCategory: vi.fn(() => 'general')
};
const mockConfigManager = {
  getProperty: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
  getResolvedDataPath: vi.fn(() => tmpDir)
};

const mockEngine = {
  getManager: vi.fn((name: string) => {
    if (name === 'ConfigurationManager') return mockConfigManager;
    if (name === 'PageManager') return mockPageManager;
    if (name === 'ValidationManager') return mockValidationManager;
    return null;
  })
} as unknown as WikiEngine;

const WRITER = { username: 'alice', displayName: 'Alice', roles: ['editor'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const pub = (name: string, uuid: string) => ({ name, uuid });

const OFF_PAGE = pub('Health Records', '11111111-1111-4111-8111-111111111111');
const ON_PAGE = pub('Ordinary Page', '22222222-2222-4222-8222-222222222222');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-off-test-'));
  categories = { general: { label: 'general' } };
  pages = {
    [OFF_PAGE.name]: { title: OFF_PAGE.name, uuid: OFF_PAGE.uuid, 'system-category': 'general', comments: false, footnotes: false },
    [ON_PAGE.name]: { title: ON_PAGE.name, uuid: ON_PAGE.uuid, 'system-category': 'general' }
  };
  mockPageManager.getPageMetadata.mockClear();
});

afterEach(() => {
  // Only the folder this test made.
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('pageNotesOn — the rule (#1951)', () => {
  test.each(['comments', 'footnotes'] as const)('%s: unset everywhere is on, as today', (kind) => {
    expect(pageNotesOn(kind, {}, {})).toBe(true);
    expect(pageNotesOn(kind, null, null)).toBe(true);
  });

  test.each(['comments', 'footnotes'] as const)('%s: the page flag false turns it off', (kind) => {
    expect(pageNotesOn(kind, { [kind]: false }, {})).toBe(false);
  });

  test.each(['comments', 'footnotes'] as const)('%s: the system-category false turns it off', (kind) => {
    expect(pageNotesOn(kind, {}, { [kind]: false })).toBe(false);
  });

  test.each(['comments', 'footnotes'] as const)('%s: the page flag wins over the system-category, both ways', (kind) => {
    expect(pageNotesOn(kind, { [kind]: true }, { [kind]: false })).toBe(true);
    expect(pageNotesOn(kind, { [kind]: false }, { [kind]: true })).toBe(false);
  });

  test('the two kinds are independent', () => {
    expect(pageNotesOn('comments', { footnotes: false }, {})).toBe(true);
    expect(pageNotesOn('footnotes', { comments: false }, {})).toBe(true);
  });

  test('only the boolean false turns it off: a string is not a flag', () => {
    expect(pageNotesOn('comments', { comments: 'false' }, {})).toBe(true);
    expect(pageNotesOn('comments', {}, { comments: 'false' })).toBe(true);
  });
});

describe('pageNotesAllowed — the page and its system-category, gathered (#1951)', () => {
  test('reads the named page\'s metadata as the caller', async () => {
    expect(await pageNotesAllowed(mockEngine, 'comments', OFF_PAGE, WRITER)).toBe(false);
    expect(mockPageManager.getPageMetadata).toHaveBeenCalledWith(OFF_PAGE.name, WRITER);
  });

  test('metadata the caller already holds is used, and nothing is read', async () => {
    expect(await pageNotesAllowed(mockEngine, 'footnotes', ON_PAGE, WRITER, { footnotes: false })).toBe(false);
    expect(mockPageManager.getPageMetadata).not.toHaveBeenCalled();
  });

  test('a system-category that turns comments off turns them off for its pages', async () => {
    categories.phr = { label: 'phr', comments: false };
    pages[ON_PAGE.name] = { ...pages[ON_PAGE.name], 'system-category': 'phr' };
    expect(await pageNotesAllowed(mockEngine, 'comments', ON_PAGE, WRITER)).toBe(false);
    expect(await pageNotesAllowed(mockEngine, 'footnotes', ON_PAGE, WRITER)).toBe(true);
  });

  test('a page that names no system-category follows the default one', async () => {
    categories.general = { label: 'general', footnotes: false };
    pages[ON_PAGE.name] = { title: ON_PAGE.name, uuid: ON_PAGE.uuid };
    expect(await pageNotesAllowed(mockEngine, 'footnotes', ON_PAGE, WRITER)).toBe(false);
  });

  test('a page in an off system-category that says comments: true keeps them', async () => {
    categories.phr = { label: 'phr', comments: false };
    pages[ON_PAGE.name] = { ...pages[ON_PAGE.name], 'system-category': 'phr', comments: true };
    expect(await pageNotesAllowed(mockEngine, 'comments', ON_PAGE, WRITER)).toBe(true);
  });
});

describe('CommentManager refuses on a page whose comments are off (#1951)', () => {
  let cm: CommentManager;
  beforeEach(async () => {
    cm = new CommentManager(mockEngine);
    await cm.initialize();
  });

  test('isAllowedOn answers per page', async () => {
    expect(await cm.isAllowedOn(OFF_PAGE, WRITER)).toBe(false);
    expect(await cm.isAllowedOn(ON_PAGE, WRITER)).toBe(true);
  });

  test('posting is refused, and nothing is written', async () => {
    await expect(cm.addComment(OFF_PAGE, WRITER, 'ask Dr. X about my A1c')).rejects.toBeInstanceOf(PageNotesTurnedOffError);
    expect(fs.existsSync(path.join(tmpDir, OFF_PAGE.uuid))).toBe(false);
  });

  test('deleting is refused, and an existing comment is kept as it was', async () => {
    // Written while comments were on.
    pages[OFF_PAGE.name] = { ...pages[OFF_PAGE.name], comments: true };
    const kept = await cm.addComment(OFF_PAGE, WRITER, 'before the flag');
    pages[OFF_PAGE.name] = { ...pages[OFF_PAGE.name], comments: false };

    await expect(cm.deleteComment(OFF_PAGE, kept.id, WRITER)).rejects.toThrow('Comments are turned off for this page.');
    const stored = await cm.getComment(OFF_PAGE, kept.id, WRITER);
    expect(stored?.content).toBe('before the flag');
    expect(stored?.deleted).toBeUndefined();
  });

  test('another page is not affected', async () => {
    const c = await cm.addComment(ON_PAGE, WRITER, 'fine here');
    expect(await cm.deleteComment(ON_PAGE, c.id, WRITER)).toBe(true);
  });
});

describe('FootnoteManager refuses on a page whose footnotes are off (#1951)', () => {
  let fm: FootnoteManager;
  const data = { display: 'Source', url: 'https://example.com', note: '' };
  beforeEach(async () => {
    fm = new FootnoteManager(mockEngine);
    await fm.initialize();
  });

  test('adding is refused, and nothing is written', async () => {
    await expect(fm.addFootnote(OFF_PAGE, data, WRITER)).rejects.toBeInstanceOf(PageNotesTurnedOffError);
    expect(fs.existsSync(path.join(tmpDir, `${OFF_PAGE.uuid}.json`))).toBe(false);
  });

  test('editing and deleting are refused, and the existing footnote is kept', async () => {
    pages[OFF_PAGE.name] = { ...pages[OFF_PAGE.name], footnotes: true };
    const kept = await fm.addFootnote(OFF_PAGE, data, WRITER);
    pages[OFF_PAGE.name] = { ...pages[OFF_PAGE.name], footnotes: false };

    await expect(fm.updateFootnote(OFF_PAGE, kept.id, { ...data, display: 'Changed' }, WRITER)).rejects.toThrow('Footnotes are turned off for this page.');
    await expect(fm.deleteFootnote(OFF_PAGE, kept.id, WRITER)).rejects.toBeInstanceOf(PageNotesTurnedOffError);
    const stored = await fm.getFootnotes(OFF_PAGE, WRITER);
    expect(stored).toHaveLength(1);
    expect(stored[0].display).toBe('Source');
  });

  test('an import with an explicit id is refused', async () => {
    await expect(fm.importFootnote(OFF_PAGE, 'note-1', data, WRITER)).rejects.toBeInstanceOf(PageNotesTurnedOffError);
  });

  test('the conversion funnel leaves the body\'s definitions where they are', async () => {
    const body = 'Text[^1].\n\n[^1]: https://example.com\n';
    const out = await fm.transferFromContent(OFF_PAGE, body, WRITER, false);
    expect(out.content).toBe(body);
    expect(out.warnings.join(' ')).toContain('footnotes-off');
    expect(fs.existsSync(path.join(tmpDir, `${OFF_PAGE.uuid}.json`))).toBe(false);
  });

  test('the funnel reads the flag from the frontmatter being saved, for a page not stored yet', async () => {
    const fresh = pub('New Page', '33333333-3333-4333-8333-333333333333');
    const body = '---\ntitle: New Page\nfootnotes: false\n---\nText[^1].\n\n[^1]: https://example.com\n';
    const out = await fm.transferFromContent(fresh, body, WRITER, false);
    expect(out.content).toBe(body);
  });

  test('turning footnotes off on one page leaves another page\'s footnotes working', async () => {
    const added = await fm.addFootnote(ON_PAGE, data, WRITER);
    expect(await fm.updateFootnote(ON_PAGE, added.id, { ...data, display: 'Edited' }, WRITER)).not.toBeNull();
    expect(await fm.isAllowedOn(ON_PAGE, WRITER)).toBe(true);
    expect(await fm.isAllowedOn(OFF_PAGE, WRITER)).toBe(false);
  });
});
