/**
 * Builder routes — the validation error path (#1276).
 *
 * A form definition that fails FormDefinitionSchema re-renders the builder
 * with 400 and one message per zod issue. zod 4 renamed `ZodError.errors` to
 * `issues`; this pins that the messages still reach the page.
 */

import express from 'express';
import request from 'supertest';
import builderRoutes from '../routes/builder';

vi.mock('../../../dist/src/context/ApiContext', () => ({
  ApiContext: {
    from: () => ({
      requireAuthenticated: () => undefined,
      requirePermission: async () => undefined
    })
  },
  ApiError: class ApiError extends Error { status = 403; }
}), { virtual: true });

function makeApp(existing: string[] = []) {
  const saved: unknown[] = [];
  const engine = {
    getManager: (name: string) => (name === 'FormsDataManager'
      ? {
        getDefinition: (id: string) => (existing.includes(id) ? { id } : undefined),
        saveDefinition: async (d: unknown) => { saved.push(d); }
      }
      : undefined)
  };
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  // Capture what the route renders instead of needing the view engine.
  app.use((_req, res, next) => {
    res.render = ((view: string, locals?: object) => { res.json({ view, ...locals }); });
    next();
  });
  app.use('/forms/builder', builderRoutes(engine as never));
  return { app, saved };
}

const oneField = JSON.stringify([{ name: 'name', type: 'text', label: 'Name', required: true }]);

describe('POST /forms/builder — validation errors (#1276)', () => {
  test('a new form with an invalid id re-renders with 400 and the zod messages', async () => {
    const { app, saved } = makeApp();
    const res = await request(app).post('/forms/builder').type('form')
      .send({ id: 'Bad ID!', title: 'T', fieldsJson: oneField });
    expect(res.status).toBe(400);
    expect(res.body.view).toBe('forms-builder');
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/^id: Form id must be lowercase alphanumeric with hyphens$/)
    ]));
    expect(saved).toHaveLength(0);
  });

  test('an edited form with no fields re-renders with 400 and a fields message', async () => {
    const { app, saved } = makeApp(['good-id']);
    const res = await request(app).post('/forms/builder/good-id').type('form')
      .send({ title: 'T', fieldsJson: '[]' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.startsWith('fields'))).toBe(true);
    expect(saved).toHaveLength(0);
  });
});
