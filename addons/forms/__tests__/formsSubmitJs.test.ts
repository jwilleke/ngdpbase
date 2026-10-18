/**
 * @vitest-environment jsdom
 *
 * #1893 — `public/js/forms-submit.js` posts each submit once, however many
 * forms the page has. FormsPlugin writes the script tag once per form, so on a
 * page with N forms the file ran N times and every form got N submit
 * listeners: one click on Manage Funds (4 forms) posted 4 times.
 *
 * These run the shipped file in jsdom, loaded as often as the page loads it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(path.resolve(__dirname, '../public/js/forms-submit.js'), 'utf8');

/** One form in the shape FormsPlugin renders. */
function formMarkup(id: string): string {
  return `<div class="ngdp-form card" id="form-wrapper-${id}"><div class="card-body">
    <div id="form-result-${id}"></div>
    <form data-ngdp-form="${id}" novalidate>
      <input type="text" name="note" value="x">
      <button type="submit" class="btn btn-primary">Submit</button>
    </form></div></div>`;
}

interface Page {
  dom: JSDOM;
  fetched: string[];
  observers: number;
  submit(id: string): void;
  /** Let queued MutationObserver callbacks run. */
  settle(): Promise<void>;
}

function page(ids: string[], loads: number): Page {
  const dom = new JSDOM(`<!doctype html><body>${ids.map(formMarkup).join('\n')}</body>`, { runScripts: 'outside-only' });
  const fetched: string[] = [];
  const win = dom.window as unknown as Record<string, unknown>;
  // Never resolves: the request stays in flight, so a second post would show.
  win.fetch = (url: string) => {
    fetched.push(url);
    return new Promise(() => {});
  };
  const state = { observers: 0 };
  const RealObserver = dom.window.MutationObserver;
  win.MutationObserver = class extends RealObserver {
    constructor(cb: MutationCallback) {
      super(cb);
      state.observers++;
    }
  };
  const context = dom.getInternalVMContext();
  for (let i = 0; i < loads; i++) vm.runInContext(CODE, context);
  return {
    dom,
    fetched,
    get observers() { return state.observers; },
    submit(id) {
      const form = dom.window.document.querySelector(`form[data-ngdp-form="${id}"]`) as HTMLFormElement;
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    },
    settle: () => new Promise((resolve) => dom.window.setTimeout(resolve, 0))
  };
}

describe('forms-submit.js posts each submit once (#1893)', () => {
  it('one submit is one request on a page with four forms that loads the script four times', () => {
    const p = page(['a', 'b', 'c', 'd'], 4);
    p.submit('b');
    expect(p.fetched).toEqual(['/api/forms/submit/b']);
    p.submit('d');
    expect(p.fetched).toEqual(['/api/forms/submit/b', '/api/forms/submit/d']);
  });

  it('sets the page up once however often the script runs', () => {
    expect(page(['a', 'b', 'c'], 3).observers).toBe(1);
  });

  it('binds every form on the page on the first load', () => {
    const p = page(['a', 'b'], 1);
    p.submit('a');
    p.submit('b');
    expect(p.fetched).toEqual(['/api/forms/submit/a', '/api/forms/submit/b']);
  });

  it('a form added later is bound once', async () => {
    const p = page(['a'], 2);
    const doc = p.dom.window.document;
    const holder = doc.createElement('div');
    holder.innerHTML = formMarkup('late');
    doc.body.appendChild(holder);
    await p.settle();
    p.submit('late');
    expect(p.fetched).toEqual(['/api/forms/submit/late']);
  });

  it('a bound form the page moves is not bound again by the observer', async () => {
    const p = page(['a', 'b'], 1);
    const doc = p.dom.window.document;
    const wrapper = doc.getElementById('form-wrapper-a') as HTMLElement;
    doc.body.appendChild(wrapper); // re-inserting fires the observer for it
    await p.settle();
    p.submit('a');
    expect(p.fetched).toEqual(['/api/forms/submit/a']);
  });

  it('a second submit while the first is in flight posts nothing', () => {
    const p = page(['a'], 1);
    const btn = p.dom.window.document.querySelector('form[data-ngdp-form="a"] [type=submit]') as HTMLButtonElement;
    p.submit('a');
    expect(btn.disabled).toBe(true);
    p.submit('a'); // Enter or requestSubmit() still fires submit with the button disabled
    expect(p.fetched).toEqual(['/api/forms/submit/a']);
  });
});
