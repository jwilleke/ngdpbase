/**
 * #2548 (slice 3 of #2391): a form can name the permission that submits it.
 *
 * - A form with no `submitPermission` asks `form-submit`, as before.
 * - A form that names one asks that permission instead, in the submit route (which decides for
 *   itself, whatever the page showed) and when the form is drawn (nothing for a person who lacks it).
 * - A name the site has not declared, or a site whose permissions cannot be read, fails closed:
 *   the route refuses and the form is not drawn. It never falls back to `form-submit`.
 * - A definition whose `submitPermission` is not a non-blank string is rejected when it loads.
 *
 * Each test that touches disk works in its own mkdtemp folder and removes only that folder.
 */

import express from 'express';
import request from 'supertest';
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import apiRoutes from '../routes/api';
import FormsDataManager, { FormDefinitionSchema } from '../managers/FormsDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';
import { asExecuted, TEST_PLUGIN_MANAGER } from '../../../dist/src/test-support/plugins.js';
import { resolveSubmitPermission, declaredPermissionNames } from '../managers/submitPermission';

const host = () => buildAddonHost('forms', {});

// What the request's context answers, set per test. `held` is the set of permissions the caller
// holds; `signedIn` decides the refusal's status, as core's requirePermission does.
const caller: { held: Set<string>; signedIn: boolean; asked: string[] } = { held: new Set(), signedIn: true, asked: [] };
const { SUBJECT } = vi.hoisted(() => ({ SUBJECT: { username: 'testuser', roles: ['reader'], isAuthenticated: true } }));
vi.mock('../../../dist/src/context/ApiContext', async () => {
  const real = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
  return {
    ...real,
    ApiContext: {
      from: () => ({
        username: 'testuser',
        get isAuthenticated() { return caller.signedIn; },
        subject: SUBJECT,
        getActor: () => SUBJECT,
        requirePermission: async (p: string) => {
          caller.asked.push(p);
          if (!caller.held.has(p)) throw new real.ApiError(caller.signedIn ? 403 : 401, 'Forbidden');
        }
      })
    }
  };
});
beforeEach(() => { caller.held = new Set(); caller.signedIn = true; caller.asked = []; });

const DECLARED = {
  'form-submit': {},
  'association-notice-post': {},
  'association-event-post': {}
};

const gatedForm = {
  id: 'post-notice',
  title: 'Post a notice',
  fields: [{ name: 'text', type: 'text', label: 'Notice', required: true }],
  submitPermission: 'association-notice-post'
};
const openForm = { id: 'open-form', title: 'Open form', fields: [{ name: 'text', type: 'text', label: 'Text', required: true }] };

describe('submitPermission in a definition', () => {
  const minimal = { id: 'f', title: 'F', fields: [{ name: 'n', type: 'text', label: 'N' }] };

  test('a name is kept as written', () => {
    const parsed = FormDefinitionSchema.safeParse({ ...minimal, submitPermission: 'association-notice-post' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.submitPermission).toBe('association-notice-post');
  });

  test('none is allowed', () => {
    const parsed = FormDefinitionSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.submitPermission).toBeUndefined();
  });

  test.each([[''], ['   '], [42], [null], [true], [{}], [['form-submit']]])('%j is rejected', (value) => {
    expect(FormDefinitionSchema.safeParse({ ...minimal, submitPermission: value }).success).toBe(false);
  });

  describe('when the definitions load', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-2548-'));
      await fsp.mkdir(path.join(dir, 'definitions'), { recursive: true });
    });
    afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

    test.each([[''], [42]])('a definition with submitPermission %j is not loaded, and a good one still is', async (value) => {
      await fsp.writeFile(path.join(dir, 'definitions', 'bad.json'), JSON.stringify({ ...minimal, id: 'bad', submitPermission: value }));
      await fsp.writeFile(path.join(dir, 'definitions', 'good.json'), JSON.stringify({ ...minimal, id: 'good', submitPermission: 'form-submit' }));
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const m = new FormsDataManager(null, dir, host());
      await m.initialize();
      expect(m.getDefinition('bad')).toBeUndefined();
      expect(m.getDefinition('good')?.submitPermission).toBe('form-submit');
    });
  });
});

