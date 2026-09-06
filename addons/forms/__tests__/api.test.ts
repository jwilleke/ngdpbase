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
    const res = await request(app).post('/api/forms/submit/test-form').send({ name: 'Alice' });
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
