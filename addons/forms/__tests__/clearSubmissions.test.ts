/**
 * #1973 — clearing a form's submissions so it can be deleted.
 *
 * FormsDataManager.clearSubmissions records `submission-clear` (who, which
 * form, how many) first, then removes the files it counted. The admin route
 * asks admin-system and the typed form id; the CSV export is the copy offered
 * before clearing. Site forms, forms an add-on still provides and forms it no
 * longer provides are all covered.
 *
 * Sabotage checked: skipping the recordAuditEvent call turned "records who,
 * which form and how many", "a record that cannot be written leaves every
 * submission" and the site-form route test red.
 */

import express from 'express';
import request from 'supertest';
import os from 'os';
import path from 'path';
import { promises as fsp, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { JSDOM } from 'jsdom';
import adminRoutes from '../routes/admin';
import builderRoutes from '../routes/builder';
import FormsDataManager from '../managers/FormsDataManager';
import ExportManager from '../../../dist/src/managers/ExportManager.js';
import { addonDeclaredAuditEvents, buildAddonHost } from '../../../dist/src/utils/addonHost.js';
import type { AddonHost } from '../../../dist/src/utils/addonHost.js';

const permission = { allowed: true };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOT = { username: 'system', origin: 'boot' as const, requestedAt: new Date().toISOString(), reason: 'test' };
const fields = [{ name: 'note', type: 'textarea' as const, label: 'Note', required: false }];

type Recorded = { eventType: string; user: string; resource?: string; metadata: Record<string, unknown> };

let dir: string;
const state = { done: true, phrLoaded: true };
let recorded: Recorded[];
let recordFails: boolean;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-1973-clear-'));
  permission.allowed = true;
  state.done = true;
  state.phrLoaded = true;
  recorded = [];
  recordFails = false;
});
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

const coreHost = buildAddonHost('forms', {});
/**
 * The host core hands the forms add-on (#1813), with a stand-in ApiContext (an
 * admin who holds admin-system unless `permission.allowed` is false) and an
 * audit sink that keeps what it is given.
 */
const host = {
  ...coreHost,
  ApiContext: {
    from: () => ({
      getActor: () => ({ username: 'admin', roles: ['admin'], isAuthenticated: true }),
      requireAuthenticated: () => undefined,
      requirePermission: async (p: string) => {
        if (!permission.allowed) throw new coreHost.ApiError(403, `needs ${p}`);
      }
    })
  },
  addonAuditEventName: ((name: string) => name) as never,
  recordAuditEvent: (async (_sink: unknown, event: Recorded) => {
    if (recordFails) throw new Error('audit device full');
    recorded.push(event);
    return 'recorded';
  }) as never
} as unknown as AddonHost;

async function setUp() {
  const addons = {
    getAddonVersion: (slug: string) => (slug === 'phr' ? '1.2.0' : undefined),
    addonsLoaded: () => state.done,
    isLoaded: (slug: string) => slug === 'phr' && state.phrLoaded
  };
  const exporter = new ExportManager({} as never);
  const engine = {
    getManager: (name: string) => (name === 'AddonsManager' ? addons : name === 'ExportManager' ? exporter : name === 'FormsDataManager' ? m : undefined),
    createRouter: () => express.Router()
  };
  const m = new FormsDataManager(engine, dir, host);
  await m.initialize();
  await m.saveDefinition({ id: 'ours', title: 'Ours', proxySubmission: false, notifyRole: 'admin', store: true, notify: true, fields }, BOOT);
  await m.registerShippedForm('phr', { id: 'phr-note', title: 'Health note', fields }, BOOT);
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((_req, res, next) => {
    res.render = ((view: string, locals?: object) => { res.json({ view, ...locals }); });
    next();
  });
  app.use('/addons/forms/builder', builderRoutes(engine as never, host));
  app.use('/addons/forms', adminRoutes(engine as never, null, host));
  return { m, app };
}

async function submit(m: FormsDataManager, formId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await m.saveSubmission({ formId, submittedAt: new Date(Date.UTC(2026, 9, 22, 10, i)).toISOString(), submittedBy: `u${i}`, data: { note: `note ${i}` }, status: 'pending' });
  }
}

