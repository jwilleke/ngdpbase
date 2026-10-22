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
      // The request's subject the route forwards to the manager (P1).
      getActor: () => ({ username: 'admin', roles: ['admin'], isAuthenticated: true }),
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
      optionsSource: 'fetch:LedgerManager.toFormOptions(list=receipts)', totalField: 'amount' },
    { name: 'items', type: 'lines', label: 'Items', required: false, minRows: 1, maxRows: 5,
      amountField: 'cost', totalField: 'amount',
      fields: [
        { name: 'what', type: 'text', label: 'What', required: true },
        { name: 'cost', type: 'amount', label: 'Cost', required: true }
      ] }
  ];
  const noStore: FormDefinition = {
    id: 'deposit', title: 'Deposit', handler: 'ledger', proxySubmission: true, notifyRole: 'treasurer',
    confirmationUrl: '/view/deposits', store: false, notify: true, fields: fields as FormDefinition['fields']
  };

  /** What the builder page posts for this form when the admin changes nothing. */
  function unchanged(form: FormDefinition): Record<string, string> {
    return {
      title: form.title, handler: form.handler ?? '', notifyRole: form.notifyRole,
      confirmationUrl: form.confirmationUrl ?? '', proxySubmission: form.proxySubmission ? 'on' : '',
      storeShown: '1', ...(form.store === false ? {} : { store: 'on' }),
      notifyShown: '1', ...(form.notify === false ? {} : { notify: 'on' }),
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
 * #1954 — the "Send notices" box: the same marker pattern as Store submissions,
 * so a builder save keeps `notify: false` (the #1922 store bug, for notify).
 */
describe('POST /forms/builder — the Send notices box (#1954)', () => {
  const quiet: FormDefinition = {
    id: 'note', title: 'Health note', proxySubmission: false, notifyRole: 'admin', store: false, notify: false,
    fields: [{ name: 'note', type: 'textarea', label: 'Note', required: true }]
  };
  const post = (form: FormDefinition, extra: Record<string, string> = {}): Record<string, string> => ({
    title: form.title, notifyRole: form.notifyRole, storeShown: '1', notifyShown: '1',
    fieldsJson: JSON.stringify(form.fields), ...extra
  });

  test('saving a notify:false form unchanged keeps notify:false', async () => {
    const { app, saved } = makeApp({ note: quiet });
    const res = await request(app).post('/forms/builder/note').type('form').send(post(quiet));
    expect(res.status).toBe(302);
    expect(saved[0]).toEqual(quiet);
  });

  test('ticking the box turns notices on; unticking turns them off', async () => {
    const on = makeApp({ note: quiet });
    await request(on.app).post('/forms/builder/note').type('form').send(post(quiet, { notify: 'on' }));
    expect((on.saved[0] as FormDefinition).notify).toBe(true);

    const loud = { ...quiet, notify: true };
    const off = makeApp({ note: loud });
    await request(off.app).post('/forms/builder/note').type('form').send(post(loud));
    expect((off.saved[0] as FormDefinition).notify).toBe(false);
  });

  test('a post without the marker keeps the form\'s value; a new form notifies by default', async () => {
    const { app, saved } = makeApp({ note: quiet });
    const { notifyShown: _marker, ...old } = post(quiet);
    await request(app).post('/forms/builder/note').type('form').send(old);
    expect((saved[0] as FormDefinition).notify).toBe(false);

    const fresh = makeApp();
    await request(fresh.app).post('/forms/builder').type('form').send({ id: 'fresh', title: 'T', fieldsJson: oneField });
    expect((fresh.saved[0] as FormDefinition).notify).toBe(true);
  });

  test('a re-rendered builder after a validation error shows the box as the admin left it', async () => {
    const { app, saved } = makeApp({ note: quiet });
    const res = await request(app).post('/forms/builder/note').type('form').send(post(quiet, { fieldsJson: '[]' }));
    expect(res.status).toBe(400);
    expect(res.body.form.notify).toBe(false);
    expect(saved).toHaveLength(0);
  });
});

/**
 * #1973 with the real manager: a form an add-on provides is read-only on the
 * site. The builder refuses to open, save or delete it on the server, and a
 * new form cannot take its id. A site-built form still saves through the same
 * routes. Works in its own mkdtemp folder and removes only that folder.
 */
describe('builder routes refuse a form an add-on provides (#1973)', () => {
  const BOOT = { username: 'system', origin: 'boot' as const, requestedAt: new Date().toISOString(), reason: 'test' };
  let dir: string;
  beforeEach(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-1973-builder-')); });
  afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

  /** Core's add-on registry: whether the load pass is over, and whether phr loaded. */
  const state = { done: false, phrLoaded: true };
  beforeEach(() => { state.done = false; state.phrLoaded = true; });

  async function setUp() {
    const addons = {
      getAddonVersion: (slug: string) => (slug === 'phr' ? '1.2.0' : undefined),
      addonsLoaded: () => state.done,
      isLoaded: (slug: string) => slug === 'phr' && state.phrLoaded
    };
    const m = new FormsDataManager({ getManager: (name: string) => (name === 'AddonsManager' ? addons : undefined) }, dir);
    await m.initialize();
    await m.registerShippedForm('phr', {
      id: 'phr-note', title: 'Health note', store: false, notify: false,
      fields: [{ name: 'note', type: 'textarea', label: 'Note', required: true }]
    }, BOOT);
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((_req, res, next) => {
      res.render = ((view: string, locals?: object) => { res.json({ view, ...locals }); });
      next();
    });
    const engine = { getManager: () => m, createRouter: () => express.Router() };
    app.use('/forms/builder', builderRoutes(engine as never));
    const file = path.join(dir, 'definitions', 'phr-note.json');
    return { m, app, file, before: await fsp.readFile(file, 'utf8') };
  }

  test('the builder page, a save and a delete are 403, naming the add-on and version, and nothing changes', async () => {
    const { app, file, before } = await setUp();
    const open = await request(app).get('/forms/builder/phr-note');
    expect(open.status).toBe(403);
    expect(open.text).toContain('provided by phr 1.2.0');

    const save = await request(app).post('/forms/builder/phr-note').type('form')
      .send({ title: 'Ours', notifyRole: 'admin', storeShown: '1', notifyShown: '1', notify: 'on', fieldsJson: oneField });
    expect(save.status).toBe(403);

    const del = await request(app).post('/forms/builder/phr-note/delete').type('form').send({});
    expect(del.status).toBe(403);
    expect(await fsp.readFile(file, 'utf8')).toBe(before);
  });

  test('a new form cannot take its id', async () => {
    const { app, file, before } = await setUp();
    const res = await request(app).post('/forms/builder').type('form').send({ id: 'phr-note', title: 'T', fieldsJson: oneField });
    expect(res.status).toBe(409);
    expect(await fsp.readFile(file, 'utf8')).toBe(before);
  });

  test('a site-built form still saves and deletes through the same routes', async () => {
    const { app, m } = await setUp();
    expect((await request(app).post('/forms/builder').type('form').send({ id: 'ours', title: 'Ours', fieldsJson: oneField })).status).toBe(302);
    expect((await request(app).post('/forms/builder/ours').type('form').send({ title: 'Ours 2', fieldsJson: oneField })).status).toBe(302);
    expect(m.getDefinition('ours')?.title).toBe('Ours 2');
    expect(m.getDefinition('ours')?.providedBy).toBeUndefined();
    expect((await request(app).post('/forms/builder/ours/delete').type('form').send({})).status).toBe(302);
    expect(m.getDefinition('ours')).toBeUndefined();
  });

  test('after load, a still-provided form is still refused (403); a form its add-on no longer provides deletes (302), not edits (403)', async () => {
    const { app, m, file } = await setUp();
    state.done = true;
    expect((await request(app).post('/forms/builder/phr-note/delete').type('form').send({})).status).toBe(403);

    state.phrLoaded = false;
    expect((await request(app).get('/forms/builder/phr-note')).status).toBe(403);
    const del = await request(app).post('/forms/builder/phr-note/delete').type('form').send({});
    expect(del.status).toBe(302);
    expect(del.headers['location']).toBe('/addons/forms?flash=deleted');
    expect(m.getDefinition('phr-note')).toBeUndefined();
    await expect(fsp.access(file)).rejects.toThrow();
  });

  test('a form its add-on no longer provides, with submissions, is kept and the reason sent as text (409)', async () => {
    const { app, m, file, before } = await setUp();
    state.done = true;
    state.phrLoaded = false;
    await m.saveSubmission({ formId: 'phr-note', submittedAt: new Date().toISOString(), submittedBy: 'u', data: {}, status: 'pending' });
    const del = await request(app).post('/forms/builder/phr-note/delete').type('form').send({});
    expect(del.status).toBe(409);
    expect(del.text).toContain('1 submission exist');
    expect(await fsp.readFile(file, 'utf8')).toBe(before);
  });
});
