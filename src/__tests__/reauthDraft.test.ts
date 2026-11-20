/**
 * @vitest-environment jsdom
 *
 * #2445 — a page that sends by fetch and follows a `reauth` link keeps what was
 * typed (never a password, token or other secret) and fills the form again when
 * the person is back: once, for the same account, within ten minutes, with a note
 * to press the button again, and without sending anything.
 *
 * The helper is public/js/reauth-draft.js; the Admin → Configuration check runs
 * that page's real script (cut from views/admin-configuration.ejs).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import ejs from 'ejs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = (p: string): string => path.resolve(__dirname, '../..', p);
const read = (p: string): string => readFileSync(file(p), 'utf8');
const CSRF_JS = read('public/js/csrf.js');
// Not there before the fix: the tests then fail on what they check, not on a missing file.
const DRAFT_JS = existsSync(file('public/js/reauth-draft.js')) ? read('public/js/reauth-draft.js') : '';
// The page hands its script the server's list of secret settings; the test supplies one whose name the page's own pattern misses.
const DECLARED_SECRET = 'ngdpbase.mail.provider.smtp.pass';
const CONFIG_SCRIPT_SRC = [...read('views/admin-configuration.ejs').matchAll(/<script nonce="[^"]*">([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('Handle all configuration save forms'));
const CONFIG_SCRIPT = ejs.render(CONFIG_SCRIPT_SRC, { secretKeys: [DECLARED_SECRET, 'ngdpbase.site.secret-sauce'] });

interface Page { dom: JSDOM; doc: Document; sent: string[]; shown: string[] }

function open(body: string, opts: { user?: string; storage?: Record<string, string>; now?: () => number; answer?: unknown; script?: string } = {}): Page {
  const user = opts.user ?? 'alice';
  const dom = new JSDOM(`<!doctype html><head><meta name="csrf-token" content="c"><meta name="current-user" content="${user}"></head><body>${body}</body>`,
    { url: 'http://localhost/', runScripts: 'outside-only' });
  for (const [k, v] of Object.entries(opts.storage ?? {})) dom.window.sessionStorage.setItem(k, v);
  const sent: string[] = [];
  const shown: string[] = [];
  const w = dom.window as unknown as Record<string, unknown>;
  w.fetch = async (url: string) => { sent.push(url); return { ok: false, status: 403, json: async () => opts.answer ?? {} }; };
  w.bootstrap = { Tab: { getOrCreateInstance: (el: Element) => ({ show: () => { shown.push(el.id); } }) } };
  if (opts.now) (dom.window.Date as unknown as { now: () => number }).now = opts.now;
  const ctx = dom.getInternalVMContext();
  vm.runInContext(CSRF_JS, ctx);
  vm.runInContext(DRAFT_JS, ctx);
  if (opts.script) {
    vm.runInContext(opts.script, ctx); // runs its own DOMContentLoaded, which jsdom fires once the page is parsed
  }
  return { dom, doc: dom.window.document, sent, shown };
}

const kept = (dom: JSDOM): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < dom.window.sessionStorage.length; i++) {
    const k = dom.window.sessionStorage.key(i)!;
    out[k] = dom.window.sessionStorage.getItem(k)!;
  }
  return out;
};
type Draft = { keep: (key: string, root: Element, o?: object) => boolean; restore: (key: string, root: Element, o?: object) => boolean };
const draft = (p: Page): Draft => (p.dom.window as unknown as { reauthDraft: Draft }).reauthDraft;
const el = (p: Page, id: string): HTMLInputElement => p.doc.getElementById(id) as HTMLInputElement;

const FORM = `<form id="f"><input id="title" name="title" value="start"><textarea id="note" name="note">start</textarea>
<select id="kind" name="kind"><option value="a">a</option><option value="b" selected>b</option></select>
<input id="pw" name="pw" type="password" value="hunter2"><input id="hid" name="hid" type="hidden" value="csrf-123">
<input id="otp" name="otp" autocomplete="one-time-code" value="123456"><input id="file" name="file" type="file">
<input id="tok" name="tok" data-no-draft value="ngt_abc"><button type="submit">Save</button></form>`;

function fill(p: Page): void {
  el(p, 'title').value = 'my title';
  el(p, 'note').value = 'my note';
  el(p, 'kind').value = 'a';
}

describe('#2445 the shared draft helper', () => {
  it('puts text, a textarea and a choice back, and nothing secret is kept or restored', () => {
    const before = open(FORM);
    fill(before);
    expect(draft(before).keep('t', before.doc.getElementById('f'))).toBe(true);
    const stored = JSON.stringify(kept(before.dom));
    for (const secret of ['hunter2', 'csrf-123', '123456', 'ngt_abc']) expect(stored).not.toContain(secret);

    const back = open(FORM, { storage: kept(before.dom) });
    el(back, 'pw').value = 'typed-later';
    expect(draft(back).restore('t', back.doc.getElementById('f'), { press: 'Save' })).toBe(true);
    expect(el(back, 'title').value).toBe('my title');
    expect(el(back, 'note').value).toBe('my note');
    expect(el(back, 'kind').value).toBe('a');
    expect(el(back, 'pw').value).toBe('typed-later');
    expect(el(back, 'hid').value).toBe('csrf-123');
    expect(el(back, 'otp').value).toBe('123456');
  });

  it('shows a note to press the button again, and sends nothing', () => {
    const before = open(FORM);
    fill(before);
    draft(before).keep('t', before.doc.getElementById('f'));
    const back = open(FORM, { storage: kept(before.dom) });
    let submits = 0;
    back.doc.getElementById('f')!.addEventListener('submit', () => { submits++; });
    draft(back).restore('t', back.doc.getElementById('f'), { press: 'Save' });
    const note = back.doc.querySelector('[data-draft-note]')!;
    expect(note.textContent).toMatch(/put back/i);
    expect(note.textContent).toContain('Press Save again');
    expect(submits).toBe(0);
    expect(back.sent).toEqual([]);
  });

  it('keeps a draft for the account that typed it, once, for ten minutes', () => {
    const before = open(FORM);
    fill(before);
    draft(before).keep('t', before.doc.getElementById('f'));
    const stored = kept(before.dom);

    const other = open(FORM, { storage: stored, user: 'bob' });
    expect(draft(other).restore('t', other.doc.getElementById('f'))).toBe(false);
    expect(el(other, 'title').value).toBe('start');
    expect(kept(other.dom)).toEqual({});

    const late = open(FORM, { storage: stored, now: () => Date.now() + 11 * 60 * 1000 });
    expect(draft(late).restore('t', late.doc.getElementById('f'))).toBe(false);
    expect(el(late, 'title').value).toBe('start');

    const again = open(FORM, { storage: stored });
    expect(draft(again).restore('t', again.doc.getElementById('f'))).toBe(true);
    expect(draft(again).restore('t', again.doc.getElementById('f'))).toBe(false);
  });

  it('keeps nothing when the form has no field it may keep', () => {
    const p = open('<form id="f"><input id="pw" type="password" value="x"><input type="hidden" name="h" value="y"></form>');
    expect(draft(p).keep('t', p.doc.getElementById('f'))).toBe(false);
    expect(kept(p.dom)).toEqual({});
  });

  const fresh = (user = 'alice', ageMs = 0): string => JSON.stringify({ user, at: Date.now() - ageMs, fields: { title: 'x' } });

  it('keeps nothing and restores nothing when the page does not say who is signed in', () => {
    const anon = open(FORM, { user: '' });
    fill(anon);
    expect(draft(anon).keep('t', anon.doc.getElementById('f'))).toBe(false);
    expect(kept(anon.dom)).toEqual({});
    const planted = open(FORM, { user: '', storage: { 'ngdpbase.draft.t': fresh('') } });
    expect(draft(planted).restore('t', planted.doc.getElementById('f'))).toBe(false);
    expect(el(planted, 'title').value).toBe('start');
  });

  it('on load, drops drafts that are old, for another account or for nobody, and leaves a fresh one of this account', () => {
    const p = open(FORM, {
      storage: {
        'ngdpbase.draft.old': fresh('alice', 11 * 60 * 1000),
        'ngdpbase.draft.bob': fresh('bob'),
        'ngdpbase.draft.nobody': fresh(''),
        'ngdpbase.draft.junk': 'not json',
        'ngdpbase.draft.mine': fresh('alice'),
        'unrelated': 'stays'
      }
    });
    expect(Object.keys(kept(p.dom)).sort()).toEqual(['ngdpbase.draft.mine', 'unrelated']);
  });

  it('on a page with nobody signed in, drops every draft', () => {
    const p = open(FORM, { user: '', storage: { 'ngdpbase.draft.mine': fresh('alice') } });
    expect(kept(p.dom)).toEqual({});
  });

  it('signing out clears every draft', () => {
    const p = open(`${FORM}<form id="out" action="/logout" method="POST"><button type="submit">Logout</button></form>`, { storage: { 'ngdpbase.draft.mine': fresh('alice') } });
    expect(Object.keys(kept(p.dom))).toEqual(['ngdpbase.draft.mine']);
    p.doc.getElementById('out')!.dispatchEvent(new p.dom.window.Event('submit', { cancelable: true }));
    expect(kept(p.dom)).toEqual({});
  });

  it('pending() counts only a fresh draft of the signed-in account', () => {
    const pendingOf = (storage: Record<string, string>): boolean => {
      const p = open(FORM, { storage });
      return (p.dom.window as unknown as { reauthDraft: { pending: () => boolean } }).reauthDraft.pending();
    };
    expect(pendingOf({ 'ngdpbase.draft.a': fresh('alice') })).toBe(true);
    expect(pendingOf({ 'ngdpbase.draft.a': fresh('alice', 11 * 60 * 1000) })).toBe(false);
    expect(pendingOf({ 'ngdpbase.draft.a': fresh('bob') })).toBe(false);
    expect(pendingOf({})).toBe(false);
  });
});

/** A page whose script waits for DOMContentLoaded: open it, then let jsdom fire the event. */
async function openConfig(opts: Parameters<typeof open>[1]): Promise<Page> {
  const p = open(CONFIG, { ...opts, script: CONFIG_SCRIPT });
  await new Promise(r => setTimeout(r, 20));
  return p;
}