describe('resolveSubmitPermission: the permission to ask', () => {
  const declared = new Set(['form-submit', 'association-notice-post']);

  test('none named: form-submit, with or without a readable catalogue', () => {
    expect(resolveSubmitPermission({}, declared)).toBe('form-submit');
    expect(resolveSubmitPermission({}, null)).toBe('form-submit');
  });

  test('a declared name: that permission', () => {
    expect(resolveSubmitPermission({ submitPermission: 'association-notice-post' }, declared)).toBe('association-notice-post');
  });

  test('an undeclared name fails closed', () => {
    expect(resolveSubmitPermission({ submitPermission: 'association-notce-post' }, declared)).toBeNull();
  });

  test('a catalogue that cannot be read cannot vouch for a name', () => {
    expect(resolveSubmitPermission({ submitPermission: 'association-notice-post' }, null)).toBeNull();
  });

  test.each([[''], [42], [null]])('a value that is not a name (%j) fails closed', (value) => {
    expect(resolveSubmitPermission({ submitPermission: value as never }, declared)).toBeNull();
  });
});

describe('declaredPermissionNames', () => {
  const engineWith = (definitions: unknown) => ({
    getManager: (name: string) => (name === 'ConfigurationManager' ? { getProperty: () => definitions } : undefined)
  });

  test('the names the site declares', () => {
    expect([...(declaredPermissionNames(engineWith(DECLARED)) ?? [])].sort()).toEqual(['association-event-post', 'association-notice-post', 'form-submit']);
  });

  test.each([[null], [undefined], [[]], ['x']])('definitions %j cannot be read: null', (definitions) => {
    expect(declaredPermissionNames(engineWith(definitions))).toBeNull();
  });

  test('no ConfigurationManager: null', () => {
    expect(declaredPermissionNames({ getManager: () => undefined })).toBeNull();
  });

  test('a manager that throws: null, never a throw', () => {
    const engine = { getManager: () => { throw new Error('no'); } };
    expect(declaredPermissionNames(engine)).toBeNull();
  });
});

