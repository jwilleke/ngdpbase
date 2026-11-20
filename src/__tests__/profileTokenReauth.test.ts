/**
 * @vitest-environment jsdom
 *
 * #2226 — New Token on /profile: a stale sign-in gets `{ reauth }` back from
 * POST /api/tokens, and the page must follow it to the fresh sign-in prompt
 * instead of printing "A fresh sign-in is needed".
 *
 * Runs the profile page's real token script (cut from views/profile.ejs)
 * against public/js/csrf.js, with fetch answering as the route does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(path.resolve(__dirname, '../..', p), 'utf8');
const CSRF_JS = read('public/js/csrf.js');
const SCRIPT = [...read('views/profile.ejs').matchAll(/<script nonce="[^"]*">([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes("getElementById('agent-token-form')"))
  .replace('<%= csrfToken %>', 'csrf-value');

const MARKUP = `<meta name="csrf-token" content="csrf-value">
<details id="profile-tokens-and-devices"><summary>My tokens and devices</summary>
<button type="button" id="agent-token-new-btn">New token</button>
<form id="agent-token-form" class="d-none"><input id="agent-token-name" value="n"><select id="agent-token-scopes"><option value="page-read">r</option><option value="page-ingest" selected>w</option></select>
<input id="agent-token-ttl" type="number" value="24"><button id="agent-token-create-btn">Create</button></form>
<div id="agent-token-error" class="d-none"></div><div id="agent-token-result" class="d-none"></div><input id="agent-token-secret"></details>`;

async function submit(answer: { status: number; body: unknown }): Promise<{ doc: Document; href: string; calls: string[] }> {
  const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`, { url: 'http://localhost/', runScripts: 'outside-only' });
  const calls: string[] = [];
  (dom.window as unknown as Record<string, unknown>).fetch = async (url: string) => {
    calls.push(url);
    return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
  };
  const ctx = dom.getInternalVMContext();
  vm.runInContext(CSRF_JS, ctx);
  vm.runInContext(SCRIPT, ctx);
  dom.window.document.getElementById('agent-token-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
  return { doc: dom.window.document, href: dom.window.location.href, calls };
}

describe('#2226 New Token follows the step-up answer', () => {
  it('a stale sign-in is sent to the reauth link, not shown as an error', async () => {
    // A fragment-only link, so jsdom can follow it (it does not implement real navigation).
    const out = await submit({ status: 403, body: { success: false, error: 'A fresh sign-in is needed', reauth: '/#reauth' } });
    expect(out.calls).toEqual(['/api/tokens']);
    expect(out.href).toBe('http://localhost/#reauth');
    expect(out.doc.getElementById('agent-token-error')!.classList.contains('d-none')).toBe(true);
  });

  it('a fresh sign-in still creates the token in one step', async () => {
    const out = await submit({ status: 201, body: { success: true, token: 'ngt_secret' } });
    expect(out.href).toBe('http://localhost/');
    expect((out.doc.getElementById('agent-token-secret') as HTMLInputElement).value).toBe('ngt_secret');
    expect(out.doc.getElementById('agent-token-result')!.classList.contains('d-none')).toBe(false);
  });

  it('a plain failure is still shown, and an off-site reauth link is not followed', async () => {
    const out = await submit({ status: 400, body: { success: false, error: 'Name required', reauth: '//evil.example/x' } });
    expect(out.href).toBe('http://localhost/');
    expect(out.doc.getElementById('agent-token-error')!.textContent).toBe('Name required');
  });
});

// The form a person filled in must survive the trip to the fresh sign-in prompt.
type Fill = { name: string; scopes: string; ttl: string };
const STALE = { status: 403, body: { success: false, error: 'A fresh sign-in is needed', reauth: '/#reauth' } };

function openPage(storage: Record<string, string> = {}, now?: () => number): { dom: JSDOM; calls: string[] } {
  const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`, { url: 'http://localhost/', runScripts: 'outside-only' });
  for (const [k, v] of Object.entries(storage)) dom.window.sessionStorage.setItem(k, v);
  const calls: string[] = [];
  const w = dom.window as unknown as Record<string, unknown>;
  w.fetch = async (url: string) => {
    calls.push(url);
    return { ok: STALE.status < 400, status: STALE.status, json: async () => STALE.body };
  };
  if (now) (dom.window.Date as unknown as { now: () => number }).now = now;
  const ctx = dom.getInternalVMContext();
  vm.runInContext(CSRF_JS, ctx);
  vm.runInContext(SCRIPT, ctx);
  return { dom, calls };
}

const field = (dom: JSDOM, id: string): HTMLInputElement => dom.window.document.getElementById(id) as HTMLInputElement;

async function pressCreate(dom: JSDOM, fill: Fill): Promise<void> {
  field(dom, 'agent-token-name').value = fill.name;
  field(dom, 'agent-token-scopes').value = fill.scopes;
  field(dom, 'agent-token-ttl').value = fill.ttl;
  dom.window.document.getElementById('agent-token-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 20));
}

/** What the browser keeps for this tab across the trip to the prompt and back. */
const kept = (dom: JSDOM): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < dom.window.sessionStorage.length; i++) {
    const k = dom.window.sessionStorage.key(i)!;
    out[k] = dom.window.sessionStorage.getItem(k)!;
  }
  return out;
};

