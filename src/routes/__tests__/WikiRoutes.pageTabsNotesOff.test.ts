/**
 * #1951 — the shared Template:PageTabs leaves out the Comments or Footnotes
 * tab on a page where that kind is turned off, as the owning manager decides
 * for THAT page. Other tabs, and other pages, are untouched.
 *
 * @jest-environment node
 */

import WikiRoutes from '../WikiRoutes';
import { pageNotesAllowed } from '../../utils/pageNotes';
import type { WikiEngine } from '../../types/WikiEngine';

const TEMPLATE = [
  "[{Tab name='Referring Pages'}]",
  '[{ReferringPagesPlugin}]',
  '[{/Tab}]',
  "[{Tab name='Footnotes'}]",
  "[{FootnotesPlugin noheader='true'}]",
  '[{/Tab}]',
  "[{Tab name='Comments'}]",
  "[{CommentsPlugin noheader='true'}]",
  '[{/Tab}]'
].join('\n');

let categories: Record<string, Record<string, unknown>> = {};

const engine = {
  getManager: vi.fn((name: string): unknown => {
    // The managers' door is the one rule, as the real managers' isAllowedOn is.
    if (name === 'CommentManager') return { isAllowedOn: (p: never, c: never, m: never) => pageNotesAllowed(engine as never, 'comments', p, c, m) };
    if (name === 'FootnoteManager') return { isAllowedOn: (p: never, c: never, m: never) => pageNotesAllowed(engine as never, 'footnotes', p, c, m) };
    if (name === 'ValidationManager') return { getCategoryConfig: (l: string) => categories[l] ?? null, getDefaultSystemCategory: () => 'general' };
    return null;
  })
} as unknown as WikiEngine;

const renderingManager = { textToHTML: vi.fn(async (_ctx: unknown, content: string) => `<div>${content}</div>`) };
const configManager = { getProperty: (_k: string, d: unknown) => d };

const routes = new WikiRoutes(engine);
const build = (pageName: string, pageMetadata: Record<string, unknown>, template = TEMPLATE): Promise<string> =>
  (routes as unknown as {
    buildPageTabsHtml(t: string, ctx: unknown, r: unknown, c: unknown): Promise<string>;
  }).buildPageTabsHtml(template, { pageName, pageMetadata, userContext: { username: 'reader', isAuthenticated: true, roles: [] } }, renderingManager, configManager);

const tabNames = (html: string): string[] => [...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map(m => m[1]);

beforeEach(() => {
  categories = { general: { label: 'general' } };
});

describe('Template:PageTabs on a page with comments or footnotes off (#1951)', () => {
  test('unset: every tab, as today', async () => {
    expect(tabNames(await build('Plain', { uuid: 'u-1', 'system-category': 'general' }))).toEqual(['Referring Pages', 'Footnotes', 'Comments']);
  });

  test('comments: false leaves out the Comments tab only', async () => {
    const html = await build('Page', { uuid: 'u-1', comments: false });
    expect(tabNames(html)).toEqual(['Referring Pages', 'Footnotes']);
    expect(html).not.toContain('CommentsPlugin');
  });

  test('footnotes: false leaves out the Footnotes tab only', async () => {
    const html = await build('Page', { uuid: 'u-1', footnotes: false });
    expect(tabNames(html)).toEqual(['Referring Pages', 'Comments']);
    expect(html).not.toContain('FootnotesPlugin');
  });

  test('a system-category that turns both off leaves out both tabs', async () => {
    categories.phr = { label: 'phr', comments: false, footnotes: false };
    expect(tabNames(await build('My Health Records', { uuid: 'u-1', 'system-category': 'phr' }))).toEqual(['Referring Pages']);
  });

  test('the page flag wins over its system-category', async () => {
    categories.phr = { label: 'phr', comments: false, footnotes: false };
    expect(tabNames(await build('Exception', { uuid: 'u-1', 'system-category': 'phr', comments: true }))).toEqual(['Referring Pages', 'Comments']);
  });

  test('the short plugin names are recognised too', async () => {
    const template = "[{Tab name='Notes'}]\n[{Footnotes}]\n[{/Tab}]\n[{Tab name='Talk'}]\n[{Comments}]\n[{/Tab}]";
    expect(tabNames(await build('Page', { uuid: 'u-1', footnotes: false }, template))).toEqual(['Talk']);
  });

  test('one page turned off does not reach the next page rendered from the same template', async () => {
    expect(tabNames(await build('Off', { uuid: 'u-1', footnotes: false, comments: false }))).toEqual(['Referring Pages']);
    expect(tabNames(await build('On', { uuid: 'u-2' }))).toEqual(['Referring Pages', 'Footnotes', 'Comments']);
  });
});