describe('FormsDataManager.clearSubmissions (#1973)', () => {
  test('removes every stored submission of the form, and only that form, and returns how many', async () => {
    const { m } = await setUp();
    await submit(m, 'ours', 3);
    await submit(m, 'phr-note', 1);
    expect(await m.clearSubmissions('ours', BOOT)).toBe(3);
    expect(await m.getSubmissionCount('ours')).toBe(0);
    expect(await m.getSubmissionCount('phr-note')).toBe(1);
    expect(m.getDefinition('ours')).toBeDefined();
  });

  test('records who, which form and how many', async () => {
    const { m } = await setUp();
    await submit(m, 'phr-note', 2);
    await m.clearSubmissions('phr-note', BOOT);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      eventType: 'submission-clear',
      user: 'system',
      resource: 'phr-note',
      metadata: { formId: 'phr-note', count: 2, providedBy: { addon: 'phr', version: '1.2.0' } }
    });
  });

  test('a record that cannot be written leaves every submission', async () => {
    const { m } = await setUp();
    await submit(m, 'ours', 2);
    recordFails = true;
    await expect(m.clearSubmissions('ours', BOOT)).rejects.toThrow('audit device full');
    expect(await m.getSubmissionCount('ours')).toBe(2);
  });

  test('a form with no submissions clears nothing and records nothing', async () => {
    const { m } = await setUp();
    expect(await m.clearSubmissions('ours', BOOT)).toBe(0);
    expect(recorded).toHaveLength(0);
  });

  test('a form id that is not one is refused before any file is touched', async () => {
    const { m } = await setUp();
    await expect(m.clearSubmissions('../definitions', BOOT)).rejects.toThrow(/not a form id/);
    expect(m.getDefinition('ours')).toBeDefined();
  });
});

describe('the clear and export routes (#1973)', () => {
  test('a site form: delete is refused while it has submissions; clear, then delete works', async () => {
    const { m, app } = await setUp();
    await submit(m, 'ours', 2);
    expect((await request(app).post('/addons/forms/builder/ours/delete').type('form').send({})).status).toBe(409);

    const clear = await request(app).post('/addons/forms/ours/submissions/clear').type('form').send({ confirm: 'ours' });
    expect(clear.status).toBe(302);
    expect(clear.headers['location']).toBe('/addons/forms?flash=cleared&form=ours&count=2');
    expect(await m.getSubmissionCount('ours')).toBe(0);
    expect(recorded.map(r => [r.eventType, r.user, r.metadata['count']])).toEqual([['submission-clear', 'admin', 2]]);

    expect((await request(app).post('/addons/forms/builder/ours/delete').type('form').send({})).status).toBe(302);
    expect(m.getDefinition('ours')).toBeUndefined();
  });

  test('a form its add-on no longer provides: clear, then delete works', async () => {
    const { m, app } = await setUp();
    state.phrLoaded = false;
    await submit(m, 'phr-note', 1);
    expect((await request(app).post('/addons/forms/builder/phr-note/delete').type('form').send({})).status).toBe(409);
    expect((await request(app).post('/addons/forms/phr-note/submissions/clear').type('form').send({ confirm: 'phr-note' })).status).toBe(302);
    expect(await m.getSubmissionCount('phr-note')).toBe(0);
    expect((await request(app).post('/addons/forms/builder/phr-note/delete').type('form').send({})).status).toBe(302);
    expect(m.getDefinition('phr-note')).toBeUndefined();
  });

  test('a form an add-on still provides can be cleared; it still cannot be deleted', async () => {
    const { m, app } = await setUp();
    await submit(m, 'phr-note', 2);
    expect((await request(app).post('/addons/forms/phr-note/submissions/clear').type('form').send({ confirm: 'phr-note' })).status).toBe(302);
    expect(await m.getSubmissionCount('phr-note')).toBe(0);
    expect(m.getDefinition('phr-note')?.providedBy).toEqual({ addon: 'phr', version: '1.2.0' });
    expect((await request(app).post('/addons/forms/builder/phr-note/delete').type('form').send({})).status).toBe(403);
  });

  test('without admin-system, clearing and exporting are refused and nothing changes', async () => {
    const { m, app } = await setUp();
    await submit(m, 'ours', 2);
    permission.allowed = false;
    expect((await request(app).post('/addons/forms/ours/submissions/clear').type('form').send({ confirm: 'ours' })).status).toBe(403);
    expect((await request(app).get('/addons/forms/ours/export.csv')).status).toBe(403);
    expect(await m.getSubmissionCount('ours')).toBe(2);
    expect(recorded).toHaveLength(0);
  });

  test('a confirmation that is not the form id clears nothing', async () => {
    const { m, app } = await setUp();
    await submit(m, 'ours', 2);
    for (const confirm of ['', 'Ours', 'phr-note']) {
      const res = await request(app).post('/addons/forms/ours/submissions/clear').type('form').send({ confirm });
      expect(res.headers['location']).toBe('/addons/forms?flash=not-cleared&form=ours');
    }
    expect(await m.getSubmissionCount('ours')).toBe(2);
    expect(recorded).toHaveLength(0);
  });

  test('an unknown form is 404', async () => {
    const { app } = await setUp();
    expect((await request(app).post('/addons/forms/nope/submissions/clear').type('form').send({ confirm: 'nope' })).status).toBe(404);
    expect((await request(app).get('/addons/forms/nope/export.csv')).status).toBe(404);
  });

  test('the CSV export holds every submission, oldest first, one column per field', async () => {
    const { m, app } = await setUp();
    await submit(m, 'ours', 2);
    const res = await request(app).get('/addons/forms/ours/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="ours-submissions.csv"');
    const lines = res.text.trimEnd().split('\r\n');
    expect(lines[0]).toBe('id,submittedAt,submittedBy,status,formVersion,onBehalfOf.name,onBehalfOf.email,onBehalfOf.phone,onBehalfOf.address,notes,note');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(',u0,pending,');
    expect(lines[1].endsWith(',note 0')).toBe(true);
    expect(lines[2]).toContain(',u1,pending,');
  });
});

