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
import { TEST_PLUGIN_MANAGER, TEST_FORMATTERS, asExecuted } from '../../../dist/src/test-support/plugins.js';
import RawFormsPlugin from '../plugins/FormsPlugin';
import { parseAmount } from '../managers/FormsDataManager';

const FormsPlugin = asExecuted(RawFormsPlugin) as unknown as { execute(ctx: unknown, params: unknown): Promise<string> };

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

// ── Checklist (#1904): the array it submits, and the live total ───────────────

/** The form FormsPlugin draws for a checklist with these choices and a Total amount field. */
async function checklistMarkup(choices: Array<{ value: string; label: string; amount?: number }>, required = true): Promise<string> {
  const form = {
    id: 'dep',
    title: 'Make a deposit',
    proxySubmission: false,
    fields: [
      { name: 'receiptIds', type: 'checklist', label: 'Receipts', required, optionsSource: 'fetch:LedgerManager.toFormOptions(list=deposit-receipts)', totalField: 'total' },
      { name: 'total', type: 'amount', label: 'Total', required: false }
    ]
  };
  const ctx = {
    engine: {
      getManager: (name: string) => {
        if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
        if (name === 'FormsDataManager') return { getDefinition: () => form };
        if (name === 'LedgerManager') return { toFormOptions: async () => choices };
        return undefined;
      }
    },
    pageName: 'Deposits',
    userContext: null
  };
  return FormsPlugin.execute(ctx, { id: 'dep' });
}

interface ChecklistPage {
  doc: Document;
  bodies: unknown[];
  tick(value: string, on?: boolean): void;
  type(name: string, value: string): void;
  submit(): void;
  text(selector: string): string;
}

async function checklistPage(choices: Array<{ value: string; label: string; amount?: number }>, required = true): Promise<ChecklistPage> {
  const html = (await checklistMarkup(choices, required)).replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'outside-only' });
  const win = dom.window as unknown as Record<string, unknown>;
  const bodies: unknown[] = [];
  win.fetch = (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return new Promise(() => {});
  };
  vm.runInContext(CODE, dom.getInternalVMContext());
  const doc = dom.window.document;
  const form = doc.querySelector('form[data-ngdp-form="dep"]') as HTMLFormElement;
  return {
    doc,
    bodies,
    tick(value, on = true) {
      const box = form.querySelector(`input[type=checkbox][value="${value}"]`) as HTMLInputElement;
      box.checked = on;
      box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    },
    type(name, value) {
      const input = form.elements.namedItem(name) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    },
    submit() {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    },
    text: (selector) => (doc.querySelector(selector)?.textContent ?? '').trim()
  };
}

const RECEIPTS = [
  { value: 'r1', label: 'Receipt 1', amount: 12000 },
  { value: 'r2', label: 'Receipt 2', amount: 22000 },
  { value: 'r3', label: 'Receipt 3', amount: 5 }
];
const money = (cents: number): string => TEST_FORMATTERS.formatMoney(cents, 'USD');

describe('forms-submit.js — checklist (#1904)', () => {
  it('submits the ticked values as an array, never a comma string', async () => {
    const p = await checklistPage(RECEIPTS);
    p.tick('r1');
    p.tick('r3');
    p.submit();
    expect(p.bodies).toEqual([{ receiptIds: ['r1', 'r3'], total: '' }]);
  });

  it('an optional checklist with nothing ticked submits an empty array', async () => {
    const p = await checklistPage(RECEIPTS, false);
    p.submit();
    expect(p.bodies).toEqual([{ receiptIds: [], total: '' }]);
  });

  it('a required checklist with nothing ticked posts nothing, and says so next to it', async () => {
    const p = await checklistPage(RECEIPTS);
    p.submit();
    expect(p.bodies).toEqual([]);
    expect(p.text('[data-field-error="receiptIds"]')).toBe('Receipts: tick at least one');
    p.tick('r2');
    p.submit();
    expect(p.bodies).toEqual([{ receiptIds: ['r2'], total: '' }]);
    expect(p.text('[data-field-error="receiptIds"]')).toBe('');
  });

  it('a required checklist with nothing to choose posts nothing', async () => {
    const p = await checklistPage([]);
    expect(p.text('[data-checklist-empty]')).toBe('Nothing to choose');
    p.submit();
    expect(p.bodies).toEqual([]);
    expect(p.text('[data-field-error="receiptIds"]')).toMatch(/tick at least one/);
  });

  it('shows how many are ticked and their sum as boxes change, in formatMoney\'s format', async () => {
    const p = await checklistPage(RECEIPTS);
    expect(p.text('[data-checklist-total]')).toBe(`Ticked: 0 · ${money(0)}`);
    p.tick('r1');
    p.tick('r2');
    expect(p.text('[data-checklist-total]')).toBe(`Ticked: 2 · ${money(34000)}`);
    p.tick('r3');
    expect(p.text('[data-checklist-total]')).toBe(`Ticked: 3 · ${money(34005)}`);
    p.tick('r1', false);
    expect(p.text('[data-checklist-total]')).toBe(`Ticked: 2 · ${money(22005)}`);
  });

  it('says whether the ticked sum matches the total typed, parsed as the amount field is', async () => {
    const p = await checklistPage(RECEIPTS);
    p.tick('r1');
    p.tick('r2');
    expect(p.text('[data-checklist-match]')).toBe('Enter the total to compare.');
    p.type('total', '$340.00');
    expect(p.text('[data-checklist-match]')).toBe(`Matches the total of ${money(34000)}.`);
    expect(p.doc.querySelector('[data-checklist-match]')?.classList.contains('text-success')).toBe(true);
    p.type('total', '1,000');
    expect(p.text('[data-checklist-match]')).toBe(`Does not match the total of ${money(100000)}.`);
    expect(p.doc.querySelector('[data-checklist-match]')?.classList.contains('text-danger')).toBe(true);
    p.tick('r3');
    p.type('total', '340.05');
    expect(p.text('[data-checklist-match]')).toBe(`Matches the total of ${money(34005)}.`);
    p.type('total', '12.345'); // the amount field refuses this, so there is nothing to compare
    expect(p.text('[data-checklist-match]')).toBe('Enter the total to compare.');
  });

  it('the browser copies of formatMoney and parseAmount agree with the originals', async () => {
    const p = await checklistPage([{ value: 'x', label: 'X', amount: 0 }]);
    for (const cents of [1, 99, 100, 125050, 999999999]) {
      const box = p.doc.querySelector('input[value="x"]') as HTMLInputElement;
      box.dataset.amount = String(cents);
      p.tick('x');
      expect(p.text('[data-checklist-total]')).toBe(`Ticked: 1 · ${money(cents)}`);
    }
    for (const typed of ['1250', '1,250.5', '$1,250.50', '0', '-5', '1.234', 'abc', ' 7 ']) {
      p.type('total', typed);
      const parsed = parseAmount(typed);
      const line = p.text('[data-checklist-match]');
      if (parsed === null) expect(line).toBe('Enter the total to compare.');
      else expect(line).toContain(money(parsed));
    }
  });
});

