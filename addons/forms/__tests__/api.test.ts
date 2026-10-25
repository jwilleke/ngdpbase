/**
 * Tests for forms API routes — POST /api/forms/submit/:formId
 *
 * Focuses on the logic that can be verified through the route's HTTP response
 * without a full engine: onBehalfOf validation, missing manager/form 503/404,
 * and the time-range check.
 */

import express from 'express';
import request from 'supertest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import apiRoutes from '../routes/api';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

/** The host core hands the forms add-on (#1813); its ApiContext is the stub below. */
const host = () => buildAddonHost('forms', {});
import { TEST_PLUGIN_MANAGER } from '../../../dist/src/test-support/plugins.js';

// Stub ApiContext.from so it doesn't need a real session in tests.
// Must be at the top level — Vitest hoists vi.mock() but warns (and will
// eventually error) if the call is nested inside a function. The mocked path
// lives in dist/ which may not exist when tests run from source, hence virtual.
// requirePermission refuses when a test sets `refusal`; sendApiError is the real one.
const permission: { refusal: Error | null; asked: string[] } = { refusal: null, asked: [] };
// The request's subject the route forwards to core (#1957). vi.hoisted: the mock factory reads it.
const { SUBMITTER } = vi.hoisted(() => ({ SUBMITTER: { username: 'testuser', roles: ['reader'], isAuthenticated: true } }));
vi.mock('../../../dist/src/context/ApiContext', async () => {
  const real = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
  return {
    ...real,
    ApiContext: {
      from: () => ({
        username: 'testuser',
        subject: SUBMITTER,
        getActor: () => SUBMITTER,
        requirePermission: async (p: string) => { permission.asked.push(p); if (permission.refusal) throw permission.refusal; }
      })
    }
  };
});
beforeEach(() => { permission.refusal = null; permission.asked = []; });

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
    PluginManager: TEST_PLUGIN_MANAGER,
    FormsDataManager: {
      getDefinition: () => testForm,
      saveSubmission: (s: object) => Promise.resolve({ ...s, id: 'sub-001' })
    },
    ...overrides
  };

  return {
    getManager: (name: string) => defaultManagers[name],
    // Core hands add-ons their Router (#1861).
    createRouter: () => express.Router()
  };
}

const noopAddon = {
  callHandler: async () => ({ ok: true })
};

function makeContext(engine: ReturnType<typeof makeEngine>) {
  const app = express();
  app.use(express.json());
  app.use('/api/forms', apiRoutes(engine as never, noopAddon, host()));
  return app;
}

// ── 503 / 404 guard rails ─────────────────────────────────────────────────────