describe('the forms add-on declares submission-clear (#1973)', () => {
  test('in its own default config, not grantable, refusing on failure', () => {
    const defaults = JSON.parse(readFileSync(path.join(__dirname, '../config/default-config.json'), 'utf8')) as Record<string, unknown>;
    expect(addonDeclaredAuditEvents(defaults).has('submission-clear')).toBe(true);
    const entry = (defaults['ngdpbase.permissions.definitions'] as Record<string, { grantable?: boolean; audit?: Record<string, unknown> }>)['submission-clear'];
    expect(entry.grantable).toBe(false);
    expect(entry.audit?.['on-failure']).toBe('refuse');
  });
});

describe('the forms admin offers Clear submissions (#1973)', () => {
  const VIEW = path.join(__dirname, '../views/forms-admin.ejs');
  const includer = (original: string): { template: string } | undefined =>
    original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;

  test('on a card with submissions: the count, the CSV link and the typed form id; none without submissions', async () => {
    const html = await ejs.renderFile(VIEW, {
      currentUser: null, query: {}, csrfToken: 'tok', locals: {},
      forms: [
        { id: 'ours', title: 'Ours', fields, submissionCount: 3 },
        { id: 'phr-note', title: 'Health note', fields, submissionCount: 1, providedBy: { addon: 'phr', version: '1.2.0' } },
        { id: 'empty', title: 'Empty', fields, submissionCount: 0 }
      ]
    }, { views: [path.join(__dirname, '../../../views')], includer });
    const doc = new JSDOM(html).window.document;
    const card = (id: string) => [...doc.querySelectorAll('.card')].find(c => c.querySelector('code')?.textContent === id)!;

    const ours = card('ours').querySelector('[data-testid="clear-submissions"]')!;
    expect(ours.querySelector('form')?.getAttribute('action')).toBe('/addons/forms/ours/submissions/clear');
    expect(ours.querySelector('input[name="_csrf"]')?.getAttribute('value')).toBe('tok');
    expect(ours.textContent?.replace(/\s+/g, ' ')).toContain('Removes all 3 stored submissions of Ours.');
    expect(ours.querySelector('[data-testid="export-csv"]')?.getAttribute('href')).toBe('/addons/forms/ours/export.csv');
    expect(ours.querySelector('input[name="confirm"]')?.getAttribute('data-expected')).toBe('ours');
    expect(ours.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);

    expect(card('phr-note').querySelector('[data-testid="clear-submissions"]')).not.toBeNull();
    expect(card('empty').querySelector('[data-testid="clear-submissions"]')).toBeNull();
  });

  test('after a clear, says how many of which form', async () => {
    const html = await ejs.renderFile(VIEW, {
      currentUser: null, query: { flash: 'cleared', form: 'ours', count: '3' }, csrfToken: 'tok', locals: {}, forms: []
    }, { views: [path.join(__dirname, '../../../views')], includer });
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelector('[data-testid="flash-cleared"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Cleared 3 submissions of ours.');
  });
});