// ── Lines (#1913): add and remove rows, the live total, the array it submits ──

const LINES_FIELD = {
  name: 'lines', type: 'lines', label: 'Lines', required: true, minRows: 1, maxRows: 3,
  fields: [
    { name: 'amount', type: 'amount', label: 'Amount', required: true },
    { name: 'fundId', type: 'dropdown', label: 'Fund', required: true, optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' },
    { name: 'memo', type: 'text', label: 'Note', required: false }
  ],
  amountField: 'amount', totalField: 'total'
};

interface LinesPage {
  doc: Document;
  bodies: unknown[];
  rows(): HTMLElement[];
  add(): void;
  remove(row: number): void;
  set(name: string, value: string): void;
  submit(): void;
  settle(): Promise<void>;
  text(selector: string): string;
  button(selector: string): HTMLButtonElement[];
}

async function linesPage(field: object = LINES_FIELD, answer: unknown = null): Promise<LinesPage> {
  const form = {
    id: 'rec', title: 'Record a receipt', proxySubmission: false,
    fields: [field, { name: 'total', type: 'amount', label: 'Total', required: false }]
  };
  const html = (await FormsPlugin.execute({
    engine: {
      getManager: (name: string) => {
        if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
        if (name === 'FormsDataManager') return { getDefinition: () => form };
        if (name === 'LedgerManager') return { toFormOptions: async () => [{ value: 'general', label: 'General' }, { value: 'reserve', label: 'Reserve' }] };
        return undefined;
      }
    },
    pageName: 'Receipts',
    userContext: null
  }, { id: 'rec' })).replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'outside-only' });
  const win = dom.window as unknown as Record<string, unknown>;
  const bodies: unknown[] = [];
  win.fetch = (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return answer === null ? new Promise(() => {}) : Promise.resolve({ json: async () => answer });
  };
  vm.runInContext(CODE, dom.getInternalVMContext());
  const doc = dom.window.document;
  const el = doc.querySelector('form[data-ngdp-form="rec"]') as HTMLFormElement;
  const click = (b: Element) => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  return {
    doc,
    bodies,
    rows: () => Array.from(el.querySelectorAll<HTMLElement>('[data-lines-row]')),
    add: () => click(el.querySelector('[data-lines-add]') as Element),
    remove: (row) => click(el.querySelectorAll('[data-lines-row]')[row].querySelector('[data-lines-remove]') as Element),
    set(name, value) {
      const input = el.elements.namedItem(name) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    },
    submit: () => { el.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); },
    settle: () => new Promise((resolve) => dom.window.setTimeout(resolve, 0)),
    text: (selector) => (doc.querySelector(selector)?.textContent ?? '').trim(),
    button: (selector) => Array.from(el.querySelectorAll<HTMLButtonElement>(selector))
  };
}

