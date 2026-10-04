/**
 * @vitest-environment jsdom
 *
 * #448 — `public/js/passkey.js` binds each button once, however many times the
 * page includes it. The step-down banner (header.ejs) and the profile both
 * load it; with two handlers, one click fetched two sign-in challenges, the
 * second replaced the first in the session, and the passkey's answer failed
 * with "Unexpected authentication response challenge" on jimstest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(path.resolve(__dirname, '../../public/js/passkey.js'), 'utf8');

function page(markup: string, loads: number, userAgent?: string): { dom: JSDOM; fetched: string[] } {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, { runScripts: 'outside-only' });
  if (userAgent) Object.defineProperty(dom.window.navigator, 'userAgent', { value: userAgent, configurable: true });
  const fetched: string[] = [];
  const win = dom.window as unknown as Record<string, unknown>;
  win.PublicKeyCredential = function PublicKeyCredential() {};
  // Never resolves: the test counts requests, it does not complete a ceremony.
  win.fetch = (url: string) => {
    fetched.push(url);
    return new Promise(() => {});
  };
  const context = dom.getInternalVMContext();
  for (let i = 0; i < loads; i++) vm.runInContext(CODE, context);
  return { dom, fetched };
}

describe('passkey.js binds once (#448)', () => {
  it('one click on a sign-in button fetches one challenge, even when the script is loaded twice', () => {
    const { dom, fetched } = page('<button data-passkey-signin class="d-none">Sign in</button>', 2);
    (dom.window.document.querySelector('[data-passkey-signin]') as HTMLButtonElement).click();
    expect(fetched).toEqual(['/auth/passkey/authenticate/options']);
  });

  it('one click on the enrol button fetches one challenge, even when the script is loaded twice', () => {
    const { dom, fetched } = page('<button data-passkey-enrol class="d-none">Add</button>', 2);
    (dom.window.document.querySelector('[data-passkey-enrol]') as HTMLButtonElement).click();
    expect(fetched).toEqual(['/auth/passkey/register/options']);
  });

  it('still shows and binds every button on the page on the first load', () => {
    const { dom, fetched } = page(
      '<button id="a" data-passkey-signin class="d-none"></button><button id="b" data-passkey-signin class="d-none"></button>',
      1
    );
    const doc = dom.window.document;
    expect(doc.getElementById('a')!.classList.contains('d-none')).toBe(false);
    expect(doc.getElementById('b')!.classList.contains('d-none')).toBe(false);
    (doc.getElementById('b') as HTMLButtonElement).click();
    expect(fetched).toHaveLength(1);
  });
});

const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';
const ENROL = '<input id="label"><div id="err" class="d-none"></div><button data-passkey-enrol data-label-input="label" data-error-target="err" class="d-none">Add</button>';

describe('passkey names (operator, 2026-10-04)', () => {
  it('pre-fills the name from the browser and device', () => {
    expect((page(ENROL, 1, MAC_CHROME).dom.window.document.getElementById('label') as HTMLInputElement).value).toBe('Chrome on Mac');
    expect((page(ENROL, 1, ANDROID_CHROME).dom.window.document.getElementById('label') as HTMLInputElement).value).toBe('Chrome on Android phone');
  });

  it('never overwrites a name already typed', () => {
    const doc = page(ENROL.replace('<input id="label">', '<input id="label" value="Work laptop">'), 1, MAC_CHROME).dom.window.document;
    expect((doc.getElementById('label') as HTMLInputElement).value).toBe('Work laptop');
  });

  it('refuses an empty name before asking the server for anything', () => {
    const { dom, fetched } = page(ENROL, 1, MAC_CHROME);
    const doc = dom.window.document;
    (doc.getElementById('label') as HTMLInputElement).value = '  ';
    (doc.querySelector('[data-passkey-enrol]') as HTMLButtonElement).click();
    expect(fetched).toEqual([]);
    expect(doc.getElementById('err')!.textContent).toMatch(/Give this passkey a name/);
  });
});

