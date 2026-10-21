/**
 * POST /addons/forms/:formId/sync (#1880): asks admin-system, passes the
 * admin's confirmed overwrite through and nothing else, and answers with the
 * forms admin flash for what the manager did.
 */

import express from 'express';
import request from 'supertest';
import adminRoutes from '../routes/admin';

const asked: string[] = [];

vi.mock('../../../dist/src/context/ApiContext', () => ({
  ApiContext: {
    from: () => ({ requirePermission: async (p: string) => { asked.push(p); } })
  },
  ApiError: class ApiError extends Error { status = 403; },
  sendApiError: () => undefined
}), { virtual: true });

function makeApp(result: string) {
  const calls: Array<{ id: string; options: unknown }> = [];
  const engine = {
    getManager: (name: string) => (name === 'FormsDataManager'
      ? { syncShippedForm: async (id: string, options: unknown) => { calls.push({ id, options }); return result; } }
      : undefined),
    createRouter: () => express.Router()
  };
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use('/addons/forms', adminRoutes(engine as never, null));
  return { app, calls };
}

beforeEach(() => { asked.length = 0; });

describe('POST /addons/forms/:formId/sync (#1880)', () => {
  test('a plain Sync never asks to overwrite edits, and redirects with synced', async () => {
    const { app, calls } = makeApp('synced');
    const res = await request(app).post('/addons/forms/record-entry/sync').type('form').send({});
    expect(asked).toEqual(['admin-system']);
    expect(calls).toEqual([{ id: 'record-entry', options: { overwriteEdited: false } }]);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/addons/forms?flash=synced');
  });

  test('an edited copy refused by the manager redirects with sync-edited', async () => {
    const { app } = makeApp('edited');
    const res = await request(app).post('/addons/forms/record-entry/sync').type('form').send({});
    expect(res.headers['location']).toBe('/addons/forms?flash=sync-edited');
  });

  test('the confirmed overwrite is passed through', async () => {
    const { app, calls } = makeApp('synced');
    await request(app).post('/addons/forms/record-entry/sync').type('form').send({ overwrite: '1' });
    expect(calls[0]?.options).toEqual({ overwriteEdited: true });
  });

  test('a form no add-on ships is 404', async () => {
    const { app } = makeApp('not-shipped');
    const res = await request(app).post('/addons/forms/site-made/sync').type('form').send({});
    expect(res.status).toBe(404);
  });
});

describe('GET /addons/forms: shipped forms as Required Pages reads them (#1918)', () => {
  function listApp(states: Record<string, unknown>) {
    const defs = Object.keys(states).map((id) => ({ id, title: `T ${id}`, fields: [] }));
    const engine = {
      getManager: (name: string) => (name === 'FormsDataManager'
        ? {
          getAllDefinitions: () => defs,
          getSubmissionCount: async () => 0,
          shippedFormState: (id: string) => states[id]
        }
        : undefined),
      createRouter: () => express.Router()
    };
    const app = express();
    app.use((_req, res, next) => {
      res.render = (_view: string, data?: unknown) => { res.json(data); };
      next();
    });
    app.use('/addons/forms', adminRoutes(engine as never, null));
    return app;
  }

  test('each shipped form gets the shared status words; Required only while a required change is waiting', async () => {
    const base = { addon: 'accounting', stamped: true, shippedChanged: true };
    const res = await request(listApp({
      cur: { ...base, status: 'current', shippedChanged: false, behind: false, required: true },
      out: { ...base, status: 'outdated', behind: true, required: true },
      ed: { ...base, status: 'locally-modified', behind: true, required: true },
      mine: { ...base, status: 'locally-modified', shippedChanged: false, behind: false, required: true },
      plain: { ...base, status: 'outdated', behind: true, required: false },
      site: undefined
    })).get('/addons/forms');
    expect(asked).toEqual(['admin-system']);
    const rows = (res.body as { shippedForms: Array<Record<string, unknown>> }).shippedForms;
    const by = (id: string) => rows.find((r) => r['id'] === id);
    expect(rows.map((r) => r['id'])).toEqual(['cur', 'out', 'ed', 'mine', 'plain']);
    expect(by('cur')).toMatchObject({ status: 'current', userModified: false, required: false });
    expect(by('out')).toMatchObject({ status: 'modified', userModified: false, required: true });
    expect(by('ed')).toMatchObject({ status: 'modified', userModified: true, required: true });
    expect(by('mine')).toMatchObject({ status: 'modified', userModified: true, required: false });
    expect(by('plain')).toMatchObject({ status: 'modified', userModified: false, required: false });
    expect((res.body as { shippedCounts: unknown }).shippedCounts).toEqual({ modified: 4, current: 1, required: 2 });
  });
});