describe('POST /api/forms/submit/:formId — a form with submitPermission', () => {
  let saved: unknown[];
  let handled: unknown[];
  let bodyReads: number;

  function app(opts: { definitions?: unknown; forms?: Record<string, object> } = {}) {
    saved = [];
    handled = [];
    bodyReads = 0;
    const forms: Record<string, object> = opts.forms ?? { [gatedForm.id]: gatedForm, [openForm.id]: openForm };
    const managers: Record<string, unknown> = {
      PluginManager: TEST_PLUGIN_MANAGER,
      FormsDataManager: {
        getDefinition: (id: string) => forms[id],
        saveSubmission: async (s: object) => { saved.push(s); return s; }
      },
      ConfigurationManager: { getProperty: (key: string, fallback: unknown) => (key === 'ngdpbase.permissions.definitions' ? ('definitions' in opts ? opts.definitions : DECLARED) : fallback) }
    };
    const engine = { getManager: (name: string) => managers[name], createRouter: () => express.Router() };
    const addon = { callHandler: async (id: string, s: unknown) => { handled.push([id, s]); return { ok: true }; } };
    const a = express();
    // Counts reads of the body: a refused caller's body is never looked at.
    a.use((req, _res, next) => {
      let parsed: unknown;
      Object.defineProperty(req, 'body', { get() { bodyReads += 1; return parsed; }, set(v) { parsed = v; }, configurable: true });
      next();
    });
    a.use(express.json());
    a.use((_req, _res, next) => { bodyReads = 0; next(); });
    a.use('/api/forms', apiRoutes(engine as never, addon as never, host()));
    return a;
  }

  test('a signed-in person without the permission gets 403, and nothing is stored or handled', async () => {
    caller.held = new Set(['form-submit']);
    const res = await request(app()).post('/api/forms/submit/post-notice').send({ text: 'Pool closed' });
    expect(res.status).toBe(403);
    expect(caller.asked).toEqual(['association-notice-post']);
    expect(saved).toEqual([]);
    expect(handled).toEqual([]);
  });

  test('a signed-out caller is refused with 401, and the body is not read', async () => {
    caller.signedIn = false;
    caller.held = new Set(['form-submit']);
    const res = await request(app()).post('/api/forms/submit/post-notice').send({ text: 'Pool closed' });
    expect(res.status).toBe(401);
    expect(saved).toEqual([]);
    expect(handled).toEqual([]);
    expect(bodyReads).toBe(0);
  });

  test('a person who holds the permission may submit', async () => {
    caller.held = new Set(['association-notice-post']);
    const res = await request(app()).post('/api/forms/submit/post-notice').send({ text: 'Pool closed' });
    expect(res.status).toBe(201);
    expect(caller.asked).toEqual(['association-notice-post']);
    expect(saved).toHaveLength(1);
    expect(handled).toHaveLength(1);
  });

  test('holding form-submit alone is not enough, and the named permission alone is', async () => {
    caller.held = new Set(['form-submit']);
    expect((await request(app()).post('/api/forms/submit/post-notice').send({ text: 'x' })).status).toBe(403);
    caller.held = new Set(['association-notice-post']);
    expect((await request(app()).post('/api/forms/submit/post-notice').send({ text: 'x' })).status).toBe(201);
  });

  test('a form with no submitPermission is unchanged: it asks form-submit', async () => {
    caller.held = new Set(['form-submit']);
    const res = await request(app()).post('/api/forms/submit/open-form').send({ text: 'hi' });
    expect(res.status).toBe(201);
    expect(caller.asked).toEqual(['form-submit']);
  });

  test('a form with no submitPermission is unchanged when the catalogue cannot be read', async () => {
    caller.held = new Set(['form-submit']);
    const res = await request(app({ definitions: null })).post('/api/forms/submit/open-form').send({ text: 'hi' });
    expect(res.status).toBe(201);
  });

  test('a name the site has not declared fails closed, even for someone holding form-submit', async () => {
    const forms = { 'post-notice': { ...gatedForm, submitPermission: 'never-declared' } };
    caller.held = new Set(['form-submit', 'never-declared']);
    const res = await request(app({ forms })).post('/api/forms/submit/post-notice').send({ text: 'x' });
    expect(res.status).toBe(403);
    expect(caller.asked).not.toContain('form-submit');
    expect(saved).toEqual([]);
    expect(handled).toEqual([]);
  });

  test('an undeclared name refuses a signed-out caller with 401', async () => {
    caller.signedIn = false;
    const forms = { 'post-notice': { ...gatedForm, submitPermission: 'never-declared' } };
    const res = await request(app({ forms })).post('/api/forms/submit/post-notice').send({ text: 'x' });
    expect(res.status).toBe(401);
    expect(bodyReads).toBe(0);
  });

  test('a site whose permissions cannot be read fails closed', async () => {
    caller.held = new Set(['form-submit', 'association-notice-post']);
    const res = await request(app({ definitions: undefined })).post('/api/forms/submit/post-notice').send({ text: 'x' });
    expect(res.status).toBe(403);
    expect(saved).toEqual([]);
  });

  test('the caller cannot name another form or its permission to dodge the check', async () => {
    caller.held = new Set(['form-submit']);
    const res = await request(app()).post('/api/forms/submit/post-notice').send({
      text: 'x', formId: 'open-form', id: 'open-form', submitPermission: 'form-submit', definition: openForm
    });
    expect(res.status).toBe(403);
    expect(caller.asked).toEqual(['association-notice-post']);
    expect(saved).toEqual([]);
    expect(handled).toEqual([]);
  });

  test('the form id in the path is looked up exactly: a different spelling is not another form', async () => {
    caller.held = new Set(['form-submit']);
    const res = await request(app()).post('/api/forms/submit/POST-NOTICE').send({ text: 'x' });
    expect(res.status).toBe(404);
    expect(saved).toEqual([]);
  });
});

