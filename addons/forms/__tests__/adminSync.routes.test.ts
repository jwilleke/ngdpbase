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
