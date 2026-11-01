/**
 * @vitest-environment jsdom
 *
 * #2193 — a form refused for a fresh sign-in (step-up) keeps the page and what
 * was typed. The prompt opens in another window (a popup, or a new tab when the
 * popup is blocked); the page asks `/auth/reauth/status` about its own prompt
 * (the `prompt` id in the refusal's `reauth`) until that prompt is confirmed,
 * then sends the same JSON once more, once. Its prompt cancelled or closed, or
 * another tab's prompt confirmed, sends nothing; nor does a form changed while
 * it waited.
 *
 * These run the shipped file in jsdom, with `fetch`, `window.open` and the
 * timers it waits on replaced. Pages made with one `server` share a session.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(path.resolve(__dirname, '../public/js/forms-submit.js'), 'utf8');

const PROMPT = '0123456789abcdef0123456789abcdef';
const OTHER_PROMPT = 'fedcba9876543210fedcba9876543210';
const reauthFor = (prompt: string) => `/auth/reauth?next=%2Fview%2FLedger&prompt=${prompt}`;
const refusedFor = (prompt: string) => ({ success: false, error: 'A fresh sign-in is needed', reauth: reauthFor(prompt) });
const REAUTH = reauthFor(PROMPT);
const REFUSED = refusedFor(PROMPT);

/** The session the pages share: whether its sign-in is fresh, and each prompt's state. */
interface Session { fresh: boolean; prompts: Record<string, string> }
const newSession = (): Session => ({ fresh: false, prompts: {} });

/** The prompt's window as the page sees it: where it is, and whether it was closed. */
interface FakePopup { closed: boolean; location: { pathname: string }; close(): void }

interface StepUpPage {
  doc: Document;
  /** Each POST to the submit route, its body as sent. */
  posts: string[];
  /** How often the page asked whether the sign-in is fresh. */
  asked: number;
  /** What `window.open` was called with; null entries mean it was blocked. */
  opened: Array<{ url: string; target: string }>;
  popup: FakePopup;
  session: Session;
  /** This page's prompt confirmed: the sign-in is fresh, and the prompt says so. */
  confirm(): void;
  /** This page's prompt cancelled (its Cancel, in whichever window it is). */
  cancel(): void;
  submit(): void;
  type(name: string, value: string): void;
  /** Run the queued polls and the promises they start. */
  flush(): Promise<void>;
  text(): string;
  value(name: string): string;
}

/**
 * A page with one form. `answers` are the submit route's answers in order;
 * `blocked` makes `window.open` return null as a popup blocker does.
 */