describe('GET /api/forms/schema/:formId — a form with submitPermission', () => {
  function app(opts: { definitions?: unknown; forms?: Record<string, object> } = {}) {
    const forms: Record<string, object> = opts.forms ?? { [gatedForm.id]: gatedForm, [openForm.id]: openForm };
    const managers: Record<string, unknown> = {
      FormsDataManager: { getDefinition: (id: string) => forms[id] },
      ConfigurationManager: { getProperty: (key: string, fallback: unknown) => (key === 'ngdpbase.permissions.definitions' ? ('definitions' in opts ? opts.definitions : DECLARED) : fallback) }
    };
    const engine = { getManager: (name: string) => managers[name], createRouter: () => express.Router() };
    const a = express();
    a.use('/api/forms', apiRoutes(engine as never, { callHandler: async () => ({ ok: true }) }, host()));
    return a;
  }

  test('a signed-out caller gets the same 404 as for a form that does not exist', async () => {
    caller.signedIn = false;
    const unknown = await request(app()).get('/api/forms/schema/no-such-form');
    const res = await request(app()).get('/api/forms/schema/post-notice');
    expect(res.status).toBe(404);
    expect(res.status).toBe(unknown.status);
    expect(res.body).toEqual(unknown.body);
    expect(JSON.stringify(res.body)).not.toContain('association-notice-post');
  });

  test('a signed-in person without the permission gets the same 404 as for a form that does not exist', async () => {
    caller.held = new Set(['form-submit']);
    const unknown = await request(app()).get('/api/forms/schema/no-such-form');
    const res = await request(app()).get('/api/forms/schema/post-notice');
    expect(res.status).toBe(404);
    expect(res.status).toBe(unknown.status);
    expect(res.body).toEqual(unknown.body);
    expect(caller.asked).toContain('association-notice-post');
    expect(caller.asked).not.toContain('form-submit');
  });

  test('a person who holds the permission gets the definition', async () => {
    caller.held = new Set(['association-notice-post']);
    const res = await request(app()).get('/api/forms/schema/post-notice');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(gatedForm);
  });

  test('a form with no submitPermission is unchanged: open, and nothing is asked', async () => {
    caller.signedIn = false;
    const res = await request(app()).get('/api/forms/schema/open-form');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(openForm);
    expect(caller.asked).toEqual([]);
  });

  test('a name the site has not declared is a 404, even for someone holding it', async () => {
    const forms = { 'post-notice': { ...gatedForm, submitPermission: 'never-declared' } };
    caller.held = new Set(['form-submit', 'never-declared']);
    const res = await request(app({ forms })).get('/api/forms/schema/post-notice');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Form not found' });
  });

  test('a site whose permissions cannot be read is a 404 for a gated form, and open forms still answer', async () => {
    caller.held = new Set(['form-submit', 'association-notice-post']);
    expect((await request(app({ definitions: undefined })).get('/api/forms/schema/post-notice')).status).toBe(404);
    expect((await request(app({ definitions: undefined })).get('/api/forms/schema/open-form')).status).toBe(200);
  });
});

