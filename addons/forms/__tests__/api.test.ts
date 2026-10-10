/**
 * Tests for forms API routes — POST /api/forms/submit/:formId
 *
 * Focuses on the logic that can be verified through the route's HTTP response
 * without a full engine: onBehalfOf validation, missing manager/form 503/404,
 * and the time-range check.
 */

import express from 'express';
import request from 'supertest';
import apiRoutes from '../routes/api';

// Stub ApiContext.from so it doesn't need a real session in tests.
// Must be at the top level — Vitest hoists vi.mock() but warns (and will
// eventually error) if the call is nested inside a function. The mocked path
// lives in dist/ which may not exist when tests run from source, hence virtual.
vi.mock('../../../dist/src/context/ApiContext', () => ({
  ApiContext: { from: () => ({ username: 'testuser' }) }
}), { virtual: true });

// ── Minimal mocks ─────────────────────────────────────────────────────────────

const testForm = {
  id: 'test-form',
  title: 'Test Form',
  fields: [
    { name: 'name', type: 'text', label: 'Name', required: true },
    { name: 'startTime', type: 'time', label: 'Start', required: false },
    { name: 'endTime',   type: 'time', label: 'End',   required: false }
  ],
  proxySubmission: true
};

function makeEngine(overrides: Record<string, unknown> = {}) {
  const defaultManagers: Record<string, unknown> = {
    FormsDataManager: {
      getDefinition: () => testForm,
      saveSubmission: (s: object) => Promise.resolve({ ...s, id: 'sub-001' })
    },
    // The page the form is on: readable, carrying the form, and submit allowed.
    PageManager: {
      readPage: async (name: string) => ({ ok: true, name, metadata: {}, value: { content: "[{Form id='test-form'}]" } })
    },
    PolicyInformationPoint: { canUserAccessPage: async () => true },
    ...overrides
  };

  return {
    getManager: (name: string) => defaultManagers[name]
  };
}

const noopAddon = {
  callHandler: async () => ({ ok: true })
};

function makeContext(engine: ReturnType<typeof makeEngine>) {
  const app = express();
  app.use(express.json());
  app.use('/api/forms', apiRoutes(engine as never, noopAddon));
  return app;
}

// ── 503 / 404 guard rails ─────────────────────────────────────────────────────

