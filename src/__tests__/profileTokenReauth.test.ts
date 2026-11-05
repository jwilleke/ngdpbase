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
<form id="agent-token-form"><input id="agent-token-name" value="n"><select id="agent-token-scopes"><option value="page-read">r</option></select>
<input id="agent-token-ttl" value="1"><button id="agent-token-create-btn">Create</button></form>
<div id="agent-token-error" class="d-none"></div><div id="agent-token-result" class="d-none"></div><input id="agent-token-secret">`;

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