describe('Form plugin — a form with submitPermission', () => {
  type PluginType = { name: string; execute: (ctx: unknown, params: unknown) => Promise<string> };
  let FormsPlugin: PluginType;
  beforeAll(async () => {
    const mod = await import('../plugins/FormsPlugin');
    FormsPlugin = asExecuted(((mod as unknown as { default: PluginType }).default ?? mod) as PluginType);
  });

  const held: { names: Set<string>; asked: Array<[unknown, string]> } = { names: new Set(), asked: [] };
  beforeEach(() => { held.names = new Set(); held.asked = []; });

  function context(opts: { form?: object; userContext?: unknown; definitions?: unknown; pdp?: boolean } = {}) {
    const managers: Record<string, unknown> = {
      FormsDataManager: { getDefinition: () => opts.form ?? gatedForm },
      ConfigurationManager: {
        resolveDataPath: () => '/data/fairways',
        getProperty: (key: string, fallback: unknown) => (key === 'ngdpbase.permissions.definitions' ? ('definitions' in opts ? opts.definitions : DECLARED) : fallback)
      },
      ...(opts.pdp === false ? {} : {
        PolicyDecisionPoint: {
          holds: async (subject: unknown, action: string) => { held.asked.push([subject, action]); return held.names.has(action); },
          permits: async (subject: unknown, action: string) => { held.asked.push([subject, action]); return held.names.has(action); }
        }
      })
    };
    return {
      engine: { getManager: (name: string) => managers[name] },
      userContext: 'userContext' in opts ? opts.userContext : { username: 'jim', roles: ['reader'], isAuthenticated: true },
      pageName: 'Home',
      markVolatile: vi.fn()
    };
  }

  test('draws nothing for a person without the permission', async () => {
    held.names = new Set(['form-submit']);
    const html = await FormsPlugin.execute(context(), { id: 'post-notice' });
    expect(html).toBe('');
    expect(held.asked.map(([, action]) => action)).toEqual(['association-notice-post']);
  });

  test('draws the form for a person who holds it', async () => {
    held.names = new Set(['association-notice-post']);
    const html = await FormsPlugin.execute(context(), { id: 'post-notice' });
    expect(html).toContain('data-ngdp-form="post-notice"');
    expect(html).toContain('name="text"');
  });

  test('asks with the viewer\'s own context', async () => {
    const userContext = { username: 'jim', roles: ['reader'], isAuthenticated: true };
    await FormsPlugin.execute(context({ userContext }), { id: 'post-notice' });
    expect(held.asked[0]?.[0]).toBe(userContext);
  });

  test('draws nothing when there is no viewer to ask about', async () => {
    held.names = new Set(['association-notice-post']);
    expect(await FormsPlugin.execute(context({ userContext: null }), { id: 'post-notice' })).toBe('');
  });

  test('draws nothing when there is no decision point to ask', async () => {
    expect(await FormsPlugin.execute(context({ pdp: false }), { id: 'post-notice' })).toBe('');
  });

  test('draws nothing for a name the site has not declared, even for someone holding it', async () => {
    held.names = new Set(['never-declared', 'form-submit']);
    const html = await FormsPlugin.execute(context({ form: { ...gatedForm, submitPermission: 'never-declared' } }), { id: 'post-notice' });
    expect(html).toBe('');
    expect(held.asked.map(([, action]) => action)).not.toContain('form-submit');
  });

  test('draws nothing when the site\'s permissions cannot be read', async () => {
    held.names = new Set(['association-notice-post']);
    expect(await FormsPlugin.execute(context({ definitions: null }), { id: 'post-notice' })).toBe('');
  });

  test('is not cached for another viewer', async () => {
    held.names = new Set(['association-notice-post']);
    const ctx = context();
    await FormsPlugin.execute(ctx, { id: 'post-notice' });
    expect(ctx.markVolatile).toHaveBeenCalled();
  });

  test('a form with no submitPermission is drawn for everyone and asks nothing', async () => {
    const ctx = context({ form: openForm, userContext: null, pdp: false });
    const html = await FormsPlugin.execute(ctx, { id: 'open-form' });
    expect(html).toContain('data-ngdp-form="open-form"');
    expect(held.asked).toEqual([]);
    expect(ctx.markVolatile).not.toHaveBeenCalled();
  });
});
