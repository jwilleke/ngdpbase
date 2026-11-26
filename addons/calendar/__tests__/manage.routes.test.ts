/**
 * #2546 (slice 2 of #2391): each calendar names its own manage permission.
 *
 * Route-level: the event routes and the reservation routes are mounted with a
 * real CalendarDataManager over a temporary directory, and the request's
 * permission answers come from the `who` table below, standing in for policy.
 *
 *   association-events  names `association-event-post`
 *   clubhouse           names none: asks `calendar-manage`, as before
 *   ghost-events        names `never-declared`: fails closed for everyone
 *
 * Reservation cancelling and private reservation details stay on
 * `calendar-manage`, whatever a calendar names.
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import express from 'express';
import request from 'supertest';
import apiRoutes from '../routes/api';
import reservationRoutes from '../routes/reservations';
import CalendarDataManager from '../managers/CalendarDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

const host = () => buildAddonHost('calendar', {});

const who = vi.hoisted(() => ({ signedIn: false, permissions: new Set<string>() }));
vi.mock('../../../dist/src/context/ApiContext', async () => {
  const real = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
  return {
    ...real,
    ApiContext: {
      from: () => ({
        username: who.signedIn ? 'ann' : null,
        isAuthenticated: who.signedIn,
        actingUsername: () => 'ann',
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
    clubhouse:           { workflow: 'reservation', visibility: 'authenticated', enabled: true },
    'association-events': { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 'association-event-post' },
    'ghost-events':      { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 'never-declared' },
    'odd-events':        { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 42 },
    plain:               { workflow: 'managed', visibility: 'authenticated', enabled: true }
  }
};

// What the site declares: the add-ons' permissions, `never-declared` among none of them.
const DECLARED = {
  'calendar-manage': {}, 'calendar-read': {}, 'calendar-reserve': {}, 'association-event-post': {}
};

const ev = (id: string, calendarId: string, extra: Record<string, unknown> = {}) => ({
  id, calendarId, title: `Title ${id}`, start: '2026-12-01T10:00:00', end: '2026-12-01T11:00:00',
  created: '2026-11-01T00:00:00.000Z', updated: '2026-11-01T00:00:00.000Z', ...extra
});

const EVENTS = [
  ev('e-assoc', 'association-events'),
  ev('e-club', 'clubhouse', { class: 'CONFIDENTIAL', _private: { requester: 'someone-else', notes: 'SECRET-NOTE' } }),
  ev('e-ghost', 'ghost-events'),
  ev('e-odd', 'odd-events'),
  ev('e-plain', 'plain')
];

let dir: string;
let app: express.Application;
let manager: CalendarDataManager;
let declared: Record<string, unknown> | undefined;

beforeEach(async () => {
  declared = DECLARED;
  who.signedIn = true;
  who.permissions = new Set();
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cal-manage-'));
  const byCalendar = new Map<string, unknown[]>();
  for (const e of EVENTS) byCalendar.set(e.calendarId, [...(byCalendar.get(e.calendarId) ?? []), e]);
  for (const [id, list] of byCalendar) await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(list));
  manager = new CalendarDataManager(dir);
  await manager.load();
  const engine = {
    getManager: (name: string) => (name === 'CalendarDataManager' ? manager
      : name === 'AddonsManager' ? { getAddonConfig: () => CONFIG }
        : name === 'ConfigurationManager' ? { getProperty: (_k: string, d: unknown) => declared ?? d }
          : undefined),
    createRouter: () => express.Router()
  };
  app = express();
  app.use(express.json());
  app.use('/api/calendar', apiRoutes(engine as never, CONFIG, host()));
  app.use('/api/calendar', reservationRoutes(engine as never, CONFIG, host()));
});

afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

// Every account can read (calendar-read) and reserve; the rest is what each test grants.
const holds = (...permissions: string[]) => { who.signedIn = true; who.permissions = new Set(['calendar-read', 'calendar-reserve', ...permissions]); };
const newEvent = (calendarId?: string) => ({ ...(calendarId ? { calendarId } : {}), title: 'New', start: '2026-12-02T10:00:00' });
const stillThere = (id: string) => manager.getById(id) !== undefined;

describe('a holder of only the events permission', () => {
  beforeEach(() => holds('association-event-post'));

  test('adds, edits and deletes on association-events', async () => {
    const created = await request(app).post('/api/calendar/events').send(newEvent('association-events'));
    expect(created.status).toBe(201);
    expect(manager.getById(created.body.id)?.calendarId).toBe('association-events');

    const edited = await request(app).put('/api/calendar/events/e-assoc').send({ title: 'Renamed' });
    expect(edited.status).toBe(200);
    expect(manager.getById('e-assoc')?.title).toBe('Renamed');

    const deleted = await request(app).delete('/api/calendar/events/e-assoc');
    expect(deleted.status).toBe(204);
    expect(stillThere('e-assoc')).toBe(false);
  });

  test('cannot add, edit or delete on the clubhouse calendar', async () => {
    const before = manager.count();
    expect((await request(app).post('/api/calendar/events').send(newEvent('clubhouse'))).status).toBe(403);
    expect((await request(app).put('/api/calendar/events/e-club').send({ title: 'Hijacked' })).status).toBe(403);
    expect((await request(app).delete('/api/calendar/events/e-club')).status).toBe(403);
    expect(manager.count()).toBe(before);
    expect(manager.getById('e-club')?.title).toBe('Title e-club');
  });

  test('cannot add to a calendar that names no permission by leaving the calendar out of the request', async () => {
    const before = manager.count();
    expect((await request(app).post('/api/calendar/events').send(newEvent())).status).toBe(403);
    expect(manager.count()).toBe(before);
  });

  test('cannot see reservation details', async () => {
    const res = await request(app).get('/api/calendar/events?calendarId=clubhouse');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('SECRET-NOTE');
  });

  test('cannot cancel someone else\'s reservation', async () => {
    const res = await request(app).delete('/api/calendar/reservations/e-club');
    expect(res.status).toBe(404);
    expect(stillThere('e-club')).toBe(true);
  });
});

describe('a holder of calendar-manage alone', () => {
  beforeEach(() => holds('calendar-manage'));

  test('cannot touch association-events once it names its own permission', async () => {
    const before = manager.count();
    expect((await request(app).post('/api/calendar/events').send(newEvent('association-events'))).status).toBe(403);
    expect((await request(app).put('/api/calendar/events/e-assoc').send({ title: 'Hijacked' })).status).toBe(403);
    expect((await request(app).delete('/api/calendar/events/e-assoc')).status).toBe(403);
    expect(manager.count()).toBe(before);
    expect(manager.getById('e-assoc')?.title).toBe('Title e-assoc');
  });

  test('still manages the clubhouse calendar and one that names none', async () => {
    expect((await request(app).post('/api/calendar/events').send(newEvent('clubhouse'))).status).toBe(201);
    expect((await request(app).put('/api/calendar/events/e-plain').send({ title: 'Renamed' })).status).toBe(200);
    expect((await request(app).delete('/api/calendar/events/e-plain')).status).toBe(204);
  });

  test('still sees reservation details and cancels any reservation', async () => {
    const list = await request(app).get('/api/calendar/events?calendarId=clubhouse');
    expect(JSON.stringify(list.body)).toContain('SECRET-NOTE');
    expect((await request(app).delete('/api/calendar/reservations/e-club')).status).toBe(204);
    expect(stillThere('e-club')).toBe(false);
  });
});

describe('a calendar that names none behaves as today', () => {
  test('an account with no manage permission is refused, signed out gets 401', async () => {
    holds();
    expect((await request(app).post('/api/calendar/events').send(newEvent('plain'))).status).toBe(403);
    who.signedIn = false;
    who.permissions = new Set();
    expect((await request(app).post('/api/calendar/events').send(newEvent('plain'))).status).toBe(401);
    expect((await request(app).delete('/api/calendar/events/e-plain')).status).toBe(401);
  });

  test('a calendar the configuration does not name, and an event with no calendarId, ask calendar-manage', async () => {
    holds('association-event-post');
    expect((await request(app).post('/api/calendar/events').send(newEvent('not-configured'))).status).toBe(403);
    holds('calendar-manage');
    const res = await request(app).post('/api/calendar/events').send(newEvent());
    expect(res.status).toBe(201);
    expect(manager.getById(res.body.id)?.calendarId).toBe('default');
  });

  test('an event id that does not exist answers 404 to a holder of calendar-manage and is refused to anyone else', async () => {
    holds('calendar-manage');
    expect((await request(app).put('/api/calendar/events/nope').send({ title: 'x' })).status).toBe(404);
    expect((await request(app).delete('/api/calendar/events/nope')).status).toBe(404);
    holds('association-event-post');
    expect((await request(app).delete('/api/calendar/events/nope')).status).toBe(403);
  });
});

describe('a permission name the site has not declared fails closed', () => {
  test.each([
    ['holds the undeclared name itself', ['never-declared']],
    ['holds calendar-manage', ['calendar-manage']],
    ['holds every permission the site declares', ['calendar-manage', 'association-event-post', 'never-declared']]
  ])('someone who %s is refused on ghost-events', async (_label, perms) => {
    holds(...perms);
    const before = manager.count();
    expect((await request(app).post('/api/calendar/events').send(newEvent('ghost-events'))).status).toBe(403);
    expect((await request(app).put('/api/calendar/events/e-ghost').send({ title: 'x' })).status).toBe(403);
    expect((await request(app).delete('/api/calendar/events/e-ghost')).status).toBe(403);
    expect(manager.count()).toBe(before);
    expect(stillThere('e-ghost')).toBe(true);
  });

  test('a setting that is not text fails closed', async () => {
    holds('calendar-manage', 'association-event-post');
    expect((await request(app).post('/api/calendar/events').send(newEvent('odd-events'))).status).toBe(403);
    expect((await request(app).delete('/api/calendar/events/e-odd')).status).toBe(403);
  });

  test('when the site\'s declared permissions cannot be read, a named permission fails closed and the default still works', async () => {
    declared = undefined;
    holds('calendar-manage', 'association-event-post');
    expect((await request(app).post('/api/calendar/events').send(newEvent('association-events'))).status).toBe(403);
    expect((await request(app).post('/api/calendar/events').send(newEvent('plain'))).status).toBe(201);
  });
});

describe('a request that changes the event\'s calendar cannot get around the check', () => {
  test('moving an event off a calendar needs the permission of the calendar it is on', async () => {
    holds('calendar-manage'); // may manage the clubhouse, not association-events
    const res = await request(app).put('/api/calendar/events/e-assoc').send({ calendarId: 'clubhouse' });
    expect(res.status).toBe(403);
    expect(manager.getById('e-assoc')?.calendarId).toBe('association-events');
  });

  test('moving an event onto a calendar needs that calendar\'s permission too', async () => {
    holds('calendar-manage'); // owns the clubhouse event, not association-events
    const res = await request(app).put('/api/calendar/events/e-club').send({ calendarId: 'association-events' });
    expect(res.status).toBe(403);
    expect(manager.getById('e-club')?.calendarId).toBe('clubhouse');
  });

  test('the events holder cannot move an association event onto the clubhouse calendar', async () => {
    holds('association-event-post');
    const res = await request(app).put('/api/calendar/events/e-assoc').send({ calendarId: 'clubhouse' });
    expect(res.status).toBe(403);
    expect(manager.getById('e-assoc')?.calendarId).toBe('association-events');
  });

  test('someone who holds both permissions may move it', async () => {
    holds('calendar-manage', 'association-event-post');
    const res = await request(app).put('/api/calendar/events/e-assoc').send({ calendarId: 'plain' });
    expect(res.status).toBe(200);
    expect(manager.getById('e-assoc')?.calendarId).toBe('plain');
  });

  test('a calendarId in an edit that names the same calendar is no extra check', async () => {
    holds('association-event-post');
    const res = await request(app).put('/api/calendar/events/e-assoc').send({ calendarId: 'association-events', title: 'Same' });
    expect(res.status).toBe(200);
  });

  test.each([[null], [42], [['clubhouse']], [{ a: 1 }]])('a calendarId that is not text (%j) is refused as a bad request and changes nothing', async (value) => {
    holds('calendar-manage', 'association-event-post');
    expect((await request(app).put('/api/calendar/events/e-assoc').send({ calendarId: value })).status).toBe(400);
    expect(manager.getById('e-assoc')?.calendarId).toBe('association-events');
    const before = manager.count();
    expect((await request(app).post('/api/calendar/events').send({ ...newEvent(), calendarId: value })).status).toBe(400);
    expect(manager.count()).toBe(before);
  });
});