describe('POST /api/forms/submit/:formId — guards', () => {
  test('returns 503 when FormsDataManager not registered', async () => {
    const app = makeContext(makeEngine({ FormsDataManager: undefined }));
    const res = await request(app).post('/api/forms/submit/test-form').send({ name: 'Alice' });
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  test('returns 404 when form id not found', async () => {
    const engine = {
      getManager: (name: string) =>
        name === 'FormsDataManager'
          ? { getDefinition: () => null, saveSubmission: async (s: object) => s }
          : undefined,
      createRouter: () => express.Router()
    };
    const app = makeContext(engine);
    const res = await request(app).post('/api/forms/submit/no-such-form').send({ name: 'Alice' });
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
      .send({ name: 'Alice' });
    expect([201, 409]).toContain(res.status); // 201 ok, 409 if handler rejects
    if (res.status === 201) expect(res.body.ok).toBe(true);
  });

  test('succeeds when all obo fields including name are filled', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({
        name: 'Alice',
        onBehalfOf: { name: 'Bob Smith', email: 'bob@example.com', phone: '555-1234', address: '1 Main St' }
      });
    expect([201, 409]).toContain(res.status);
  });

  test('returns 400 when obo email is filled but name is missing', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({
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
      .send({ name: 'Alice', startTime: '14:00', endTime: '13:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end time/i);
  });

  test('returns 400 when endTime equals startTime', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({ name: 'Alice', startTime: '10:00', endTime: '10:00' });
    expect(res.status).toBe(400);
  });

  test('succeeds when endTime is after startTime', async () => {
    const res = await request(app)
      .post('/api/forms/submit/test-form')
      .send({ name: 'Alice', startTime: '10:00', endTime: '12:00' });
    expect([201, 409]).toContain(res.status);
  });
});

// ── Who may submit: form-submit, through ApiContext like every add-on route ──

describe('POST /api/forms/submit/:formId — who may submit (#1749)', () => {
  test('asks form-submit through ApiContext.requirePermission', async () => {
    const res = await request(makeContext(makeEngine())).post('/api/forms/submit/test-form').send({ name: 'Alice' });
    expect(res.status).toBe(201);
    expect(permission.asked).toEqual(['form-submit']);
  });

  test('a refusal is sent by sendApiError, step-up reauth included', async () => {
    const { ApiError } = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
    permission.refusal = new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fview%2FBooks');
    const res = await request(makeContext(makeEngine())).post('/api/forms/submit/test-form').send({ name: 'Alice' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'A fresh sign-in is needed', reauth: '/auth/reauth?next=%2Fview%2FBooks' });
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
    app.use('/api/forms', apiRoutes(engine as never, addon as never, host()));
    return { app, saved };
  }

  test('a value the dropdown did not offer is refused, with a message for that field', async () => {
    const { app, saved } = ledgerApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ fund: 'secret', amount: '10' });
    expect(res.status).toBe(400);
    expect(res.body.fields.fund).toMatch(/choose one/i);
    expect(saved).toEqual([]);
  });

  test('an amount reaches the handler as whole cents', async () => {
    let seen: unknown;
    const { app } = ledgerApp({ handler: async (s) => { seen = s.data; return { ok: true }; } });
    const res = await request(app).post('/api/forms/submit/test-form').send({ fund: 'general', amount: '$1,250.50' });
    expect(res.status).toBe(201);
    expect(seen).toEqual({ fund: 'general', amount: 125050 });
  });

  test('a bad amount is refused next to the field', async () => {
    const { app } = ledgerApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ fund: 'general', amount: '12.345' });
    expect(res.status).toBe(400);
    expect(res.body.fields.amount).toMatch(/amount/i);
  });

  test('a refused submission is not stored, and the handler\'s field messages come back', async () => {
    const { app, saved } = ledgerApp({ handler: async () => ({ ok: false, error: 'Fund is closed', fields: { fund: 'That fund is closed' } }) });
    const res = await request(app).post('/api/forms/submit/test-form').send({ fund: 'general', amount: '5' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ ok: false, error: 'Fund is closed', fields: { fund: 'That fund is closed' } });
    expect(saved).toEqual([]);
  });

  test('an accepted submission is stored after the handler, under the id the handler saw', async () => {
    let handlerId: unknown;
    const { app, saved } = ledgerApp({ handler: async (s) => { handlerId = (s as unknown as { id: string }).id; return { ok: true }; } });
    const res = await request(app).post('/api/forms/submit/test-form').send({ fund: 'general', amount: '5' });
    expect(res.status).toBe(201);
    expect(saved).toHaveLength(1);
    expect((saved[0] as { id: string }).id).toBe(handlerId);
    expect(res.body.submissionId).toBe(handlerId);
  });

  test('a handler\'s ApiError is sent by sendApiError: its status, and only a same-site /auth/reauth link', async () => {
    const { ApiError } = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
    const refuses = (reauth: string) => ledgerApp({ handler: async () => { throw new ApiError(403, 'A fresh sign-in is needed', reauth); } }).app;
    const good = await request(refuses('/auth/reauth?next=%2Fview%2FBooks')).post('/api/forms/submit/test-form').send({ fund: 'general', amount: '5' });
    expect(good.status).toBe(403);
    expect(good.body).toEqual({ success: false, error: 'A fresh sign-in is needed', reauth: '/auth/reauth?next=%2Fview%2FBooks' });
    for (const bad of ['https://evil.example/auth/reauth', '//evil.example/auth/reauth', '/logout', 'javascript:alert(1)']) {
      const res = await request(refuses(bad)).post('/api/forms/submit/test-form').send({ fund: 'general', amount: '5' });
      expect(res.status).toBe(403);
      expect(res.body.reauth).toBeUndefined();
    }
  });

  test('store: false keeps no submission file', async () => {
    const { app, saved } = ledgerApp({ store: false });
    const res = await request(app).post('/api/forms/submit/test-form').send({ fund: 'general', amount: '5' });
    expect(res.status).toBe(201);
    expect(saved).toEqual([]);
  });
});