const CONFIG = `<div class="container mt-4">
<button id="nav-custom-tab"></button><button id="nav-add-tab"></button>
<div class="tab-pane" id="nav-custom">
<form id="row" method="POST" action="/admin/configuration"><input type="hidden" name="_csrf" value="x"><input type="hidden" name="property" value="ngdpbase.site.name"><input type="text" id="rowValue" name="value" value="old"><button type="submit">Save</button></form>
<form id="secretRow" method="POST" action="/admin/configuration"><input type="hidden" name="property" value="ngdpbase.mail.password"><input type="text" id="secretValue" name="value" value=""><button type="submit">Save</button></form>
<form id="declaredRow" method="POST" action="/admin/configuration"><input type="hidden" name="property" value="ngdpbase.mail.provider.smtp.pass"><input type="text" id="declaredValue" name="value" value=""><button type="submit">Save</button></form>
</div>
<div class="tab-pane" id="nav-add"><form id="add" method="POST" action="/admin/configuration"><input type="text" id="newProperty" name="property"><input type="text" id="newValue" name="value"><button type="submit">Add</button></form></div>
</div>`;

async function press(p: Page, formId: string, value: string, property?: string): Promise<void> {
  const valueField = { add: 'newValue', row: 'rowValue', secretRow: 'secretValue', declaredRow: 'declaredValue' }[formId];
  el(p, valueField).value = value;
  if (property) el(p, 'newProperty').value = property;
  p.doc.getElementById(formId)!.dispatchEvent(new p.dom.window.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
}

describe('#2445 Admin → Configuration keeps a typed value across the fresh sign-in prompt', () => {
  const ASK = { success: false, error: 'A fresh sign-in is needed', reauth: '/#reauth' };

  it('a setting row comes back with its value, its tab showing and a note, and is not saved', async () => {
    const before = await openConfig({ answer: ASK });
    await press(before, 'row', 'My Site');
    const back = await openConfig({ storage: kept(before.dom) });
    expect(el(back, 'rowValue').value).toBe('My Site');
    expect(el(back, 'secretValue').value).toBe('');
    expect(back.shown).toContain('nav-custom-tab');
    // The note sits in the row's own form, next to the setting, and names the button by its label, not the setting by its key.
    const note = back.doc.querySelector('[data-draft-note]')!;
    expect(note.closest('form')).toBe(back.doc.getElementById('row'));
    expect(note.textContent).toContain('Press Save again');
    expect(note.textContent).not.toContain('ngdpbase.');
    expect(back.sent).toEqual([]);
  });

  it('the Add property form comes back with both fields and its tab showing', async () => {
    const before = await openConfig({ answer: ASK });
    await press(before, 'add', 'v1', 'ngdpbase.new.thing');
    const back = await openConfig({ storage: kept(before.dom) });
    expect(el(back, 'newProperty').value).toBe('ngdpbase.new.thing');
    expect(el(back, 'newValue').value).toBe('v1');
    expect(back.shown).toContain('nav-add-tab');
    const note = back.doc.querySelector('[data-draft-note]')!;
    expect(note.closest('form')).toBe(back.doc.getElementById('add'));
    expect(note.textContent).toContain('Press Add Property again');
  });

  it('a value for a setting that looks secret is never kept', async () => {
    const before = await openConfig({ answer: ASK });
    await press(before, 'secretRow', 'p4ssw0rd-value');
    expect(JSON.stringify(kept(before.dom))).not.toContain('p4ssw0rd-value');
    await press(before, 'add', 'p4ssw0rd-value', 'ngdpbase.mail.password');
    expect(JSON.stringify(kept(before.dom))).not.toContain('p4ssw0rd-value');
  });

  it('a value for a setting the server declares secret is never kept, though its name looks harmless', async () => {
    const before = await openConfig({ answer: ASK });
    await press(before, 'declaredRow', 'smtp-pass-value');
    expect(JSON.stringify(kept(before.dom))).not.toContain('smtp-pass-value');
    await press(before, 'add', 'smtp-pass-value-2', DECLARED_SECRET);
    expect(JSON.stringify(kept(before.dom))).not.toContain('smtp-pass-value-2');
    // A setting that is not secret still comes back.
    await press(before, 'row', 'My Site');
    expect(JSON.stringify(kept(before.dom))).toContain('My Site');
  });

  it('a saved or refused value keeps nothing', async () => {
    const before = await openConfig({ answer: { success: false, error: 'Bad value' } });
    await press(before, 'row', 'x');
    expect(kept(before.dom)).toEqual({});
  });
});

describe('#2445 the pages that follow reauth with nothing typed keep nothing', () => {
  // Each holds only values the server rendered (hidden fields, a button's own id) or a file, which
  // a page cannot keep across the prompt: Admin → Upgrade, the admin token list, Profile → Extend,
  // Admin → Configuration → Reveal, My list → Import a download, Export.
  it.each(['views/admin-upgrade.ejs', 'views/admin-dashboard.ejs', 'views/my-list.ejs', 'views/export-item.ejs'])('%s does not use the helper', (v) => {
    expect(read(v)).not.toContain('reauthDraft');
  });
});

describe('#2445 the sign-in prompt says what is kept only when something is', () => {
  const VIEW = read('views/reauth.ejs').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');
  /** What the person sees on the sign-in page for `next` (the header's "Sign in again" link has no prompt), with these drafts in the tab. */
  const seen = (storage: Record<string, string>, next = '/profile', promptId = ''): { banner: boolean; kept: boolean } => {
    const html = ejs.render(VIEW, { next, prompt: promptId, needsPasskey: false, hasPasskey: false, hasPassword: true, csrfToken: 't', cspNonce: 'n' });
    const page = open(html, { storage });
    const inline = [...html.matchAll(/<script nonce="n">([\s\S]*?)<\/script>/g)].map(m => m[1]);
    for (const code of inline) vm.runInContext(code, page.dom.getInternalVMContext());
    const banner = page.doc.querySelector('[data-reauth-expired]') as HTMLElement;
    const sentence = page.doc.querySelector('[data-reauth-kept]') as HTMLElement;
    return { banner: !banner.hidden, kept: !banner.hidden && !sentence.hidden };
  };
  const draftOf = (user: string, ageMs = 0): Record<string, string> => ({ 'ngdpbase.draft.t': JSON.stringify({ user, at: Date.now() - ageMs, fields: { title: 'x' } }) });

  it('a fresh draft of this account shows the banner and the sentence; none shows neither', () => {
    expect(seen(draftOf('alice'))).toEqual({ banner: true, kept: true });
    expect(seen({})).toEqual({ banner: false, kept: false });
  });

  it('an old draft, or one for another account, shows neither', () => {
    expect(seen(draftOf('alice', 11 * 60 * 1000))).toEqual({ banner: false, kept: false });
    expect(seen(draftOf('bob'))).toEqual({ banner: false, kept: false });
  });

  it('"Sign in again" from the lower-sign-in notice, where no action was tried, has no "expired" banner', () => {
    // views/header.ejs links to /auth/reauth?next=<page> with no prompt.
    expect(seen({}, '/admin/configuration')).toEqual({ banner: false, kept: false });
  });

  it('an action that asked for the sign-in shows the banner, with or without a draft', () => {
    expect(seen({}, '/profile', '0123456789abcdef0123456789abcdef')).toEqual({ banner: true, kept: true });
    expect(seen({}, '/auth/reauth/continue?replay=abc')).toEqual({ banner: true, kept: true });
  });
});
