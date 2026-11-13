/**
 * @vitest-environment jsdom
 *
 * #2390 — `public/js/nav-trail.js`. A wiki page joins the trail under its
 * name and links to /view/<name>, as before. Any other screen joins under its
 * heading and links to its own path (never its query string, which can carry
 * a one-time token). Entries already stored by the old script, which have no
 * `path`, still open their wiki page. Entry text is inserted as text, never
 * as markup.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(path.resolve(__dirname, '../../public/js/nav-trail.js'), 'utf8');

interface Stored { page: string; title: string; timestamp: number; path?: string }

function visit(url: string, markup: string, stored: Stored[] | null, wikiName?: string): { doc: Document; trail: Stored[]; items: HTMLAnchorElement[] } {
  const dom = new JSDOM(`<!doctype html><body>${markup}<ul id="breadcrumbTrail"></ul></body>`, { url, runScripts: 'outside-only' });
  const win = dom.window as unknown as Record<string, unknown>;
  if (stored) dom.window.localStorage.setItem('navigationTrail', JSON.stringify(stored));
  // header.ejs defines this; it answers the wiki page's encoded name, or undefined off a wiki page.
  win.ngdpCurrentPageRaw = () => (wikiName ? encodeURIComponent(wikiName) : undefined);
  const context = dom.getInternalVMContext();
  vm.runInContext(CODE, context);
  vm.runInContext('window.ngdpTrail.init()', context);
  const trail = JSON.parse(dom.window.localStorage.getItem('navigationTrail') || '[]') as Stored[];
  const items = Array.from(dom.window.document.querySelectorAll<HTMLAnchorElement>('#breadcrumbTrail a.dropdown-item:not(.text-danger)'));
  return { doc: dom.window.document, trail, items };
}

const old = (page: string): Stored => ({ page, title: page, timestamp: 1 });

describe('nav-trail.js (#2390)', () => {
  it('a wiki page is stored under its name and, from another page, links to /view/<name>', () => {
    const first = visit('http://wiki.test/view/Main%20Page', '', null, 'Main Page');
    expect(first.trail.map(e => e.page)).toEqual(['Main Page']);
    expect(first.trail[0].path).toBeUndefined();
    const second = visit('http://wiki.test/admin', '<h1>Admin Dashboard</h1>', first.trail);
    expect(second.items.map(a => a.getAttribute('href'))).toEqual(['/view/Main%20Page']);
  });

  it('a screen that is not a wiki page is stored under its heading and its own path', () => {
    const r = visit('http://wiki.test/admin/required-pages', '<h1><i class="fas fa-sync-alt"></i> Required Pages Sync</h1>', null);
    expect(r.trail).toHaveLength(1);
    expect(r.trail[0].title).toBe('Required Pages Sync');
    expect(r.trail[0].path).toBe('/admin/required-pages');
    const next = visit('http://wiki.test/view/Main', '', r.trail, 'Main');
    expect(next.items.map(a => [(a.textContent ?? '').replace(' (recent)', '').trim(), a.getAttribute('href')])).toEqual([['Required Pages Sync', '/admin/required-pages']]);
  });

  it('keeps no query string: a token in it would otherwise sit in storage', () => {
    const r = visit('http://wiki.test/auth/magic-link/verify?token=secret', '<h1>Sign in</h1>', null);
    expect(r.trail[0].path).toBe('/auth/magic-link/verify');
    expect(JSON.stringify(r.trail)).not.toContain('secret');
  });

  it('falls back to the title in the navbar, then to the path, when the screen has no h1', () => {
    expect(visit('http://wiki.test/profile', '<div class="navigation-title"><h5>My Profile <span class="badge">x</span></h5></div>', null).trail[0].title).toBe('My Profile');
    expect(visit('http://wiki.test/search', '', null).trail[0].title).toBe('/search');
  });

  it('an entry stored by the old script (no path) still opens its wiki page', () => {
    const r = visit('http://wiki.test/admin', '<h1>Admin Dashboard</h1>', [old('Old Page')]);
    expect(r.items.map(a => a.getAttribute('href'))).toEqual(['/view/Old%20Page']);
  });

  it('does not list the current screen, and does not add one twice in a row', () => {
    const a = visit('http://wiki.test/admin', '<h1>Admin Dashboard</h1>', null);
    const b = visit('http://wiki.test/admin', '<h1>Admin Dashboard</h1>', a.trail);
    expect(b.trail).toHaveLength(1);
    expect(b.items).toHaveLength(0);
  });

  it('moves a revisited screen to the front instead of duplicating it', () => {
    const one = visit('http://wiki.test/admin', '<h1>Admin Dashboard</h1>', null);
    const two = visit('http://wiki.test/profile', '<h1>Profile</h1>', one.trail);
    const three = visit('http://wiki.test/admin', '<h1>Admin Dashboard</h1>', two.trail);
    expect(three.trail.map(e => e.path)).toEqual(['/admin', '/profile']);
  });

  it('keeps the newest 10', () => {
    let trail: Stored[] = [];
    for (let i = 0; i < 12; i++) trail = visit(`http://wiki.test/s${i}`, `<h1>S${i}</h1>`, trail).trail;
    expect(trail).toHaveLength(10);
    expect(trail[0].path).toBe('/s11');
  });

  it('inserts heading text as text, not markup', () => {
    const r = visit('http://wiki.test/x', '<h1>&lt;img src=x onerror=alert(1)&gt;</h1>', null);
    const next = visit('http://wiki.test/view/Y', '', r.trail, 'Y');
    expect(next.doc.querySelector('#breadcrumbTrail img')).toBeNull();
    expect(next.items[0].textContent).toContain('<img src=x onerror=alert(1)>');
    const evil = visit('http://wiki.test/view/Y', '', [old('<img src=x onerror=alert(1)>')], 'Y');
    expect(evil.doc.querySelector('#breadcrumbTrail img')).toBeNull();
  });

  it('will not link a stored path that leaves the site', () => {
    const r = visit('http://wiki.test/view/Y', '', [{ page: '//evil.test/', title: 'x', path: '//evil.test/', timestamp: 1 }], 'Y');
    expect(r.items.map(a => a.getAttribute('href'))).not.toContain('//evil.test/');
  });

  it.each([
    '/login', '/logout', '/consent', '/register', '/auth/magic-link/verify', '/auth/reauth', '/auth/oidc/callback'
  ])('does not record the one-time screen %s', (p) => {
    const r = visit(`http://wiki.test${p}?token=x`, '<h1>Sign in</h1>', [old('A')]);
    expect(r.trail.map(e => e.page)).toEqual(['A']);
  });

  it('does not record a screen that marks itself as an error page', () => {
    const r = visit('http://wiki.test/view/Missing', '<h1>Page Not Found</h1><div data-trail-skip></div>', [old('A')]);
    expect(r.trail.map(e => e.page)).toEqual(['A']);
  });

  it('still records paths that merely start like a skipped one', () => {
    const r = visit('http://wiki.test/login-history', '<h1>History</h1>', null);
    expect(r.trail.map(e => e.path)).toEqual(['/login-history']);
  });

  it('a non-wiki entry uses a neutral screen icon, a wiki page the file icon', () => {
    const r = visit('http://wiki.test/view/Y', '', [old('A'), { page: '/admin', title: 'Admin', path: '/admin', timestamp: 1 }], 'Y');
    const icons = r.items.map(a => a.querySelector('i')?.className);
    expect(icons[0]).toContain('fa-file-alt');
    expect(icons[1]).toContain('fa-window-maximize');
  });

  it('Clear Trail empties the stored trail', () => {
    const r = visit('http://wiki.test/view/Y', '', [old('A')], 'Y');
    (r.doc.querySelector('#breadcrumbTrail a.text-danger') as HTMLAnchorElement).click();
    expect(r.doc.defaultView!.localStorage.getItem('navigationTrail')).toBeNull();
  });
});