// ── Checklist: an array of the ticked values (#1904) ──────────────────────────

describe('POST /api/forms/submit/:formId — checklist', () => {
  const depositForm = (required: boolean) => ({
    id: 'test-form',
    title: 'Make a deposit',
    proxySubmission: false,
    store: true,
    fields: [
      { name: 'receiptIds', type: 'checklist', label: 'Receipts', required, optionsSource: 'fetch:LedgerManager.toFormOptions(list=deposit-receipts)', totalField: 'total' },
      { name: 'total', type: 'amount', label: 'Total', required: false }
    ]
  });

  function depositApp(required = true) {
    const seen: unknown[] = [];
    const viewers: unknown[] = [];
    const engine = makeEngine({
      FormsDataManager: { getDefinition: () => depositForm(required), saveSubmission: async (s: object) => s },
      LedgerManager: {
        toFormOptions: async (_o: unknown, viewer: unknown) => {
          viewers.push(viewer);
          return [{ value: 'r1', label: 'Receipt 1', amount: 12000 }, { value: 'r2', label: 'Receipt 2', amount: 22000 }];
        }
      }
    });
    const addon = { callHandler: async (_id: string, s: { data: unknown }) => { seen.push(s.data); return { ok: true }; } };
    const app = express();
    app.use((req, _res, next) => { (req as unknown as { userContext: unknown }).userContext = { username: 'molly' }; next(); });
    app.use(express.json());
    app.use('/api/forms', apiRoutes(engine as never, addon as never, host()));
    return { app, seen, viewers };
  }

  test('the ticked values reach the handler as an array, the options resolved as the viewer', async () => {
    const { app, seen, viewers } = depositApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ receiptIds: ['r1', 'r2'], total: '340' });
    expect(res.status).toBe(201);
    expect(seen).toEqual([{ receiptIds: ['r1', 'r2'], total: 34000 }]);
    expect(viewers).toEqual([{ username: 'molly' }]);
  });

  test('a value the checklist did not offer is refused next to the field, and the handler never runs', async () => {
    const { app, seen } = depositApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ receiptIds: ['r1', 'someone-elses'] });
    expect(res.status).toBe(400);
    expect(res.body.fields.receiptIds).toMatch(/only the listed options/i);
    expect(seen).toEqual([]);
  });

  test('a comma string is not an array, and is refused', async () => {
    const { app, seen } = depositApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ receiptIds: 'r1,r2' });
    expect(res.status).toBe(400);
    expect(res.body.fields.receiptIds).toMatch(/Receipts/);
    expect(seen).toEqual([]);
  });

  test('required: nothing ticked is refused with "tick at least one"', async () => {
    const { app } = depositApp(true);
    for (const body of [{ receiptIds: [] }, {}]) {
      const res = await request(app).post('/api/forms/submit/test-form').send(body);
      expect(res.status).toBe(400);
      expect(res.body.fields.receiptIds).toMatch(/tick at least one/i);
    }
  });

  test('optional: nothing ticked is an empty array', async () => {
    const { app, seen } = depositApp(false);
    const res = await request(app).post('/api/forms/submit/test-form').send({});
    expect(res.status).toBe(201);
    expect(seen).toEqual([{ receiptIds: [] }]);
  });
});

// ── #1916: a failed confirmation email is reported, and the submission still succeeds

