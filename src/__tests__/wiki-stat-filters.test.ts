/**
 * @vitest-environment jsdom
 *
 * #1303 — `WikiStatFilters`.
 *
 * `/admin/users` had the only working stat filter bar in the application, and
 * nine surfaces imitated its appearance without the interaction. Moving it into
 * a shared control is only worth doing if the shared one behaves identically,
 * so these run the shipped `public/js/wiki-stat-filters.js` in jsdom against
 * the markup `formatStatFilters()` emits.
 *
 * The edges worth protecting: server-side (href) cards must be left alone, the
 * active card toggles off, the clearing card clears, and a bar with no
 * `data-stat-rows` must not hide rows itself — that last one is what stops it
 * fighting a page that owns a compound filter.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';
import { formatStatFilters } from '../utils/pluginFormatters';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(path.resolve(__dirname, '../../public/js/wiki-stat-filters.js'), 'utf8');

interface DomNode {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(selector: string): DomNode | null;
  querySelectorAll(selector: string): ArrayLike<DomNode> & Iterable<DomNode>;
  addEventListener(type: string, handler: (event: unknown) => void): void;
  dispatchEvent(event: unknown): boolean;
  click?(): void;
  style: { display: string; opacity: string; outline: string; cursor: string };
}

interface StatFiltersApi {
  enhance(root?: DomNode): void;
  select(bar: DomNode, match: string | null): void;
  current(bar: DomNode): string | null;
}

interface Harness {
  WikiStatFilters: StatFiltersApi;
  document: DomNode & { body: DomNode };
  bar: DomNode;
  card(match: string): DomNode;
  rows(): DomNode[];
  pressKey(target: DomNode, key: string): void;
}

/** The element or a failed test — a missing one means the markup changed. */
function must(node: DomNode | null): DomNode {
  if (!node) throw new Error('expected the element to be in the document');
  return node;
}

/** A fresh page per test — the enhancer marks bars as wired, so state leaks. */
function loadPage(html: string): Harness {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only'
  });

  vm.runInNewContext(CODE, {
    window: dom.window,
    globalThis: dom.window,
    document: dom.window.document,
    CustomEvent: dom.window.CustomEvent
  });

  const document = dom.window.document as unknown as DomNode & { body: DomNode };
  return {
    WikiStatFilters: (dom.window as unknown as { WikiStatFilters: StatFiltersApi }).WikiStatFilters,
    document,
    bar: must(document.querySelector('[data-stat-filters]')),
    card: (match: string) => must(document.querySelector(`[data-stat-match="${match}"]`)),
    rows: () => Array.from(document.querySelectorAll('tr[data-username]')),
    pressKey: (target: DomNode, key: string) => {
      target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
    }
  };
}

const USERS_BAR = formatStatFilters([
  { label: 'Total Users', value: 3, clears: true, tone: 'primary' },
  { label: 'Active Users', value: 2, match: 'status=active', tone: 'success' },
  { label: 'Admin Users', value: 1, match: 'roles=admin', tone: 'info' }
]);

const ROWS = '<table><tbody>'
  + '<tr data-username="a" data-status="active"></tr>'
  + '<tr data-username="b" data-status="inactive"></tr>'
  + '</tbody></table>';

