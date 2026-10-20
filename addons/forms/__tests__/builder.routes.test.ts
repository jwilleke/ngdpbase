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
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import FormsDataManager from '../managers/FormsDataManager';
import type { FormDefinition } from '../managers/FormsDataManager';

vi.mock('../../../dist/src/context/ApiContext', () => ({
  ApiContext: {
    from: () => ({
      requireAuthenticated: () => undefined,
      requirePermission: async () => undefined
    })
  },
  ApiError: class ApiError extends Error { status = 403; }
}), { virtual: true });

function makeApp(existing: string[] | Record<string, FormDefinition> = []) {
  const saved: unknown[] = [];
  const defs: Record<string, unknown> = Array.isArray(existing)
    ? Object.fromEntries(existing.map(id => [id, { id }]))
    : existing;
  const engine = {
    getManager: (name: string) => (name === 'FormsDataManager'
      ? {
        getDefinition: (id: string) => defs[id],
        saveDefinition: async (d: unknown) => { saved.push(d); }
      }
      : undefined),
    // Core hands add-ons their Router (#1861).
    createRouter: () => express.Router()
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

/**
 * #1921 — the builder keeps what it has no input for. `store` has a checkbox
 * now; the builder's page always sends `storeShown` beside it, so an unticked
 * box (no `store` key) means "don't store", and a post without the marker
 * keeps the form's value.
 */
describe('POST /forms/builder — store and the properties the builder has no input for (#1921)', () => {
  const fields = [
    { name: 'amount', type: 'amount', label: 'Amount', required: true },
    { name: 'receipts', type: 'checklist', label: 'Receipts', required: false,
      optionsSource: 'fetch:LedgerManager.toFormOptions(list=receipts)', totalField: 'amount' }
  ];
  const noStore: FormDefinition = {
    id: 'deposit', title: 'Deposit', handler: 'ledger', proxySubmission: true, notifyRole: 'treasurer',
    confirmationUrl: '/view/deposits', store: false, fields: fields as FormDefinition['fields']
  };

  /** What the builder page posts for this form when the admin changes nothing. */
  function unchanged(form: FormDefinition): Record<string, string> {
    return {
      title: form.title, handler: form.handler ?? '', notifyRole: form.notifyRole,
      confirmationUrl: form.confirmationUrl ?? '', proxySubmission: form.proxySubmission ? 'on' : '',
      storeShown: '1', ...(form.store === false ? {} : { store: 'on' }),
      fieldsJson: JSON.stringify(form.fields)
    };
  }

  test('saving a store:false form unchanged keeps store:false', async () => {
    const { app, saved } = makeApp({ deposit: noStore });
    const res = await request(app).post('/forms/builder/deposit').type('form').send(unchanged(noStore));
    expect(res.status).toBe(302);
    expect(saved).toHaveLength(1);
    expect((saved[0] as FormDefinition).store).toBe(false);
  });

  test('ticking the box turns storing on; unticking a storing form turns it off', async () => {
    const on = makeApp({ deposit: noStore });
    await request(on.app).post('/forms/builder/deposit').type('form').send({ ...unchanged(noStore), store: 'on' });
    expect((on.saved[0] as FormDefinition).store).toBe(true);

    const storing = { ...noStore, store: true };
    const off = makeApp({ deposit: storing });
    const { store: _ticked, ...unticked } = unchanged(storing);
    await request(off.app).post('/forms/builder/deposit').type('form').send(unticked);
    expect((off.saved[0] as FormDefinition).store).toBe(false);
  });

  test('a post without the checkbox (a page loaded before it existed) keeps the form\'s value', async () => {
    const { app, saved } = makeApp({ deposit: noStore });
    const { storeShown: _marker, ...old } = unchanged(noStore);
    await request(app).post('/forms/builder/deposit').type('form').send(old);
    expect((saved[0] as FormDefinition).store).toBe(false);
  });

  test('a new form stores by default and follows the box', async () => {
    const a = makeApp();
    await request(a.app).post('/forms/builder').type('form').send({ id: 'fresh', title: 'T', fieldsJson: oneField });
    expect((a.saved[0] as FormDefinition).store).toBe(true);

    const b = makeApp();
    await request(b.app).post('/forms/builder').type('form').send({ id: 'fresh', title: 'T', storeShown: '1', fieldsJson: oneField });
    expect((b.saved[0] as FormDefinition).store).toBe(false);
  });

  test('every other property survives an unchanged save, sub-field ones included', async () => {
    const { app, saved } = makeApp({ deposit: noStore });
    await request(app).post('/forms/builder/deposit').type('form').send(unchanged(noStore));
    expect(saved[0]).toEqual(noStore);
  });

  test('a re-rendered builder after a validation error shows the box as the admin left it', async () => {
    const { app, saved } = makeApp({ deposit: noStore });
    const res = await request(app).post('/forms/builder/deposit').type('form').send({ ...unchanged(noStore), fieldsJson: '[]' });
    expect(res.status).toBe(400);
    expect(res.body.form.store).toBe(false);
    expect(saved).toHaveLength(0);
  });
});

/**
 * #1921 with the real manager: an unchanged builder save of a shipped
 * store:false form is not an edit, so it stays up to date (#1880). Works in its
 * own mkdtemp folder and removes only that folder.
 */
describe('builder save of a shipped store:false form (#1921, #1880)', () => {
  let dir: string;
  beforeEach(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-1921-')); });
  afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

  test('an unchanged save keeps store:false and the copy stays up to date', async () => {
    const m = new FormsDataManager(null, dir);
    await m.initialize();
    await m.registerShippedForm('ledger', {
      id: 'deposit', title: 'Deposit', proxySubmission: false, notifyRole: 'admin', store: false,
      fields: [{ name: 'total', type: 'amount', label: 'Total', required: true }]
    });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    const engine = { getManager: () => m, createRouter: () => express.Router() };
    app.use('/forms/builder', builderRoutes(engine as never));

    const live = m.getDefinition('deposit')!;
    const res = await request(app).post('/forms/builder/deposit').type('form')
      .send({ title: live.title, notifyRole: live.notifyRole, storeShown: '1', fieldsJson: JSON.stringify(live.fields) });
    expect(res.status).toBe(302);
    expect(m.getDefinition('deposit')!.store).toBe(false);
    expect(m.shippedFormState('deposit')!.status).toBe('current');
  });
});