describe('POST /api/forms/submit/:formId — confirmation email fails (#1916)', () => {
  test('201 for the submitter; EmailManager records the failure and tells the administrators', async () => {
    const { default: EmailManager } = await import('../../../dist/src/managers/EmailManager.js');
    const createNotification = vi.fn(async () => 'notification_1');
    // EmailManager's own engine: where its failure report goes.
    const core: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key === 'ngdpbase.mail.enabled' ? true : def) },
      NotificationManager: { createNotification, updateNotificationMessage: vi.fn(async () => true) },
      UserManager: { getUsers: async () => [{ username: 'admin' }] },
      PolicyDecisionPoint: { usersHolding: async () => ['admin'] }
    };
    const emailManager = new EmailManager({ getManager: (n: string) => core[n] } as never);
    await emailManager.initialize();
    const send = vi.fn(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:587'); });
    (emailManager as unknown as { provider: unknown }).provider = { send };

    const app = makeContext(makeEngine({ EmailManager: emailManager, ConfigurationManager: core.ConfigurationManager }));
    const res = await request(app).post('/api/forms/submit/test-form').send({ name: 'Alice', email: 'alice@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    await vi.waitFor(() => expect(createNotification).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledTimes(1);
    expect(emailManager.isDeliveryFailing()).toBe(true);
    expect(createNotification.mock.calls[0][0]).toMatchObject({ title: 'Email could not be sent', targetUsers: ['admin'] });
  });
});

// ── Lines: an array of row objects (#1913) ────────────────────────────────────