describe('#2445 the form survives the fresh sign-in prompt', () => {
  const typed: Fill = { name: 'claude-laptop', scopes: 'page-read', ttl: '6' };

  it('comes back with the name, permissions and hours, open, and creates nothing', async () => {
    const before = openPage();
    await pressCreate(before.dom, typed);
    expect(before.calls).toEqual(['/api/tokens']);

    const back = openPage(kept(before.dom));
    expect(field(back.dom, 'agent-token-name').value).toBe('claude-laptop');
    expect(field(back.dom, 'agent-token-scopes').value).toBe('page-read');
    expect(field(back.dom, 'agent-token-ttl').value).toBe('6');
    expect(back.dom.window.document.getElementById('agent-token-form')!.classList.contains('d-none')).toBe(false);
    expect((back.dom.window.document.getElementById('profile-tokens-and-devices') as HTMLDetailsElement).open).toBe(true);
    await new Promise(r => setTimeout(r, 20));
    expect(back.calls).toEqual([]);
  });

  it('is restored once: a later visit shows the empty form', async () => {
    const before = openPage();
    await pressCreate(before.dom, typed);
    const back = openPage(kept(before.dom));
    expect(field(back.dom, 'agent-token-name').value).toBe('claude-laptop');
    expect(kept(back.dom)).toEqual({});
    const later = openPage(kept(back.dom));
    expect(field(later.dom, 'agent-token-name').value).toBe('n');
  });

  it('is forgotten after ten minutes', async () => {
    const before = openPage();
    await pressCreate(before.dom, typed);
    const back = openPage(kept(before.dom), () => Date.now() + 11 * 60 * 1000);
    expect(field(back.dom, 'agent-token-name').value).toBe('n');
    expect(back.dom.window.document.getElementById('agent-token-form')!.classList.contains('d-none')).toBe(true);
  });

  it('puts a restored name in the field as text and ignores a permission or hours the form does not offer', async () => {
    const before = openPage();
    await pressCreate(before.dom, { name: '<img src=x onerror=alert(1)>', scopes: 'page-ingest', ttl: '6' });
    const stored = kept(before.dom);
    const key = Object.keys(stored)[0];
    const draft = JSON.parse(stored[key]);
    stored[key] = JSON.stringify({ ...draft, scopes: 'admin-everything', ttl: 'lots' });
    const back = openPage(stored);
    expect(field(back.dom, 'agent-token-name').value).toBe('<img src=x onerror=alert(1)>');
    expect(back.dom.window.document.querySelector('img')).toBeNull();
    expect(field(back.dom, 'agent-token-scopes').value).toBe('page-ingest');
    expect(field(back.dom, 'agent-token-ttl').value).toBe('24');
  });

  it('keeps nothing when the reauth link is off-site, or when the token was created', async () => {
    const offsite = openPage();
    (offsite.dom.window as unknown as Record<string, unknown>).fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: 'x', reauth: '//evil.example/x' }) });
    await pressCreate(offsite.dom, typed);
    expect(kept(offsite.dom)).toEqual({});

    const created = openPage();
    (created.dom.window as unknown as Record<string, unknown>).fetch = async () => ({ ok: true, status: 201, json: async () => ({ success: true, token: 'ngt_secret' }) });
    await pressCreate(created.dom, typed);
    expect(kept(created.dom)).toEqual({});
  });

  it('never keeps the token secret', async () => {
    const before = openPage();
    field(before.dom, 'agent-token-secret').value = 'ngt_secret';
    await pressCreate(before.dom, typed);
    expect(JSON.stringify(kept(before.dom))).not.toContain('ngt_secret');
  });
});