describe('#1303 WikiStatFilters.enhance', () => {
  it('makes a match card select its filter', () => {
    const h = loadPage(USERS_BAR);
    h.WikiStatFilters.enhance(h.document);

    h.card('status=active').click?.();

    expect(h.bar.getAttribute('data-stat-current')).toBe('status=active');
    expect(h.WikiStatFilters.current(h.bar)).toBe('status=active');
  });

  it('toggles the filter off when the active card is clicked again', () => {
    // The behaviour /admin/users has today. Losing it would mean the only way
    // back to "everything" is a different card, which is not what a toggle is.
    const h = loadPage(USERS_BAR);
    h.WikiStatFilters.enhance(h.document);

    h.card('status=active').click?.();
    h.card('status=active').click?.();

    expect(h.bar.hasAttribute('data-stat-current')).toBe(false);
  });

  it('the clearing card puts everything back', () => {
    const h = loadPage(USERS_BAR);
    h.WikiStatFilters.enhance(h.document);

    h.card('roles=admin').click?.();
    must(h.document.querySelector('[data-stat-clear]')).click?.();

    expect(h.bar.hasAttribute('data-stat-current')).toBe(false);
  });

  it('dims the cards that are not selected and outlines the one that is', () => {
    const h = loadPage(USERS_BAR);
    h.WikiStatFilters.enhance(h.document);

    h.card('status=active').click?.();

    expect(h.card('status=active').style.outline).toContain('3px solid white');
    expect(h.card('status=active').style.opacity).toBe('1');
    expect(h.card('roles=admin').style.opacity).toBe('0.5');
  });

  it('answers Enter and Space, because the cards claim to be buttons', () => {
    const h = loadPage(USERS_BAR);
    h.WikiStatFilters.enhance(h.document);

    h.pressKey(h.card('roles=admin'), 'Enter');
    expect(h.bar.getAttribute('data-stat-current')).toBe('roles=admin');

    h.pressKey(h.card('roles=admin'), ' ');
    expect(h.bar.hasAttribute('data-stat-current')).toBe(false);
  });

  it('hides the rows a filter excludes when the bar names its rows', () => {
    const bar = formatStatFilters(
      [{ label: 'Active', value: 2, match: 'status=active' }],
      { rowSelector: 'tr[data-username]' }
    );
    const h = loadPage(bar + ROWS);
    h.WikiStatFilters.enhance(h.document);

    h.card('status=active').click?.();

    const [active, inactive] = h.rows();
    expect(active.style.display).toBe('');
    expect(inactive.style.display).toBe('none');
  });

  it('hides nothing when the bar does not name its rows — the page owns that', () => {
    // /admin/users combines the quick filter with a search box and two selects.
    // A bar that also hid rows would undo the page's own decision on every click.
    const h = loadPage(USERS_BAR + ROWS);
    h.WikiStatFilters.enhance(h.document);

    h.card('status=active').click?.();

    expect(h.rows().every((row) => row.style.display === '')).toBe(true);
  });

  it('announces the change so a page can run its own filter', () => {
    const h = loadPage(USERS_BAR + ROWS);
    h.WikiStatFilters.enhance(h.document);

    const seen: (string | null)[] = [];
    h.bar.addEventListener('wiki-stat-filter', (event) => {
      seen.push((event as { detail: { match: string | null } }).detail.match);
    });

    h.card('status=active').click?.();
    h.card('status=active').click?.();

    expect(seen).toEqual(['status=active', null]);
  });

  it('leaves a server-side bar completely alone', () => {
    // Those cards are links. Wiring a click handler onto them would swallow the
    // navigation and filter the loaded page instead — the #1237 defect exactly.
    const bar = formatStatFilters([
      { label: 'Denied', value: 896, href: '/admin/audit?result=deny' }
    ], { rowSelector: 'tr[data-username]' });
    const h = loadPage(bar + ROWS);
    h.WikiStatFilters.enhance(h.document);

    must(h.document.querySelector('a.stat-filter')).click?.();

    expect(h.bar.hasAttribute('data-stat-current')).toBe(false);
    expect(h.rows().every((row) => row.style.display === '')).toBe(true);
  });

  it('does not wire the same bar twice', () => {
    const h = loadPage(USERS_BAR);
    h.WikiStatFilters.enhance(h.document);
    h.WikiStatFilters.enhance(h.document);

    let calls = 0;
    h.bar.addEventListener('wiki-stat-filter', () => { calls++; });
    h.card('status=active').click?.();

    expect(calls).toBe(1);
  });
});
