/**
 * Admin pages whose row buttons act on a recorded name (Add-ons, InterWiki,
 * Organizations and Required Pages) hand that name to their script exactly as
 * it was recorded, quotes and markup-like characters included.
 *
 * Each test renders the real view (header and footer left out), runs its own
 * script in jsdom, clicks a row button and checks what the page's function or
 * confirm prompt received.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../views');

/** A name that would end a quoted script string or start markup. */
const NAME = 'O\'Brien "<b>x</b>" & \\ co';

interface El {
  getAttribute(name: string): string | null;
  click(): void;
}
interface Win {
  document: { querySelector(selector: string): El | null };
  [name: string]: unknown;
}

/** Render a view and run its script; returns the window and the confirm prompts asked. */
function runPage(view: string, locals: Record<string, unknown>): { win: Win; prompts: string[] } {
  const file = path.join(VIEWS, view);
  const template = fs.readFileSync(file, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');
  const html = ejs.render(template, {
    cspNonce: 'n', csrfToken: 'csrf-value', lockedUnless: () => '',
    jsonForScript: (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c'),
    ...locals
  }, { filename: file });
  const prompts: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { throw error; });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole,
    url: 'http://localhost/admin',
    beforeParse(w: unknown) {
      const win = w as Record<string, unknown>;
      class Modal { show() {} hide() {} static getInstance() { return null; } static getOrCreateInstance() { return new Modal(); } }
      win.bootstrap = { Modal, Toast: Modal, Tooltip: Modal, Popover: Modal };
      // Answer no, so a confirmed form is never submitted.
      win.confirm = (text: string) => { prompts.push(text); return false; };
      win.alert = () => {};
      win.csrfFetch = async () => ({ ok: true, json: async () => ({}) });
    }
  });
  return { win: dom.window, prompts };
}

/** Replace a page function with one that records its arguments. */
function spy(win: Win, fn: string): unknown[][] {
  const calls: unknown[][] = [];
  win[fn] = (...args: unknown[]) => { calls.push(args); };
  return calls;
}

function click(win: Win, selector: string): void {
  const button = win.document.querySelector(selector);
  expect(button).not.toBeNull();
  button.click();
}

describe('admin row buttons hand recorded names to the script as text', () => {
  it('Add-ons asks to enable or redeploy the add-on by its exact name', () => {
    const addon = { name: NAME, enabled: false, hasTheme: true, themeDeployed: true };
    const { win, prompts } = runPage('admin-addons.ejs', { success: '', error: '', addons: [addon] });
    click(win, 'button.btn-outline-success');
    click(win, 'button.btn-outline-primary[data-confirm]');
    expect(prompts).toEqual([
      `Enable add-on "${NAME}"? A restart is required for this to take effect.`,
      `Redeploy theme for "${NAME}"? This overwrites themes/${NAME}/ and discards any local theme edits.`
    ]);
  });

  it('InterWiki edits and cancels the site by its exact name', () => {
    const { win } = runPage('admin-interwiki.ejs', {
      message: '', error: '', enabled: true, options: {}, sites: { [NAME]: { url: 'https://example.org/%s', description: '' } }
    });
    const started = spy(win, 'startEdit');
    const cancelled = spy(win, 'cancelEdit');
    click(win, 'button[data-start-edit]');
    click(win, 'button[data-cancel-edit]');
    expect(started).toEqual([[encodeURIComponent(NAME)]]);
    expect(cancelled).toEqual([[encodeURIComponent(NAME)]]);
  });

  it('Organizations edits, shows and deletes the organization by its exact name', () => {
    const org = { name: NAME, url: '' };
    const { win } = runPage('admin-organizations.ejs', { success: '', error: '', organizations: [org] });
    const edited = spy(win, 'editOrganization');
    const shown = spy(win, 'viewOrganizationSchema');
    const deleted = spy(win, 'deleteOrganization');
    click(win, 'button[data-org-action="edit"]');
    click(win, 'button[data-org-action="schema"]');
    click(win, 'button[data-org-action="delete"]');
    expect(edited[0][0]).toBe(NAME.toLowerCase());
    expect(shown[0][0]).toBe(NAME.toLowerCase());
    expect(deleted).toEqual([[NAME.toLowerCase(), NAME]]);
  });

  it('Required Pages acts on the page by its exact title', () => {
    const page = { uuid: 'u-1', liveUuid: 'u-2', title: NAME, source: 'core', status: 'uuid-mismatch', userModified: true };
    const { win } = runPage('admin-required-pages.ejs', {
      counts: {}, comparison: [page], notInSource: [], addonComparison: [], declined: [], orphanedAddonPages: []
    });
    const diffs = spy(win, 'showDiff');
    const adopts = spy(win, 'adoptUuidOne');
    const declines = spy(win, 'declineOne');
    const pushes = spy(win, 'pushToSourceOne');
    click(win, 'button[data-row-action="showDiff"]');
    click(win, 'button[data-row-action="adoptUuidOne"]');
    click(win, 'button[data-row-action="declineOne"]');
    click(win, 'button[data-row-action="pushToSourceOne"]');
    expect(diffs).toEqual([['u-1', NAME, 'u-2']]);
    expect(adopts).toEqual([['u-1', 'u-2', NAME]]);
    expect(declines).toEqual([['core', 'u-1', NAME, 'A page with slug or title already exists under UUID u-2']]);
    expect(pushes).toEqual([['u-1', NAME]]);
  });
});
