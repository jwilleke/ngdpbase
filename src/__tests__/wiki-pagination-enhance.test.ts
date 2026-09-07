/**
 * @vitest-environment jsdom
 *
 * #1300 — `WikiPagination.enhance()`.
 *
 * The application had two pagination helpers that could not call each other:
 * `WikiPagination` in the browser and `formatPaginationLinks` on the server.
 * The fix is to make the markup the contract — `formatPaginationNav` emits it,
 * and this enhancer gives any instance of it the keyboard and swipe behaviour
 * that previously only client-rendered lists had.
 *
 * These run the shipped `public/js/wiki-pagination.js` in jsdom rather than a
 * reimplementation, because the behaviour worth protecting is in the edge
 * cases: not binding twice when a page carries two pagers, and not hijacking
 * the callback-driven pagers that already work.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../../public/js/wiki-pagination.js');
const CODE = readFileSync(SOURCE, 'utf8');

/**
 * The project compiles with `lib: ["ES2022"]` and no DOM types, so the pieces
 * of the DOM these tests touch are modelled structurally rather than imported.
 * Same approach as editor-draft.test.ts.
 */
interface DomNode {
  getAttribute(name: string): string | null;
  querySelector(selector: string): DomNode | null;
  querySelectorAll(selector: string): ArrayLike<DomNode> & Iterable<DomNode>;
  appendChild(child: DomNode): void;
  dispatchEvent(event: unknown): boolean;
  textContent: string | null;
  focus?(): void;
  click?(): void;
}

interface DomDocument extends DomNode {
  body: DomNode;
  createElement(tag: string): DomNode;
  getElementById(id: string): DomNode | null;
}

interface PaginationApi {
  renderNav(
    containerEl: DomNode | null,
    currentPage: number,
    totalPages: number,
    onNavigate: (page: number) => void
  ): void;
  enhance(root?: DomNode): void;
  attachKeyboard(onPrev: (() => void) | null, onNext: (() => void) | null): void;
  attachSwipe(el: DomNode, onPrev: (() => void) | null, onNext: (() => void) | null): void;
  urlNav(dataAttr: string, selector: string): () => void;
}

interface Harness {
  WikiPagination: PaginationApi;
  document: DomDocument;
  /** Where the code under test tried to navigate, instead of actually doing it. */
  navigatedTo: string[];
  pressArrow(key: 'ArrowLeft' | 'ArrowRight', target?: DomNode): void;
}

/**
 * A fresh page per test.
 *
 * These bind listeners on `document`, so sharing one document across tests
 * leaks them: a listener from an earlier test navigates during a later one and
 * every assertion after the first becomes meaningless. Each test gets its own
 * JSDOM for the same reason a browser gets a new document per page load.
 */
function loadPage(html = ''): Harness {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only'
  });
  const navigatedTo: string[] = [];

  // jsdom refuses real navigation, so window.location.href is replaced with a
  // recorder. Everything else is the genuine window the file would get.
  const windowStub = new Proxy(dom.window, {
    get(target, prop) {
      if (prop === 'location') {
        return {
          get href() {
            return 'http://localhost/';
          },
          set href(value: string) {
            navigatedTo.push(value);
          }
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    }
  });

  vm.runInNewContext(CODE, {
    window: windowStub,
    globalThis: windowStub,
    document: dom.window.document
  });

  return {
    WikiPagination: (dom.window as unknown as { WikiPagination: PaginationApi }).WikiPagination,
    document: dom.window.document,
    navigatedTo,
    pressArrow(key, target) {
      (target ?? dom.window.document).dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key, bubbles: true })
      );
    }
  };
}

/** A server-emitted pager, in the shape `formatPaginationNav` produces. */
function serverPager(current: number, total: number): string {
  const prev = current > 1 ? ` data-prev-url="/list?page=${current - 1}"` : '';
  const next = current < total ? ` data-next-url="/list?page=${current + 1}"` : '';
  return `<nav class="wiki-pagination" data-pagination data-current-page="${current}" `
    + `data-total-pages="${total}"${prev}${next}>`
    + '<ul class="pagination pagination-sm mb-0"></ul></nav>';
}