describe('POST /api/forms/submit/:formId — lines', () => {
  const receiptForm = {
    id: 'test-form',
    title: 'Record a receipt',
    proxySubmission: false,
    store: true,
    fields: [
      {
        name: 'lines', type: 'lines', label: 'Lines', required: true, minRows: 1, maxRows: 20,
        fields: [
          { name: 'amount', type: 'amount', label: 'Amount', required: true },
          { name: 'fundId', type: 'dropdown', label: 'Fund', required: true, optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' },
          { name: 'memo', type: 'text', label: 'Note', required: false }
        ],
        amountField: 'amount', totalField: 'total'
      },
      { name: 'total', type: 'amount', label: 'Total', required: true }
    ]
  };

  function receiptApp(handler: (s: { data: unknown }) => Promise<{ ok: boolean; [k: string]: unknown }> = async () => ({ ok: true })) {
    const seen: unknown[] = [];
    const viewers: unknown[] = [];
    const engine = makeEngine({
      FormsDataManager: { getDefinition: () => receiptForm, saveSubmission: async (s: object) => s },
      LedgerManager: {
        toFormOptions: async (_o: unknown, viewer: unknown) => {
          viewers.push(viewer);
          return [{ value: 'general', label: 'General' }, { value: 'reserve', label: 'Reserve' }];
        }
      }
    });
    const addon = { callHandler: async (_id: string, s: { data: unknown }) => { seen.push(s.data); return handler(s); } };
    const app = express();
    app.use((req, _res, next) => { (req as unknown as { userContext: unknown }).userContext = { username: 'molly' }; next(); });
    app.use(express.json());
    app.use('/api/forms', apiRoutes(engine as never, addon as never, host()));
    return { app, seen, viewers };
  }

  test('the rows reach the handler as an array of objects, amounts in minor units, options resolved once as the viewer', async () => {
    const { app, seen, viewers } = receiptApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({
      lines: [
        { amount: '50', fundId: 'general', memo: '' },
        { amount: '12.50', fundId: 'reserve', memo: 'dues' },
        { amount: '', fundId: '', memo: '' }
      ],
      total: '62.50'
    });
    expect(res.status).toBe(201);
    expect(seen).toEqual([{
      lines: [{ amount: 5000, fundId: 'general', memo: '' }, { amount: 1250, fundId: 'reserve', memo: 'dues' }],
      total: 6250
    }]);
    expect(viewers).toEqual([{ username: 'molly' }]);
  });

  test('a fund the row did not offer is refused next to that row\'s field, and the handler never runs', async () => {
    const { app, seen } = receiptApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({
      lines: [{ amount: '50', fundId: 'general', memo: '' }, { amount: '5', fundId: 'someone-elses', memo: '' }],
      total: '55'
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ 'lines[1].fundId': 'Fund: choose one of the listed options' });
    expect(seen).toEqual([]);
  });

  test('a handler\'s per-row field errors are sent as it returned them', async () => {
    const { app } = receiptApp(async () => ({ ok: false, error: 'Please correct the marked fields', fields: { 'lines[0].fundId': 'That fund is closed', total: 'Does not match the lines' } }));
    const res = await request(app).post('/api/forms/submit/test-form').send({ lines: [{ amount: '50', fundId: 'general', memo: '' }], total: '1' });
    expect(res.status).toBe(409);
    expect(res.body.fields).toEqual({ 'lines[0].fundId': 'That fund is closed', total: 'Does not match the lines' });
  });

  test('required: no lines is refused on the field', async () => {
    const { app, seen } = receiptApp();
    const res = await request(app).post('/api/forms/submit/test-form').send({ lines: [], total: '1' });
    expect(res.status).toBe(400);
    expect(res.body.fields.lines).toBe('Lines: add at least one line');
    expect(seen).toEqual([]);
  });
});

// ── The submission email reads as the form did (#1915) ────────────────────────

describe('POST /api/forms/submit/:formId — submission email', () => {
  const emailForm = {
    id: 'test-form',
    title: 'Record a receipt',
    proxySubmission: false,
    store: true,
    fields: [
      { name: 'email', type: 'email', label: 'Your email', required: true },
      { name: 'fundId', type: 'dropdown', label: 'Fund', required: true, optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' },
      {
        name: 'lines', type: 'lines', label: 'Lines', required: true,
        fields: [
          { name: 'amount', type: 'amount', label: 'Amount', required: true },
          { name: 'fundId', type: 'dropdown', label: 'Line fund', required: true, optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' }
        ]
      },
      { name: 'total', type: 'amount', label: 'Receipt total', required: true }
    ]
  };

  test('labels, choice names resolved once as the submitter, formatted money, and each line', async () => {
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const viewers: unknown[] = [];
    const engine = makeEngine({
      FormsDataManager: { getDefinition: () => emailForm, saveSubmission: async (s: object) => s },
      ConfigurationManager: { getProperty: () => '' },
      // #1916: the route sends through sendInBackground, which never rejects.
      EmailManager: { isEnabled: () => true, sendInBackground: (_ctx: unknown, to: string, subject: string, text: string) => { sent.push({ to, subject, text }); } },
      LedgerManager: {
        toFormOptions: async (_o: unknown, viewer: unknown) => {
          viewers.push(viewer);
          return [{ value: 'general', label: 'General Fund' }, { value: 'reserve', label: 'Reserve Fund' }];
        }
      }
    });
    const app = express();
    app.use((req, _res, next) => { (req as unknown as { userContext: unknown }).userContext = { username: 'molly' }; next(); });
    app.use(express.json());
    app.use('/api/forms', apiRoutes(engine as never, noopAddon, host()));
    const res = await request(app).post('/api/forms/submit/test-form').send({
      email: 'molly@example.com',
      fundId: 'general',
      lines: [{ amount: '50', fundId: 'reserve' }, { amount: '12.50', fundId: 'general' }],
      total: '62.50'
    });
    expect(res.status).toBe(201);
    expect(sent).toHaveLength(1);
    const money = (c: number): string => TEST_PLUGIN_MANAGER.formatters.formatMoney(c, 'USD');
    expect(sent[0].text).toContain([
      'Details:',
      '  Your email: molly@example.com',
      '  Fund: General Fund',
      '  Lines:',
      `    1. Amount: ${money(5000)} · Line fund: Reserve Fund`,
      `    2. Amount: ${money(1250)} · Line fund: General Fund`,
      `  Receipt total: ${money(6250)}`
    ].join('\n'));
    // Asked once per choice field, as the submitter: the validation's own resolution.
    expect(viewers).toEqual([{ username: 'molly' }, { username: 'molly' }]);
  });
});

// ── "notify": false sends no notice and no email (#1954) ──────────────────────

describe('POST /api/forms/submit/:formId — notify (#1954)', () => {
  const noteForm = {
    id: 'test-form',
    title: 'Health note',
    proxySubmission: false,
    store: false,
    fields: [
      { name: 'email', type: 'email', label: 'Your email', required: true },
      { name: 'note', type: 'textarea', label: 'Note', required: true }
    ]
  };

  function noteApp(notify?: boolean) {
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const notices: unknown[] = [];
    const engine = makeEngine({
      FormsDataManager: {
        getDefinition: () => (notify === undefined ? noteForm : { ...noteForm, notify }),
        saveSubmission: async (s: object) => s
      },
      ConfigurationManager: { getProperty: () => '' },
      EmailManager: { isEnabled: () => true, sendInBackground: (_ctx: unknown, to: string, subject: string, text: string) => { sent.push({ to, subject, text }); } },
      NotificationManager: { createNotification: async (n: unknown) => { notices.push(n); return 'n1'; } },
      UserManager: { searchUsers: async () => [{ username: 'admin' }] }
    });
    return { app: makeContext(engine), sent, notices };
  }

  const body = { email: 'pat@example.com', note: 'private health text' };

  test('notify: false creates no notification and sends no email, even with an email field', async () => {
    const { app, sent, notices } = noteApp(false);
    const res = await request(app).post('/api/forms/submit/test-form').send(body);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(sent).toEqual([]);
    expect(notices).toEqual([]);
  });

  test('a form that does not say notify still notifies and emails, as before', async () => {
    for (const notify of [undefined, true]) {
      const { app, sent, notices } = noteApp(notify);
      const res = await request(app).post('/api/forms/submit/test-form').send(body);
      expect(res.status).toBe(201);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('pat@example.com');
      await vi.waitFor(() => expect(notices).toHaveLength(1));
      expect(notices[0]).toMatchObject({ title: 'New form submission: Health note', targetUsers: ['admin'] });
    }
  });
});

// ── The submission notice goes to the form's notifyRole only (#1957) ─────────

describe('POST /api/forms/submit/:formId — who gets the notice (#1957)', () => {
  // Real core: UserManager.searchUsers over RoleManager membership, and a
  // NotificationManager in a temp folder. Only the stores beneath are stubbed.
  const holders: Record<string, string[]> = { reader: ['alice'], admin: ['root'], treasurer: ['tess'] };
  let tempDir: string;
  let notifications: InstanceType<typeof import('../../../dist/src/managers/NotificationManager.js').default> | undefined;
  let searched: unknown[][];

  async function app(form: Record<string, unknown>) {
    const [{ default: NotificationManager }, { default: UserManager }, { default: RoleManager }] = await Promise.all([
      import('../../../dist/src/managers/NotificationManager.js'),
      import('../../../dist/src/managers/UserManager.js'),
      import('../../../dist/src/managers/RoleManager.js')
    ]);
    const managers: Record<string, unknown> = {
      PluginManager: TEST_PLUGIN_MANAGER,
      FormsDataManager: { getDefinition: () => form, saveSubmission: async (s: object) => s },
      ConfigurationManager: {
        getProperty: (_key: string, def: unknown) => def,
        getResolvedDataPath: (key: string, def: string) => (key === 'ngdpbase.notifications.dir' ? tempDir : def)
      },
      IdentityManager: { getByUserIdentifier: async (_ctx: unknown, username: string) => ({ '@id': `urn:person:${username}`, identifier: username }) }
    };
    const engine = { getManager: (name: string) => managers[name], createRouter: () => express.Router() };

    const roleManager = new RoleManager(engine as never);
    Object.assign(roleManager, {
      listByMember: async (personId: string) => Object.entries(holders)
        .filter(([, members]) => members.some((u) => `urn:person:${u}` === personId))
        .map(([namedPosition]) => ({ '@id': namedPosition, namedPosition, organization: { '@id': 'org' } }))
    });
    const userManager = new UserManager(engine as never);
    const realSearch = userManager.searchUsers.bind(userManager);
    Object.assign(userManager, {
      getUsers: async () => ['alice', 'root', 'tess'].map((username) => ({ username, isActive: true })),
      searchUsers: async (...args: Parameters<typeof realSearch>) => { searched.push(args); return realSearch(...args); }
    });
    notifications = new NotificationManager(engine as never);
    await notifications.initialize({});
    Object.assign(managers, { RoleManager: roleManager, UserManager: userManager, NotificationManager: notifications });
    return makeContext(engine);
  }

  const form = { id: 'test-form', title: 'Repair request', proxySubmission: false, fields: [{ name: 'name', type: 'text', label: 'Name', required: true }] };
  const titles = (username: string) => notifications.getUserNotifications(username).map((n) => n.title);

  beforeEach(async () => {
    searched = [];
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-notify-'));
  });
  afterEach(async () => {
    await notifications?.shutdown();
    notifications = undefined;
    // Only this test's own temp folder; never a data/ directory.
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  test('the default notifyRole (admin): an admin gets the notice, a reader gets nothing', async () => {
    const res = await request(await app({ ...form, notifyRole: 'admin' })).post('/api/forms/submit/test-form').send({ name: 'Pat' });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(titles('root')).toEqual(['New form submission: Repair request']));
    expect(titles('alice')).toEqual([]);
    expect(titles('tess')).toEqual([]);
    expect(notifications.getAllNotifications().map((n) => n.targetUsers)).toEqual([['root']]);
    // Finding the recipients is core's own work (#2018): the system context
    // with a reason, never the submitter's, so it needs no search-user of
    // theirs. This site has no decision point at all, so a submitter's
    // context would be refused and nobody told.
    expect(searched).toEqual([['', { role: 'admin', limit: 0 }, expect.objectContaining({ origin: 'boot', reason: expect.stringMatching(/^forms: find the holders of 'admin'/) })]]);
    expect(searched[0][2]).not.toBe(SUBMITTER);
  });

  test('a custom notifyRole is honoured: only its holders are told', async () => {
    await request(await app({ ...form, notifyRole: 'treasurer' })).post('/api/forms/submit/test-form').send({ name: 'Pat' });
    await vi.waitFor(() => expect(titles('tess')).toEqual(['New form submission: Repair request']));
    expect(titles('root')).toEqual([]);
    expect(titles('alice')).toEqual([]);
  });

  test('a role nobody holds sends nothing — never a notice to everyone', async () => {
    const res = await request(await app({ ...form, notifyRole: 'clubhouse-manager' })).post('/api/forms/submit/test-form').send({ name: 'Pat' });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(searched).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notifications.getAllNotifications()).toEqual([]);
    for (const u of ['alice', 'root', 'tess']) expect(titles(u)).toEqual([]);
  });

  test('a definition that leaves notifyRole out notifies admins (the schema default)', async () => {
    const { FormDefinitionSchema } = await import('../managers/FormsDataManager');
    await request(await app(FormDefinitionSchema.parse(form))).post('/api/forms/submit/test-form').send({ name: 'Pat' });
    await vi.waitFor(() => expect(titles('root')).toHaveLength(1));
    expect(titles('alice')).toEqual([]);
  });
});

describe('POST /api/forms/submit/:formId — formVersion (#1973)', () => {
  function submitTo(form: Record<string, unknown>) {
    const saved: Array<Record<string, unknown>> = [];
    const handled: Array<Record<string, unknown>> = [];
    const engine = makeEngine({
      FormsDataManager: { getDefinition: () => form, saveSubmission: async (s: Record<string, unknown>) => { saved.push(s); return s; } }
    });
    const app = express();
    app.use(express.json());
    app.use('/api/forms', apiRoutes(engine as never, { callHandler: async (_id: string, s: unknown) => { handled.push(s as Record<string, unknown>); return { ok: true }; } }, host()));
    return { app, saved, handled };
  }

  test('a submission to a form an add-on provides records the add-on version', async () => {
    const { app, saved, handled } = submitTo({ ...testForm, providedBy: { addon: 'phr', version: '1.2.0' } });
    const res = await request(app).post('/api/forms/submit/test-form').send({ name: 'Alice' });
    expect(res.status).toBe(201);
    expect(saved[0]?.['formVersion']).toBe('1.2.0');
    expect(handled[0]?.['formVersion']).toBe('1.2.0');
  });

  test('a submission to a site-built form has none', async () => {
    const { app, saved } = submitTo(testForm);
    await request(app).post('/api/forms/submit/test-form').send({ name: 'Alice' });
    expect(saved[0]).not.toHaveProperty('formVersion');
  });
});
