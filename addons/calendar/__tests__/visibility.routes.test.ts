/**
 * #2391 slice 1: the calendar API and the .ics feed honour each calendar's
 * `visibility` setting.
 *
 * Route-level: the four read routes are mounted with a real CalendarDataManager
 * over a temporary directory, and the request's permission answers come from
 * the `who` table below, standing in for policy.
 *
 *   public         anyone
 *   authenticated  holders of calendar-read (every signed-in account by default)
 *   private        holders of calendar-manage
 *   no setting     public, as before (a calendar named in the config)
 *   not configured public no more: read as private
 *   enabled: false  nobody, as docs/configuration.md says
 *
 * The setting is read from the add-on's current configuration on each request,
 * so a changed setting applies without a restart.
 *
 * A request that may not see a calendar gets none of its events from the list
 * and search, and a not-found from the single-event and .ics routes.
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import express from 'express';
import request from 'supertest';
import apiRoutes from '../routes/api';
import CalendarDataManager from '../managers/CalendarDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

const host = () => buildAddonHost('calendar', {});

// The request's answers, set per test. vi.hoisted: the mock factory reads it.
const who = vi.hoisted(() => ({ signedIn: false, permissions: new Set<string>() }));
vi.mock('../../../dist/src/context/ApiContext', async () => {
  const real = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
  return {
    ...real,
    ApiContext: {
      from: () => ({
        username: who.signedIn ? 'ann' : null,
        isAuthenticated: who.signedIn,
        hasPermission: async (p: string) => who.permissions.has(p),
        requirePermission: async (p: string) => {
          if (!who.permissions.has(p)) throw new real.ApiError(who.signedIn ? 403 : 401, 'Forbidden');
        }
      })
    }
  };
});

const CONFIG = {
  calendars: {
    open:    { workflow: 'managed', visibility: 'public',        enabled: true },
    members: { workflow: 'managed', visibility: 'authenticated', enabled: true },
    staff:   { workflow: 'managed', visibility: 'private',       enabled: true },
    typo:    { workflow: 'managed', visibility: 'privte',        enabled: true },
    plain:   { workflow: 'managed',                               enabled: true },
    off:     { workflow: 'managed', visibility: 'public',        enabled: false },
    weird:   'public'
  }
};

const ev = (id: string, calendarId: string, extra: Record<string, unknown> = {}) => ({
  id, calendarId, title: `Title ${id}`, start: '2026-12-01T10:00:00', end: '2026-12-01T11:00:00',
  created: '2026-11-01T00:00:00.000Z', updated: '2026-11-01T00:00:00.000Z', ...extra
});

const EVENTS = [
  ev('e-pub', 'open', { _private: { requester: 'someone' } }),
  ev('e-mem', 'members'),
  ev('e-staff', 'staff'),
  ev('e-typo', 'typo'),
  ev('e-plain', 'plain'),
  ev('e-unlisted', 'not-in-config'),
  ev('e-off', 'off'),
  ev('e-weird', 'weird')
];

let dir: string;
let app: express.Application;
// What the add-on's configuration holds now; a test may change it between requests.
let live: Record<string, unknown>;

beforeEach(async () => {
  live = CONFIG;
  who.signedIn = false;
  who.permissions = new Set();
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cal-visibility-'));
  const byCalendar = new Map<string, unknown[]>();
  for (const e of EVENTS) byCalendar.set(e.calendarId, [...(byCalendar.get(e.calendarId) ?? []), e]);
  for (const [id, list] of byCalendar) await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(list));
  const manager = new CalendarDataManager(dir);
  await manager.load();
  const engine = {
    getManager: (name: string) => (name === 'CalendarDataManager' ? manager
      : name === 'AddonsManager' ? { getAddonConfig: () => live } : undefined),
    createRouter: () => express.Router()
  };
  app = express();
  app.use(express.json());
  app.use('/api/calendar', apiRoutes(engine as never, CONFIG, host()));
});

afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

const ids = (body: Array<{ id: string }>) => body.map(e => e.id).sort();
const signedOut = () => { who.signedIn = false; };
const member = () => { who.signedIn = true; who.permissions = new Set(['calendar-read']); };
const manager = () => { who.signedIn = true; who.permissions = new Set(['calendar-read', 'calendar-manage']); };
const noPermissions = () => { who.signedIn = true; who.permissions = new Set(); };

describe('GET /api/calendar/events', () => {
  test('signed out: only public calendars and calendars with no setting', async () => {
    signedOut();
    const res = await request(app).get('/api/calendar/events');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['e-pub', 'e-plain'].sort());
  });

  test('signed out, asking for a non-public calendar by name: nothing', async () => {
    signedOut();
    for (const calendarId of ['members', 'staff']) {
      const res = await request(app).get('/api/calendar/events').query({ calendarId });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    }
  });

  test('signed in without the permission: no members-only and no private events', async () => {
    noPermissions();
    const res = await request(app).get('/api/calendar/events');
    expect(ids(res.body)).toEqual(['e-pub', 'e-plain'].sort());
  });

  test('signed in with calendar-read: also the members-only calendar, not the private one', async () => {
    member();
    const res = await request(app).get('/api/calendar/events');
    expect(ids(res.body)).toEqual(['e-mem', 'e-pub', 'e-plain'].sort());
  });

  test('a holder of calendar-manage sees the private calendar too', async () => {
    manager();
    const res = await request(app).get('/api/calendar/events');
    expect(ids(res.body)).toContain('e-staff');
    expect(ids(res.body)).toContain('e-mem');
  });

  test('a calendar missing from the configuration, or whose entry is not an object, is read as private', async () => {
    signedOut();
    expect(ids((await request(app).get('/api/calendar/events')).body)).not.toContain('e-unlisted');
    expect(ids((await request(app).get('/api/calendar/events')).body)).not.toContain('e-weird');
    member();
    expect(ids((await request(app).get('/api/calendar/events')).body)).not.toContain('e-unlisted');
    expect(ids((await request(app).get('/api/calendar/events')).body)).not.toContain('e-weird');
    manager();
    expect(ids((await request(app).get('/api/calendar/events')).body)).toEqual(expect.arrayContaining(['e-unlisted', 'e-weird']));
  });

  test('a calendar set to enabled: false is left out for everyone, a manager included', async () => {
    for (const who of [signedOut, member, manager]) {
      who();
      expect(ids((await request(app).get('/api/calendar/events')).body)).not.toContain('e-off');
      expect(ids((await request(app).get('/api/calendar/events').query({ calendarId: 'off' })).body)).toEqual([]);
    }
  });

  test('a changed setting applies on the next request, with no restart', async () => {
    signedOut();
    expect(ids((await request(app).get('/api/calendar/events')).body)).toContain('e-pub');
    live = { calendars: { ...CONFIG.calendars, open: { workflow: 'managed', visibility: 'private', enabled: true } } };
    expect(ids((await request(app).get('/api/calendar/events')).body)).not.toContain('e-pub');
    expect((await request(app).get('/api/calendar/events/e-pub')).status).toBe(404);
    expect((await request(app).get('/api/calendar/open/feed.ics')).status).toBe(404);
    live = CONFIG;
    expect(ids((await request(app).get('/api/calendar/events')).body)).toContain('e-pub');
  });

  test('a setting that is not public, authenticated or private is read as private', async () => {
    member();
    expect(ids((await request(app).get('/api/calendar/events')).body)).not.toContain('e-typo');
    manager();
    expect(ids((await request(app).get('/api/calendar/events')).body)).toContain('e-typo');
  });

  test('a public calendar is still shown with its private block stripped', async () => {
    signedOut();
    const res = await request(app).get('/api/calendar/events').query({ calendarId: 'open' });
    expect(ids(res.body)).toEqual(['e-pub']);
    expect(res.body[0].extendedProps).not.toHaveProperty('_private');
  });
});

describe('GET /api/calendar/events/search', () => {
  test('signed out: results only from calendars the viewer may see', async () => {
    signedOut();
    const res = await request(app).get('/api/calendar/events/search').query({ q: 'Title' });
    expect(res.status).toBe(200);
    expect(ids(res.body.results)).toEqual(['e-pub', 'e-plain'].sort());
  });

  test('signed in without the permission: no members-only or private results', async () => {
    noPermissions();
    const res = await request(app).get('/api/calendar/events/search').query({ q: 'Title' });
    expect(ids(res.body.results)).toEqual(['e-pub', 'e-plain'].sort());
  });

  test('a disabled calendar gives no results, a manager included', async () => {
    manager();
    const res = await request(app).get('/api/calendar/events/search').query({ q: 'Title' });
    expect(ids(res.body.results)).not.toContain('e-off');
  });

  test('an empty query lists no more than the list route does', async () => {
    signedOut();
    const res = await request(app).get('/api/calendar/events/search');
    expect(ids(res.body.results)).not.toContain('e-mem');
    expect(ids(res.body.results)).not.toContain('e-staff');
  });

  test('signed in with calendar-read: members-only results appear, private ones do not', async () => {
    member();
    const res = await request(app).get('/api/calendar/events/search').query({ q: 'Title' });
    expect(ids(res.body.results)).toContain('e-mem');
    expect(ids(res.body.results)).not.toContain('e-staff');
  });
});

describe('GET /api/calendar/events/:id', () => {
  test('a public calendar event is returned to everyone', async () => {
    signedOut();
    const res = await request(app).get('/api/calendar/events/e-pub');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('e-pub');
  });

  test('signed out: a members-only or private event is not found', async () => {
    signedOut();
    expect((await request(app).get('/api/calendar/events/e-mem')).status).toBe(404);
    expect((await request(app).get('/api/calendar/events/e-staff')).status).toBe(404);
  });

  test('signed in without the permission: not found', async () => {
    noPermissions();
    expect((await request(app).get('/api/calendar/events/e-mem')).status).toBe(404);
    expect((await request(app).get('/api/calendar/events/e-staff')).status).toBe(404);
  });

  test('signed in with calendar-read: the members-only event, not the private one', async () => {
    member();
    expect((await request(app).get('/api/calendar/events/e-mem')).status).toBe(200);
    expect((await request(app).get('/api/calendar/events/e-staff')).status).toBe(404);
  });

  test('a holder of calendar-manage gets the private event', async () => {
    manager();
    expect((await request(app).get('/api/calendar/events/e-staff')).status).toBe(200);
  });

  test('an event of a calendar that is not configured is not found unless the viewer holds calendar-manage', async () => {
    signedOut();
    expect((await request(app).get('/api/calendar/events/e-unlisted')).status).toBe(404);
    member();
    expect((await request(app).get('/api/calendar/events/e-unlisted')).status).toBe(404);
    manager();
    expect((await request(app).get('/api/calendar/events/e-unlisted')).status).toBe(200);
  });

  test('an event of a disabled calendar is not found, a manager included', async () => {
    manager();
    expect((await request(app).get('/api/calendar/events/e-off')).status).toBe(404);
  });
});

describe('GET /api/calendar/:calendarId/feed.ics', () => {
  test('a public calendar feed is served to everyone', async () => {
    signedOut();
    const res = await request(app).get('/api/calendar/open/feed.ics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.text).toContain('e-pub');
  });

  test('a calendar with no setting keeps its feed', async () => {
    signedOut();
    const res = await request(app).get('/api/calendar/plain/feed.ics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('e-plain');
  });

  test('signed out: the feed of a members-only or private calendar is not found', async () => {
    signedOut();
    for (const calendarId of ['members', 'staff']) {
      const res = await request(app).get(`/api/calendar/${calendarId}/feed.ics`);
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('BEGIN:VEVENT');
    }
  });

  test('signed in without the permission: not found', async () => {
    noPermissions();
    expect((await request(app).get('/api/calendar/members/feed.ics')).status).toBe(404);
    expect((await request(app).get('/api/calendar/staff/feed.ics')).status).toBe(404);
  });

  test('signed in with calendar-read: the members-only feed, not the private one', async () => {
    member();
    const res = await request(app).get('/api/calendar/members/feed.ics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('e-mem');
    expect((await request(app).get('/api/calendar/staff/feed.ics')).status).toBe(404);
  });

  test('a calendar that is not configured answers exactly as one hidden from the viewer does', async () => {
    signedOut();
    const unknown = await request(app).get('/api/calendar/nowhere/feed.ics');
    const hidden = await request(app).get('/api/calendar/staff/feed.ics');
    expect(unknown.status).toBe(404);
    expect(hidden.status).toBe(404);
    expect(unknown.body).toEqual(hidden.body);
    expect(unknown.headers['content-type']).toBe(hidden.headers['content-type']);
    member();
    expect((await request(app).get('/api/calendar/nowhere/feed.ics')).status).toBe(404);
  });

  test('the feed of a disabled calendar is not found, a manager included', async () => {
    manager();
    expect((await request(app).get('/api/calendar/off/feed.ics')).status).toBe(404);
  });

  test('a holder of calendar-manage gets the private feed', async () => {
    manager();
    const res = await request(app).get('/api/calendar/staff/feed.ics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('e-staff');
  });
});

describe('caching', () => {
  test('the list, search, single-event and feed answers are marked private', async () => {
    signedOut();
    const answers = [
      await request(app).get('/api/calendar/events'),
      await request(app).get('/api/calendar/events/search').query({ q: 'Title' }),
      await request(app).get('/api/calendar/events/e-pub'),
      await request(app).get('/api/calendar/open/feed.ics')
    ];
    for (const res of answers) {
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toMatch(/\bprivate\b/);
    }
  });

  test('a not-found answer is marked private too', async () => {
    signedOut();
    expect((await request(app).get('/api/calendar/events/e-staff')).headers['cache-control']).toMatch(/\bprivate\b/);
    expect((await request(app).get('/api/calendar/staff/feed.ics')).headers['cache-control']).toMatch(/\bprivate\b/);
  });
});

describe('a calendar named __proto__', () => {
  test('is treated like one the configuration does not name', async () => {
    signedOut();
    expect((await request(app).get('/api/calendar/__proto__/feed.ics')).status).toBe(404);
    member();
    expect((await request(app).get('/api/calendar/__proto__/feed.ics')).status).toBe(404);
  });
});