describe('wiki-pagination.js — enhance (#1300)', () => {
  describe('server-emitted pagers', () => {
    it('navigates with the arrow keys using the URLs in the markup', () => {
      const page = loadPage(serverPager(3, 10));
      page.WikiPagination.enhance();

      page.pressArrow('ArrowRight');
      expect(page.navigatedTo).toEqual(['/list?page=4']);

      page.pressArrow('ArrowLeft');
      expect(page.navigatedTo).toEqual(['/list?page=4', '/list?page=2']);
    });

    it('does nothing at the ends of the range, where the URLs are absent', () => {
      const page = loadPage(serverPager(1, 5));
      page.WikiPagination.enhance();

      page.pressArrow('ArrowLeft');
      expect(page.navigatedTo).toEqual([]);

      page.pressArrow('ArrowRight');
      expect(page.navigatedTo).toEqual(['/list?page=2']);
    });

    it('binds once when a page carries two pagers, not once each', () => {
      // The regression this guards: attachKeyboard binds on document, so a
      // top-and-bottom pager pair would advance two pages per keypress.
      const page = loadPage(serverPager(2, 10) + serverPager(2, 10));
      page.WikiPagination.enhance();

      page.pressArrow('ArrowRight');
      expect(page.navigatedTo).toEqual(['/list?page=3']);
    });

    it('is safe to call twice on the same document', () => {
      const page = loadPage(serverPager(2, 10));
      page.WikiPagination.enhance();
      page.WikiPagination.enhance();

      page.pressArrow('ArrowRight');
      expect(page.navigatedTo).toEqual(['/list?page=3']);
    });

    it('leaves the arrow keys alone while the user is typing', () => {
      const page = loadPage(serverPager(2, 10) + '<input id="q">');
      page.WikiPagination.enhance();

      const input = page.document.getElementById('q');
      input?.focus?.();
      page.pressArrow('ArrowRight', input ?? undefined);

      expect(page.navigatedTo).toEqual([]);
    });

    it('enhances automatically on DOMContentLoaded, without the page calling anything', async () => {
      // The whole point: a surface emits the markup and gets the control.
      // The document is still parsing when the script runs — as in a browser —
      // so this waits for the event the wiring actually hangs off.
      const page = loadPage(serverPager(4, 10));
      await new Promise((resolve) => setTimeout(resolve, 0));

      page.pressArrow('ArrowRight');
      expect(page.navigatedTo).toEqual(['/list?page=5']);
    });
  });

  describe('client-rendered pagers', () => {
    it('are not hijacked — they already wire their own callbacks', () => {
      const page = loadPage();
      const host = page.document.createElement('div');
      page.document.body.appendChild(host);

      let navigatedPage: number | null = null;
      page.WikiPagination.renderNav(host, 2, 5, (n) => {
        navigatedPage = n;
      });
      page.WikiPagination.enhance();

      // No URLs in the markup, so the enhancer has nothing to navigate to and
      // must not claim the arrow keys from the page that owns them.
      page.pressArrow('ArrowRight');
      expect(page.navigatedTo).toEqual([]);
      expect(navigatedPage).toBeNull();
    });

    it('carry the canonical marker so one selector finds every pager', () => {
      const page = loadPage();
      const host = page.document.createElement('div');
      page.document.body.appendChild(host);
      page.WikiPagination.renderNav(host, 3, 9, () => {});

      const pager = host.querySelector('[data-pagination]');
      expect(pager).not.toBeNull();
      expect(pager?.getAttribute('data-current-page')).toBe('3');
      expect(pager?.getAttribute('data-total-pages')).toBe('9');
    });

    it('still render and still call back on click', () => {
      const page = loadPage();
      const host = page.document.createElement('div');
      page.document.body.appendChild(host);

      const seen: number[] = [];
      page.WikiPagination.renderNav(host, 2, 5, (n) => seen.push(n));

      const links = [...host.querySelectorAll('a.page-link')];
      expect(links.length).toBeGreaterThan(0);

      const three = links.find((a) => a.textContent === '3');
      three?.click?.();
      expect(seen).toEqual([3]);
    });

    it('keep the page in control of its own arrow keys', () => {
      const page = loadPage();
      const host = page.document.createElement('div');
      page.document.body.appendChild(host);
      page.WikiPagination.renderNav(host, 2, 5, () => {});

      let went: string | null = null;
      page.WikiPagination.attachKeyboard(
        () => { went = 'prev'; },
        () => { went = 'next'; }
      );

      page.pressArrow('ArrowRight');
      expect(went).toBe('next');
    });
  });
});