describe('forms-submit.js — lines (#1913)', () => {
  it('adds lines up to maxRows and removes them never below the floor, renumbering the names', async () => {
    const p = await linesPage();
    expect(p.rows()).toHaveLength(1);
    expect(p.button('[data-lines-remove]')[0].disabled).toBe(true);
    p.set('lines[0].memo', 'first');
    p.add();
    p.add();
    expect(p.rows()).toHaveLength(3);
    expect(p.button('[data-lines-add]')[0].disabled).toBe(true);
    p.add(); // at maxRows: nothing happens
    expect(p.rows()).toHaveLength(3);
    // A new row starts empty, and is named for its place.
    expect((p.doc.querySelector('[name="lines[2].memo"]') as HTMLInputElement).value).toBe('');
    expect(p.doc.querySelector('[data-field-error="lines[2].fundId"]')).not.toBeNull();
    p.set('lines[2].memo', 'third');
    p.remove(0);
    expect(p.rows()).toHaveLength(2);
    expect((p.doc.querySelector('[name="lines[1].memo"]') as HTMLInputElement).value).toBe('third');
    expect(p.doc.querySelector('[name="lines[2].memo"]')).toBeNull();
    expect(p.button('[data-lines-add]')[0].disabled).toBe(false);
    p.remove(0);
    expect(p.rows()).toHaveLength(1);
    expect(p.button('[data-lines-remove]')[0].disabled).toBe(true);
    p.remove(0); // at the floor: nothing happens
    expect(p.rows()).toHaveLength(1);
  });

  it('minRows rows are drawn, and none can be removed below it', async () => {
    const p = await linesPage({ ...LINES_FIELD, minRows: 2, maxRows: 4 });
    expect(p.rows()).toHaveLength(2);
    expect(p.button('[data-lines-remove]').every((b) => b.disabled)).toBe(true);
    p.add();
    expect(p.button('[data-lines-remove]').every((b) => !b.disabled)).toBe(true);
  });

  it('shows the count and the sum of the lines as they are typed, and whether it matches the total', async () => {
    const p = await linesPage();
    expect(p.text('[data-lines-total]')).toBe(`Lines: 0 · ${money(0)}`);
    p.set('lines[0].amount', '50');
    expect(p.text('[data-lines-total]')).toBe(`Lines: 1 · ${money(5000)}`);
    p.add();
    p.set('lines[1].amount', '$1,250.05');
    expect(p.text('[data-lines-total]')).toBe(`Lines: 2 · ${money(130005)}`);
    expect(p.text('[data-lines-match]')).toBe('Enter the total to compare.');
    p.set('total', '1300.05');
    expect(p.text('[data-lines-match]')).toBe(`Matches the total of ${money(130005)}.`);
    p.remove(0);
    expect(p.text('[data-lines-total]')).toBe(`Lines: 1 · ${money(125005)}`);
    expect(p.text('[data-lines-match]')).toBe(`Does not match the total of ${money(130005)}.`);
  });

  it('submits an array of row objects, trailing empty rows dropped', async () => {
    const p = await linesPage();
    p.set('lines[0].amount', '50');
    p.set('lines[0].fundId', 'general');
    p.add();
    p.set('lines[1].amount', '12.50');
    p.set('lines[1].fundId', 'reserve');
    p.set('lines[1].memo', 'dues');
    p.add(); // left empty
    p.set('total', '62.50');
    p.submit();
    expect(p.bodies).toEqual([{
      lines: [{ amount: '50', fundId: 'general', memo: '' }, { amount: '12.50', fundId: 'reserve', memo: 'dues' }],
      total: '62.50'
    }]);
  });

  it('required lines with nothing filled in post nothing, and say so next to the field', async () => {
    const p = await linesPage();
    p.submit();
    expect(p.bodies).toEqual([]);
    expect(p.text('[data-field-error="lines"]')).toBe('Lines: add at least one line');
  });

  it('a filled row missing a required sub-field posts nothing', async () => {
    const p = await linesPage();
    p.set('lines[0].memo', 'no amount');
    p.submit();
    expect(p.bodies).toEqual([]);
  });

  it('fewer filled lines than minRows post nothing', async () => {
    const p = await linesPage({ ...LINES_FIELD, required: false, minRows: 2 });
    p.set('lines[0].amount', '5');
    p.set('lines[0].fundId', 'general');
    p.submit();
    expect(p.bodies).toEqual([]);
    expect(p.text('[data-field-error="lines"]')).toBe('Lines: add at least 2 lines');
  });

  it('per-row errors the server answers land next to that row\'s field', async () => {
    const p = await linesPage(LINES_FIELD, { ok: false, error: 'Please correct the marked fields', fields: { 'lines[1].fundId': 'That fund is closed' } });
    for (const [i, fund] of [[0, 'general'], [1, 'reserve']] as const) {
      p.set(`lines[${i}].amount`, '5');
      p.set(`lines[${i}].fundId`, fund);
      if (i === 0) p.add();
    }
    p.submit();
    await p.settle();
    expect(p.bodies).toHaveLength(1);
    expect(p.text('[data-field-error="lines[1].fundId"]')).toBe('That fund is closed');
    expect(p.text('[data-field-error="lines[0].fundId"]')).toBe('');
    expect(p.doc.querySelector('[name="lines[1].fundId"]')?.classList.contains('is-invalid')).toBe(true);
  });
});