describe('POST /api/forms/submit/:formId — guards', () => {
  test('returns 503 when FormsDataManager not registered', async () => {
    const app = makeContext(makeEngine({ FormsDataManager: undefined }));
    const res = await request(app).post('/api/forms/submit/test-form').send({ _page: 'Reservations', name: 'Alice' });
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  test('returns 404 when form id not found', async () => {
    const engine = {
      getManager: (name: string) =>
        name === 'FormsDataManager'
          ? { getDefinition: () => null, saveSubmission: async (s: object) => s }
          : undefined
    };
    const app = makeContext(engine);
    const res = await request(app).post('/api/forms/submit/no-such-form').send({ _page: 'Reservations', name: 'Alice' });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

// ── onBehalfOf validation ─────────────────────────────────────────────────────

describe('POST /api/forms/submit/:formId — onBehalfOf', () => {
  let app: express.Application;

  beforeEach(() => {
    app = makeContext(makeEngine());
  });

  test('succeeds with no onBehalfOf body at all', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({ _page: 'Reservations', name: 'Alice' });
    expect([201, 409]).toContain(res.status); // 201 ok, 409 if handler rejects
    if (res.status === 201) expect(res.body.ok).toBe(true);
  });

  test('succeeds when all obo fields including name are filled', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({
        _page: 'Reservations',
        name: 'Alice',
        onBehalfOf: { name: 'Bob Smith', email: 'bob@example.com', phone: '555-1234', address: '1 Main St' }
      });
    expect([201, 409]).toContain(res.status);
  });

  test('returns 400 when obo email is filled but name is missing', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({
        _page: 'Reservations',
        name: 'Alice',
        onBehalfOf: { name: '', email: 'bob@example.com' }
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/Full Name is required/i);
  });

  test('returns 400 when obo phone is filled but name is missing', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({
        _page: 'Reservations',
        name: 'Alice',
        onBehalfOf: { phone: '555-5555' }
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Full Name is required/i);
  });

  test('returns 400 when obo address is filled but name is missing', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({
        _page: 'Reservations',
        name: 'Alice',
        onBehalfOf: { address: '42 Main St' }
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Full Name is required/i);
  });

  test('ignores obo block with only whitespace values', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({
        _page: 'Reservations',
        name: 'Alice',
        onBehalfOf: { name: '   ', email: '   ' }
      });
    // Whitespace-only trims to empty — treated as "no obo filled"
    expect([201, 409]).toContain(res.status);
  });
});

// ── Time-range check ──────────────────────────────────────────────────────────

describe('POST /api/forms/submit/:formId — time range', () => {
  let app: express.Application;

  beforeEach(() => {
    app = makeContext(makeEngine());
  });

  test('returns 400 when endTime <= startTime', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({ _page: 'Reservations', name: 'Alice', startTime: '14:00', endTime: '13:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end time/i);
  });

  test('returns 400 when endTime equals startTime', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({ _page: 'Reservations', name: 'Alice', startTime: '10:00', endTime: '10:00' });
    expect(res.status).toBe(400);
  });

  test('succeeds when endTime is after startTime', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({ _page: 'Reservations', name: 'Alice', startTime: '10:00', endTime: '12:00' });
    expect([201, 409]).toContain(res.status);
  });
});

// ── Who may submit: the page the form is on ───────────────────────────────────

describe('POST /api/forms/submit/:formId — page access', () => {
  test('400 when the form does not say which page it is on', async () => {
    const res = await request(makeContext(makeEngine())).post('/api/forms/submit/test-form').send({ name: 'Alice' });
    expect(res.status).toBe(400);
  });

  test('404 when the viewer may not read the page', async () => {
    const engine = makeEngine({ PageManager: { readPage: async () => ({ ok: false, refusal: 'denied' }) } });
    const res = await request(makeContext(engine)).post('/api/forms/submit/test-form').send({ _page: 'Books', name: 'Alice' });
    expect(res.status).toBe(404);
  });

  test('404 when the page does not carry this form', async () => {
    const engine = makeEngine({
      PageManager: { readPage: async (name: string) => ({ ok: true, name, metadata: {}, value: { content: "[{Form id='other-form'}]" } }) }
    });
    const res = await request(makeContext(engine)).post('/api/forms/submit/test-form').send({ _page: 'Public', name: 'Alice' });
    expect(res.status).toBe(404);
  });

  test('403 when the page refuses form-submit, asked with the page name and its front matter', async () => {
    const asked: unknown[] = [];
    const metadata = { access: { 'form-submit': ['treasurer'] } };
    const engine = makeEngine({
      PageManager: { readPage: async (name: string) => ({ ok: true, name, metadata, value: { content: "[{Form id='test-form'}]" } }) },
      PolicyInformationPoint: { canUserAccessPage: async (...args: unknown[]) => { asked.push(...args.slice(1)); return false; } }
    });
    const res = await request(makeContext(engine)).post('/api/forms/submit/test-form').send({ _page: 'Books', name: 'Alice' });
    expect(res.status).toBe(403);
    expect(asked).toEqual(['Books', 'form-submit', metadata]);
  });
});

// ── Choices, amounts, handler-first ───────────────────────────────────────────

describe('POST /api/forms/submit/:formId — choices, amounts and the handler', () => {
  const ledgerForm = {
    id: 'test-form',
    title: 'Record an entry',
    proxySubmission: false,
    store: true,
    fields: [
      { name: 'fund', type: 'dropdown', label: 'Fund', required: true, optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' },
      { name: 'amount', type: 'amount', label: 'Amount', required: true }
    ]
  };

  function ledgerApp(opts: { store?: boolean; handler?: (s: { data: Record<string, unknown> }) => Promise<Record<string, unknown>> } = {}) {
    const saved: unknown[] = [];
    const engine = makeEngine({
      FormsDataManager: {
        getDefinition: () => ({ ...ledgerForm, store: opts.store ?? true }),
        saveSubmission: async (s: object) => { saved.push(s); return s; }
      },
      LedgerManager: { toFormOptions: async () => [{ value: 'general', label: 'General Fund' }] }
    });
    const addon = { callHandler: async (_id: string, s: unknown) => (opts.handler ? opts.handler(s as { data: Record<string, unknown> }) : { ok: true }) };
    const app = express();
    app.use(express.json());
    app.use('/api/forms', apiRoutes(engine as never, addon as never));
    return { app, saved };
  }

  test('a value the dropdown did not offer is refused, with a message for that field', async () => {
    const { app, saved } = ledgerApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'secret', amount: '10' });
    expect(res.status).toBe(400);
    expect(res.body.fields.fund).toMatch(/choose one/i);
    expect(saved).toEqual([]);
  });

  test('an amount reaches the handler as whole cents', async () => {
    let seen: unknown;
    const { app } = ledgerApp({ handler: async (s) => { seen = s.data; return { ok: true }; } });
    const res = await request(app).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'general', amount: '$1,250.50' });
    expect(res.status).toBe(201);
    expect(seen).toEqual({ fund: 'general', amount: 125050 });
  });

  test('a bad amount is refused next to the field', async () => {
    const { app } = ledgerApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'general', amount: '12.345' });
    expect(res.status).toBe(400);
    expect(res.body.fields.amount).toMatch(/amount/i);
  });

  test('a refused submission is not stored, and the handler\'s field messages come back', async () => {
    const { app, saved } = ledgerApp({ handler: async () => ({ ok: false, error: 'Fund is closed', fields: { fund: 'That fund is closed' } }) });
    const res = await request(app).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'general', amount: '5' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ ok: false, error: 'Fund is closed', fields: { fund: 'That fund is closed' } });
    expect(saved).toEqual([]);
  });

  test('an accepted submission is stored after the handler, under the id the handler saw', async () => {
    let handlerId: unknown;
    const { app, saved } = ledgerApp({ handler: async (s) => { handlerId = (s as unknown as { id: string }).id; return { ok: true }; } });
    const res = await request(app).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'general', amount: '5' });
    expect(res.status).toBe(201);
    expect(saved).toHaveLength(1);
    expect((saved[0] as { id: string }).id).toBe(handlerId);
    expect(res.body.submissionId).toBe(handlerId);
  });

  test('a refusal keeps the handler\'s status, and only a same-site /auth/reauth link passes', async () => {
    const refuses = (reauth: string) => ledgerApp({ handler: async () => ({ ok: false, status: 403, error: 'A fresh sign-in is needed', reauth }) }).app;
    const good = await request(refuses('/auth/reauth?next=%2Fview%2FBooks')).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'general', amount: '5' });
    expect(good.status).toBe(403);
    expect(good.body).toEqual({ ok: false, error: 'A fresh sign-in is needed', reauth: '/auth/reauth?next=%2Fview%2FBooks' });
    for (const bad of ['https://evil.example/auth/reauth', '//evil.example/auth/reauth', '/logout', 'javascript:alert(1)']) {
      const res = await request(refuses(bad)).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'general', amount: '5' });
      expect(res.body.reauth).toBeUndefined();
    }
  });

  test('store: false keeps no submission file', async () => {
    const { app, saved } = ledgerApp({ store: false });
    const res = await request(app).post('/api/forms/submit/test-form').send({ _page: 'Books', fund: 'general', amount: '5' });
    expect(res.status).toBe(201);
    expect(saved).toEqual([]);
  });
});