function stepUpPage(answers: unknown[], { blocked = false, session = newSession(), prompt = PROMPT } = {}): StepUpPage {
  const dom = new JSDOM(`<!doctype html><body><div class="ngdp-form card"><div class="card-body">
    <div id="form-result-led"></div>
    <form data-ngdp-form="led" novalidate>
      <input type="text" name="memo" value="">
      <input type="text" name="amount" value="">
      <button type="submit" class="btn btn-primary">Submit</button>
    </form></div></div></body>`, { runScripts: 'outside-only', url: 'https://site.test/view/Ledger' });
  const win = dom.window as unknown as Record<string, unknown>;
  const timers: Array<() => void> = [];
  const state: StepUpPage = {
    doc: dom.window.document,
    posts: [],
    asked: 0,
    opened: [],
    popup: { closed: false, location: { pathname: '/auth/reauth' }, close() { this.closed = true; } },
    session,
    confirm() { session.fresh = true; session.prompts[prompt] = 'confirmed'; },
    cancel() { session.prompts[prompt] = 'cancelled'; },
    submit() {
      const form = dom.window.document.querySelector('form[data-ngdp-form="led"]') as HTMLFormElement;
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    },
    async flush() {
      for (let round = 0; round < 10; round++) {
        await new Promise((resolve) => setImmediate(resolve));
        const due = timers.splice(0);
        due.forEach((fn) => fn());
      }
    },
    type(name, value) { (dom.window.document.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value; },
    text: () => (dom.window.document.getElementById('form-result-led')?.textContent ?? '').trim(),
    value: (name) => ((dom.window.document.querySelector(`[name="${name}"]`) as HTMLInputElement).value)
  };
  const answer = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  win.fetch = (url: string, init: { method?: string; body?: string } = {}) => {
    if (url.startsWith('/auth/reauth/status')) {
      state.asked++;
      const asked = new URL(url, 'https://site.test').searchParams.get('prompt') ?? '';
      return answer({ fresh: session.fresh, prompt: session.prompts[asked] ?? 'unknown' });
    }
    state.posts.push(init.body ?? '');
    const next = answers.shift();
    // The refusal starts its prompt on the server, waiting.
    const reauth = (next as { reauth?: string } | undefined)?.reauth;
    const minted = reauth ? new URL(reauth, 'https://site.test').searchParams.get('prompt') : null;
    if (minted) session.prompts[minted] = 'waiting';
    return next === undefined ? new Promise(() => {}) : answer(next, (next as { reauth?: string }).reauth ? 403 : 200);
  };
  win.open = (url: string, target: string) => {
    state.opened.push({ url, target });
    return blocked ? null : state.popup;
  };
  // The page waits between questions; here the waits run when flush() says.
  win.setTimeout = (fn: () => void) => { timers.push(fn); return timers.length; };
  vm.runInContext(CODE, dom.getInternalVMContext());
  (dom.window.document.querySelector('[name="memo"]') as HTMLInputElement).value = 'Refund for the hall';
  (dom.window.document.querySelector('[name="amount"]') as HTMLInputElement).value = '125.00';
  return state;
}

const TYPED = JSON.stringify({ memo: 'Refund for the hall', amount: '125.00' });

describe('forms-submit.js — a fresh sign-in keeps the form (#2193)', () => {
  it('opens the prompt in a popup and keeps the page and what was typed', async () => {
    const p = stepUpPage([REFUSED]);
    p.submit();
    await p.flush();
    expect(p.opened).toEqual([{ url: REAUTH, target: 'ngdp-step-up' }]);
    expect(p.value('memo')).toBe('Refund for the hall');
    expect(p.text()).toMatch(/Confirm it is you in the window that opened/);
  });

  it('once the sign-in is fresh, sends the same JSON once more, once, and closes the popup', async () => {
    const p = stepUpPage([REFUSED, { ok: true }]);
    p.submit();
    await p.flush();
    expect(p.posts).toEqual([TYPED]);
    p.confirm();
    p.popup.location.pathname = '/view/Ledger';
    await p.flush();
    await p.flush();
    expect(p.posts).toEqual([TYPED, TYPED]);
    expect(p.popup.closed).toBe(true);
    expect(p.text()).toMatch(/Your submission was received/);
  });

  it('a double click while waiting, or the poll and a press together, still sends once', async () => {
    const p = stepUpPage([REFUSED]);
    p.submit();
    await p.flush();
    p.confirm();
    p.submit();
    p.submit();
    await p.flush();
    // The press sends it (one request in flight); the poll it stopped sends nothing.
    expect(p.posts).toEqual([TYPED, TYPED]);
  });

  it('a prompt cancelled (the popup leaves it unconfirmed) sends nothing and says so', async () => {
    const p = stepUpPage([REFUSED]);
    p.submit();
    await p.flush();
    p.cancel();
    p.popup.location.pathname = '/view/Ledger'; // Cancel goes back to the page
    await p.flush();
    expect(p.posts).toEqual([TYPED]);
    expect(p.popup.closed).toBe(true);
    expect(p.text()).toMatch(/not confirmed, so nothing was sent/);
    expect(p.value('memo')).toBe('Refund for the hall');
    expect((p.doc.querySelector('[type=submit]') as HTMLButtonElement).disabled).toBe(false);
    // Nothing more is asked once it is over.
    const asked = p.asked;
    await p.flush();
    expect(p.asked).toBe(asked);
  });

  it('a popup closed before confirming is a cancel', async () => {
    const p = stepUpPage([REFUSED]);
    p.submit();
    await p.flush();
    p.popup.closed = true;
    await p.flush();
    expect(p.posts).toEqual([TYPED]);
    expect(p.text()).toMatch(/not confirmed, so nothing was sent/);
  });

  it('a blocked popup offers the prompt in a new tab, and still sends once it is confirmed', async () => {
    const p = stepUpPage([REFUSED, { ok: true }], { blocked: true });
    p.submit();
    await p.flush();
    const link = p.doc.querySelector('#form-result-led a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(REAUTH);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
    expect(p.text()).toMatch(/blocked/);
    p.confirm();
    await p.flush();
    expect(p.posts).toEqual([TYPED, TYPED]);
    expect(p.text()).toMatch(/Your submission was received/);
  });

  it('refused for a fresh sign-in again after one, it stops and says so: no loop of prompts', async () => {
    const p = stepUpPage([REFUSED, REFUSED]);
    p.submit();
    await p.flush();
    p.confirm();
    await p.flush();
    await p.flush();
    expect(p.posts).toEqual([TYPED, TYPED]);
    expect(p.opened).toHaveLength(1);
    expect(p.text()).toMatch(/still needs a fresh sign-in/);
  });

  it('only this site\'s prompt is opened', async () => {
    const p = stepUpPage([{ ...REFUSED, reauth: 'https://evil.example/auth/reauth?next=%2F' }]);
    p.submit();
    await p.flush();
    expect(p.opened).toEqual([]);
    expect(p.asked).toBe(0);
  });

  it('two tabs waiting: confirming one tab\'s prompt sends that tab\'s form only (#2176\'s rule)', async () => {
    // Sabotage (2026-10-31): sending on `fresh` alone, as 0a30d9ce did, turns this red.
    const session = newSession();
    const a = stepUpPage([REFUSED, { ok: true }], { session, prompt: PROMPT });
    const b = stepUpPage([refusedFor(OTHER_PROMPT), { ok: true }], { session, prompt: OTHER_PROMPT });
    a.submit();
    b.submit();
    await a.flush();
    await b.flush();
    a.confirm();
    await a.flush();
    await b.flush();
    await a.flush();
    await b.flush();
    expect(a.posts).toEqual([TYPED, TYPED]);
    expect(b.posts).toEqual([TYPED]);
    expect(b.popup.closed).toBe(false);
    expect(b.text()).toMatch(/Confirm it is you in the window that opened/);
    // B's own confirmation sends B's form, once.
    b.confirm();
    await b.flush();
    await b.flush();
    expect(b.posts).toEqual([TYPED, TYPED]);
  });

  it('a blocked popup: Cancel in the new tab ends the wait, and a later fresh sign-in sends nothing', async () => {
    const session = newSession();
    const p = stepUpPage([REFUSED, { ok: true }], { blocked: true, session });
    p.submit();
    await p.flush();
    p.cancel();
    await p.flush();
    expect(p.text()).toMatch(/not confirmed, so nothing was sent/);
    expect(p.value('memo')).toBe('Refund for the hall');
    expect((p.doc.querySelector('[type=submit]') as HTMLButtonElement).disabled).toBe(false);
    // Another step-up confirmed later, for anything, does not send this form.
    session.fresh = true;
    await p.flush();
    await p.flush();
    expect(p.posts).toEqual([TYPED]);
  });

  it('a blocked popup: another tab\'s confirmation does not send this form', async () => {
    const session = newSession();
    const p = stepUpPage([REFUSED, { ok: true }], { blocked: true, session });
    p.submit();
    await p.flush();
    session.fresh = true;
    session.prompts[OTHER_PROMPT] = 'confirmed';
    await p.flush();
    await p.flush();
    expect(p.posts).toEqual([TYPED]);
    expect(p.text()).toMatch(/blocked/);
  });

  it('a form changed while waiting is not sent as it was: the page says so and keeps the change', async () => {
    // Sabotage (2026-10-31): resending wait.body without comparing, as 0a30d9ce did, turns this red.
    const p = stepUpPage([REFUSED, { ok: true }]);
    p.submit();
    await p.flush();
    p.type('amount', '152.00');
    p.confirm();
    p.popup.location.pathname = '/view/Ledger';
    await p.flush();
    await p.flush();
    expect(p.posts).toEqual([TYPED]);
    expect(p.text()).toMatch(/You changed the form while confirming/);
    expect(p.value('amount')).toBe('152.00');
    expect((p.doc.querySelector('[type=submit]') as HTMLButtonElement).disabled).toBe(false);
    // Submit sends it as it is now.
    p.submit();
    await p.flush();
    expect(p.posts).toEqual([TYPED, JSON.stringify({ memo: 'Refund for the hall', amount: '152.00' })]);
  });

  it('ten minutes with no answer from a new tab ends the wait', async () => {
    const p = stepUpPage([REFUSED], { blocked: true });
    const win = p.doc.defaultView as unknown as { Date: { now(): number } };
    const start = win.Date.now();
    p.submit();
    await p.flush();
    win.Date.now = () => start + 11 * 60 * 1000;
    await p.flush();
    expect(p.text()).toMatch(/not confirmed, so nothing was sent/);
    expect(p.posts).toEqual([TYPED]);
  });
});
