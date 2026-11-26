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

const who = vi.hoisted((): { signedIn: boolean; permissions: Set<string>; during?: () => void } => ({ signedIn: false, permissions: new Set<string>() }));
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
          await Promise.resolve();
          who.during?.(); // another request gets in while the answer is awaited
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
    plain:               { workflow: 'managed', visibility: 'authenticated', enabled: true },
    'own-reservations':  { workflow: 'reservation', visibility: 'authenticated', enabled: true, 'manage-permission': 'association-event-post' },
    'notes-events':      { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 'association-event-post' },
    'evil-events':       { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 'association-event-post' },
    'broken-events':     { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 'association-event-post' },
    'far-events':        { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 'association-event-post' },
    'quote-events':      { workflow: 'managed', visibility: 'authenticated', enabled: true, 'manage-permission': 'association-event-post' }
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
  ev('e-plain', 'plain'),
  ev('e-own-resv', 'own-reservations', { class: 'CONFIDENTIAL', _private: { requester: 'someone-else', notes: 'SECRET-NOTE-2' } }),
  ev('e-notes', 'notes-events', { _private: { requester: 'someone-else', notes: 'SECRET-NOTE-3' } }),
  // Stored before the address rule: the feed must not hand it on.
  ev('e-badurl', 'association-events', { url: 'javascript:alert(document.domain)' }),
  ev('e-goodurl', 'association-events', { url: 'https://example.org/agenda' }),
  // Stored with line breaks in text fields (before the organizer rule): the feed must not let them add lines.
  ev('e-evil', 'evil-events', {
    title: 'Evil\r\nURL:javascript:alert(1)', location: 'Room\r\nATTACH:https://evil.example/x', organizer: 'a@b.c\r\nURL:javascript:alert(2)',
    description: 'line one\r\nURL:javascript:alert(3)\nline two'
  }),
  ev('e-evil-name', 'evil-events', { organizer: 'Bob\r\nATTENDEE:mailto:x@y.z' }),
  ev('e-evil-id\r\nURL:javascript:alert(5)', 'evil-events'),
  // An unreadable start must not take the whole feed down.
  ev('e-nodate', 'broken-events', { start: 'not-a-date' }),
  ev('e-fine', 'broken-events'),
  // Dates the feed cannot write (years outside 0..9999): each is left out, the rest stays.
  ev('e-far-start', 'far-events', { title: 'SECRET-FAR-TITLE', start: '+275760-09-13T00:00:00.000Z', end: undefined }),
  ev('e-far-end', 'far-events', { title: 'SECRET-FAR-TITLE', end: '+275760-09-13T00:00:00.000Z' }),
  ev('e-neg-start', 'far-events', { title: 'SECRET-FAR-TITLE', start: '-000001-01-01T00:00:00.000Z', end: '2026-12-01T11:00:00' }),
  ev('e-edge-fallback', 'far-events', { title: 'SECRET-FAR-TITLE', start: '9999-12-31T23:30:00.000Z', end: undefined }),
  ev('e-far-fine', 'far-events'),
  // An address with a Unicode line separator (stored before the rule): the feed must not hand it on.
  ev('e-lsurl', 'association-events', { url: 'https://example.org/ls\u2028URL:https://evil.example/x' }),
  // Organizer names that need quoting in the feed.
  ev('e-quote-inject', 'quote-events', { organizer: 'Bob"; ROLE=CHAIR;CN="x' }),
  ev('e-quote-readable', 'quote-events', { organizer: 'Zoë O\'Neil, Esq.' }),
  ev('e-quote-colon', 'quote-events', { organizer: 'Dept: Ops; Lead' })
];

let dir: string;
let app: express.Application;
let manager: CalendarDataManager;
let declared: Record<string, unknown> | undefined;

beforeEach(async () => {
  declared = DECLARED;
  who.signedIn = true;
  who.permissions = new Set();
  who.during = undefined;
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

  test('an event moved by another request while the check was awaited is refused, not changed', async () => {
    holds('association-event-post');
    who.during = () => { who.during = undefined; void manager.update('e-assoc', { calendarId: 'clubhouse' }); };
    const edit = await request(app).put('/api/calendar/events/e-assoc').send({ title: 'Hijacked' });
    expect(edit.status).toBe(409);
    expect(manager.getById('e-assoc')?.title).toBe('Title e-assoc');
    who.during = () => { who.during = undefined; void manager.update('e-plain', { calendarId: 'clubhouse' }); };
    holds('calendar-manage');
    expect((await request(app).delete('/api/calendar/events/e-plain')).status).toBe(409);
    expect(stillThere('e-plain')).toBe(true);
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

describe('reservation workflow and private details stay on calendar-manage (#2546)', () => {
  test('a reservation calendar that names its own permission is still managed by calendar-manage, not by that permission', async () => {
    holds('association-event-post');
    const before = manager.count();
    expect((await request(app).post('/api/calendar/events').send(newEvent('own-reservations'))).status).toBe(403);
    expect((await request(app).put('/api/calendar/events/e-own-resv').send({ title: 'Rewritten' })).status).toBe(403);
    expect((await request(app).delete('/api/calendar/events/e-own-resv')).status).toBe(403);
    expect(manager.count()).toBe(before);
    expect(manager.getById('e-own-resv')?.title).toBe('Title e-own-resv');
  });

  test('a holder of calendar-manage manages that reservation calendar', async () => {
    holds('calendar-manage');
    expect((await request(app).put('/api/calendar/events/e-own-resv').send({ title: 'Renamed' })).status).toBe(200);
    expect((await request(app).delete('/api/calendar/events/e-own-resv')).status).toBe(204);
  });

  test('an event with private details cannot be edited or deleted by the calendar\'s own manager alone', async () => {
    holds('association-event-post');
    expect((await request(app).put('/api/calendar/events/e-notes').send({ title: 'Rewritten' })).status).toBe(403);
    expect((await request(app).delete('/api/calendar/events/e-notes')).status).toBe(403);
    expect(manager.getById('e-notes')?.title).toBe('Title e-notes');
  });

  test('someone who holds both permissions may edit and delete an event with private details', async () => {
    holds('association-event-post', 'calendar-manage');
    expect((await request(app).put('/api/calendar/events/e-notes').send({ title: 'Renamed' })).status).toBe(200);
    expect((await request(app).delete('/api/calendar/events/e-notes')).status).toBe(204);
  });

  test('a calendar\'s own manager cannot forge a requester when creating an event', async () => {
    holds('association-event-post');
    const before = manager.count();
    const res = await request(app).post('/api/calendar/events')
      .send({ ...newEvent('association-events'), _private: { requester: 'victim' } });
    expect(res.status).toBe(403);
    expect(manager.count()).toBe(before);
  });

  test('a calendar\'s own manager cannot write private details into an event by editing it', async () => {
    holds('association-event-post');
    const res = await request(app).put('/api/calendar/events/e-assoc').send({ _private: { requester: 'victim' } });
    expect(res.status).toBe(403);
    expect(manager.getById('e-assoc')?._private).toBeUndefined();
  });

  test('a holder of both permissions may create an event with private details', async () => {
    holds('association-event-post', 'calendar-manage');
    const res = await request(app).post('/api/calendar/events')
      .send({ ...newEvent('association-events'), _private: { requester: 'someone' } });
    expect(res.status).toBe(201);
  });
});

// An event's `url` is opened by the calendar block when the event is clicked, so a
// calendar's own manager must not be able to store a script address there.
describe('an event\'s url', () => {
  const BAD = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', '\tjavascript:alert(1)',
    '\u0001javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'ftp://example.org/x',
    'blob:https://example.org/x', 'foo:bar',
    // Unicode line separators and the next-line character: refused like any control character.
    'https://example.org/a\u2028b', 'https://example.org/a\u2029b', 'https://example.org/a\u0085b', '\u2028https://example.org/', '/wiki/Page\u2029'
  ];
  const GOOD = ['', '/wiki/StandupNotes', 'relative/page', 'https://example.org/a?b=c', 'http://example.org', 'HTTPS://EXAMPLE.ORG', 'mailto:a@example.org', '//example.org/x', '#top', '?q=a:b'];

  describe('written by a holder of only the calendar\'s own permission', () => {
    beforeEach(() => holds('association-event-post'));

    test.each(BAD)('POST refuses %j with 400 and stores nothing', async (url) => {
      const before = manager.count();
      const res = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), url });
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe('string');
      expect(manager.count()).toBe(before);
    });

    test.each(BAD)('PUT refuses %j with 400 and leaves the event alone', async (url) => {
      const res = await request(app).put('/api/calendar/events/e-assoc').send({ url });
      expect(res.status).toBe(400);
      expect(manager.getById('e-assoc')?.url).toBeUndefined();
    });

    test.each([123, null, ['https://example.org'], { href: 'https://example.org' }])('refuses a url that is not text: %j', async (url) => {
      expect((await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), url })).status).toBe(400);
      expect((await request(app).put('/api/calendar/events/e-assoc').send({ url })).status).toBe(400);
      expect(manager.getById('e-assoc')?.url).toBeUndefined();
    });

    test.each(GOOD)('accepts %j on POST and PUT', async (url) => {
      const created = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), url });
      expect(created.status).toBe(201);
      expect(manager.getById(created.body.id)?.url ?? '').toBe(url);
      const edited = await request(app).put('/api/calendar/events/e-assoc').send({ url });
      expect(edited.status).toBe(200);
      expect(manager.getById('e-assoc')?.url ?? '').toBe(url);
    });

    test('a body with no url is still accepted', async () => {
      expect((await request(app).post('/api/calendar/events').send(newEvent('association-events'))).status).toBe(201);
    });
  });

  describe('written by a holder of calendar-manage', () => {
    beforeEach(() => holds('calendar-manage'));

    test('the same rule applies', async () => {
      const before = manager.count();
      expect((await request(app).post('/api/calendar/events').send({ ...newEvent('plain'), url: 'javascript:alert(1)' })).status).toBe(400);
      expect((await request(app).put('/api/calendar/events/e-plain').send({ url: 'JaVaScRiPt:alert(1)' })).status).toBe(400);
      expect(manager.count()).toBe(before);
      expect(manager.getById('e-plain')?.url).toBeUndefined();
      expect((await request(app).post('/api/calendar/events').send({ ...newEvent('plain'), url: 'https://example.org' })).status).toBe(201);
    });
  });

  describe('already stored', () => {
    beforeEach(() => holds());

    test('the list leaves a script address out and keeps a good one', async () => {
      const res = await request(app).get('/api/calendar/events?calendarId=association-events');
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('javascript:');
      const bad = res.body.find((e: { id: string }) => e.id === 'e-badurl');
      const good = res.body.find((e: { id: string }) => e.id === 'e-goodurl');
      expect(bad.title).toBe('Title e-badurl');
      expect(bad.url).toBeUndefined();
      expect(good.url).toBe('https://example.org/agenda');
    });

    test('a single event and a search leave it out too', async () => {
      const one = await request(app).get('/api/calendar/events/e-badurl');
      expect(one.status).toBe(200);
      expect(one.body.url).toBeUndefined();
      const found = await request(app).get('/api/calendar/events/search?q=e-badurl');
      expect(found.status).toBe(200);
      expect(JSON.stringify(found.body)).not.toContain('javascript:');
    });

    test('the .ics feed leaves it out', async () => {
      const res = await request(app).get('/api/calendar/association-events/feed.ics');
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('javascript:');
      expect(res.text).toContain('https://example.org/agenda');
    });

    test('the .ics feed leaves out an address with a line separator, and keeps the event', async () => {
      const res = await request(app).get('/api/calendar/association-events/feed.ics');
      expect(res.status).toBe(200);
      const unfolded = res.text.replace(/\r\n /g, '');
      expect(unfolded).toContain('UID:e-lsurl');
      expect(unfolded).not.toContain('evil.example');
      expect(unfolded).not.toContain('example.org/ls');
      expect(unfolded.split('\r\n').filter(l => l.startsWith('URL:') && l.includes('evil'))).toEqual([]);
    });
  });
});

// An organizer is written into the .ics feed, so a line break in it would add a line of
// the writer's choosing (a URL:, ATTACH: or ATTENDEE: line) for every subscriber.
describe('an event\'s organizer and the .ics feed', () => {
  const BAD_ORGANIZERS = ['a@b.c\r\nURL:javascript:alert(1)', 'Bob\r\nURL:javascript:alert(2)', 'Bob\nATTACH:https://evil.example/x', 'Bob\rATTENDEE:mailto:x@y.z', 'Bob\u0000', 'Bob\u0007', 'Bob\u007f'];

  describe('written by a holder of only the calendar\'s own permission', () => {
    beforeEach(() => holds('association-event-post'));

    test.each(BAD_ORGANIZERS)('POST refuses %j with 400 and stores nothing', async (organizer) => {
      const before = manager.count();
      const res = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), organizer });
      expect(res.status).toBe(400);
      expect(manager.count()).toBe(before);
    });

    test.each(BAD_ORGANIZERS)('PUT refuses %j with 400 and leaves the event alone', async (organizer) => {
      const res = await request(app).put('/api/calendar/events/e-assoc').send({ organizer });
      expect(res.status).toBe(400);
      expect(manager.getById('e-assoc')?.organizer).toBeUndefined();
    });

    test.each([5, ['a@b.c'], { name: 'x' }])('refuses an organizer that is not text: %j', async (organizer) => {
      expect((await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), organizer })).status).toBe(400);
      expect((await request(app).put('/api/calendar/events/e-assoc').send({ organizer })).status).toBe(400);
    });

    test('accepts an address and a plain name', async () => {
      for (const organizer of ['a@b.c', 'Bob Smith', 'Zoë O\'Neil, Esq.']) {
        expect((await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), organizer })).status).toBe(201);
        expect((await request(app).put('/api/calendar/events/e-assoc').send({ organizer })).status).toBe(200);
      }
    });

    test('a caller without the permission still gets 403 first', async () => {
      holds();
      expect((await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), organizer: 'a\r\nb' })).status).toBe(403);
    });
  });

  describe('a value already stored', () => {
    beforeEach(() => holds());

    test('adds no line to the feed, whichever field carries it', async () => {
      const res = await request(app).get('/api/calendar/evil-events/feed.ics');
      expect(res.status).toBe(200);
      const lines = res.text.split(/\r\n/);
      // None of the feed's lines is a property the stored text asked for.
      expect(lines.filter(l => /^(URL|ATTACH|ATTENDEE):/.test(l))).toEqual([]);
      expect(res.text).not.toMatch(/[\r\n](URL:javascript|ATTACH:|ATTENDEE:)/);
      expect(lines.slice(0, -1).filter(l => l === '')).toEqual([]);
      expect(res.text).not.toMatch(/\n(?<!\r\n)/);
      expect(res.text).toContain('Evil');
      expect(res.text).toContain('line one');
      expect(res.text).toContain('line two');
    });
  });
});

// A start that is not a date makes the whole calendar's .ics feed fail, for everyone.
describe('an event\'s dates', () => {
  describe('written by a holder of only the calendar\'s own permission', () => {
    beforeEach(() => holds('association-event-post'));

    test.each(['not-a-date', '2026-13-45', 'tomorrow-ish', '  '])('POST refuses a start of %j with 400', async (start) => {
      const before = manager.count();
      const res = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), start });
      expect(res.status).toBe(400);
      expect(manager.count()).toBe(before);
    });

    test.each(['not-a-date', '', 5, null])('POST refuses an end of %j with 400', async (end) => {
      const res = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), end });
      expect(res.status).toBe(400);
    });

    test.each(['not-a-date', '', 5, null, ['2026-12-01']])('PUT refuses a start of %j with 400 and leaves the event alone', async (start) => {
      const res = await request(app).put('/api/calendar/events/e-assoc').send({ start });
      expect(res.status).toBe(400);
      expect(manager.getById('e-assoc')?.start).toBe('2026-12-01T10:00:00');
    });

    test.each(['not-a-date', 5, ['2026-12-01']])('PUT refuses an end of %j with 400 and leaves the event alone', async (end) => {
      const res = await request(app).put('/api/calendar/events/e-assoc').send({ end });
      expect(res.status).toBe(400);
      expect(manager.getById('e-assoc')?.end).toBe('2026-12-01T11:00:00');
    });

    test('accepts a date, a date and time, and no end', async () => {
      for (const start of ['2026-12-05', '2026-12-05T09:30:00', '2026-12-05T09:30:00.000Z', '2026-12-05T09:30:00+02:00']) {
        expect((await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), start })).status).toBe(201);
      }
      const put = await request(app).put('/api/calendar/events/e-assoc').send({ start: '2026-12-06T10:00:00', end: '2026-12-06T11:00:00' });
      expect(put.status).toBe(200);
    });

    test('a caller without the permission still gets 403 first', async () => {
      holds();
      expect((await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), start: 'not-a-date' })).status).toBe(403);
    });
  });

  describe('an event already stored with an unreadable start', () => {
    test('the .ics feed leaves that event out and lists the rest', async () => {
      holds();
      const res = await request(app).get('/api/calendar/broken-events/feed.ics');
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('e-nodate');
      expect(res.text).toContain('UID:e-fine');
    });
  });
});

// The feed writes dates as four-digit years. A date outside 0..9999 (JavaScript reads dates up to
// the year 275760) would be written as a malformed one and the whole feed would be refused.
describe('an event\'s dates outside the years 0 to 9999', () => {
  const OUT_OF_RANGE = ['+275760-09-13T00:00:00.000Z', '-000001-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z', '-271821-04-20T00:00:00.000Z'];

  describe('written by a holder of only the calendar\'s own permission', () => {
    beforeEach(() => holds('association-event-post'));

    test.each(OUT_OF_RANGE)('POST refuses a start of %s with 400 and stores nothing', async (start) => {
      const before = manager.count();
      const res = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), start });
      expect(res.status).toBe(400);
      expect(manager.count()).toBe(before);
    });

    test.each(OUT_OF_RANGE)('POST refuses an end of %s with 400', async (end) => {
      const before = manager.count();
      const res = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), end });
      expect(res.status).toBe(400);
      expect(manager.count()).toBe(before);
    });

    test.each(OUT_OF_RANGE)('PUT refuses a start of %s with 400 and leaves the event alone', async (start) => {
      const res = await request(app).put('/api/calendar/events/e-assoc').send({ start });
      expect(res.status).toBe(400);
      expect(manager.getById('e-assoc')?.start).toBe('2026-12-01T10:00:00');
    });

    test.each(OUT_OF_RANGE)('PUT refuses an end of %s with 400 and leaves the event alone', async (end) => {
      const res = await request(app).put('/api/calendar/events/e-assoc').send({ end });
      expect(res.status).toBe(400);
      expect(manager.getById('e-assoc')?.end).toBe('2026-12-01T11:00:00');
    });

    test('a start with no end whose "start plus one hour" would pass the year 9999 is refused', async () => {
      const before = manager.count();
      const res = await request(app).post('/api/calendar/events').send({ ...newEvent('association-events'), start: '9999-12-31T23:30:00.000Z' });
      expect(res.status).toBe(400);
      expect(manager.count()).toBe(before);
      expect((await request(app).put('/api/calendar/events/e-assoc').send({ start: '9999-12-31T23:30:00.000Z', end: undefined })).status).toBe(400);
    });

    test('PUT with end "" or end null answers 400 and leaves the event alone', async () => {
      for (const end of ['', null]) {
        const res = await request(app).put('/api/calendar/events/e-assoc').send({ end });
        expect(res.status).toBe(400);
      }
      expect(manager.getById('e-assoc')?.end).toBe('2026-12-01T11:00:00');
    });

    test('the first and last years are accepted, and the feed still builds', async () => {
      for (const [start, end] of [['0001-01-01T00:00:00.000Z', '0001-01-01T01:00:00.000Z'], ['9999-12-31T21:00:00.000Z', '9999-12-31T23:00:00.000Z'], ['9999-12-31T22:00:00.000Z', undefined]]) {
        const res = await request(app).post('/api/calendar/events').send({ ...newEvent('far-events'), start, ...(end ? { end } : {}) });
        expect(res.status).toBe(201);
      }
      const feed = await request(app).get('/api/calendar/far-events/feed.ics');
      expect(feed.status).toBe(200);
      expect(feed.text).toContain('DTSTART:00010101T000000Z');
      expect(feed.text).toContain('DTEND:99991231T230000Z');
    });
  });

  describe('an event already stored with one', () => {
    beforeEach(() => holds());

    test('the .ics feed leaves each out and lists the rest', async () => {
      const res = await request(app).get('/api/calendar/far-events/feed.ics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('UID:e-far-fine');
      for (const id of ['e-far-start', 'e-far-end', 'e-neg-start', 'e-edge-fallback']) expect(res.text).not.toContain(id);
      expect(res.text).not.toMatch(/\+\d{3}/);
      expect(res.text).not.toMatch(/DT(START|END)[^\r\n]*:-/);
    });

    test('an out-of-range created, updated or stamp date is dropped without losing the event', async () => {
      holds('association-event-post');
      const created = await request(app).post('/api/calendar/events').send({ ...newEvent('far-events'), title: 'Stamped' });
      expect(created.status).toBe(201);
      // A stored event whose bookkeeping dates are past the range.
      await manager.update(created.body.id, { created: '+275760-09-13T00:00:00.000Z', updated: '-000001-01-01T00:00:00.000Z', dtstamp: '+010000-01-01T00:00:00.000Z' });
      const feed = await request(app).get('/api/calendar/far-events/feed.ics');
      expect(feed.status).toBe(200);
      expect(feed.text).toContain(`UID:${created.body.id}`);
      expect(feed.text).not.toMatch(/\+\d{3}/);
    });

    test('leaves one log line per skipped event, naming the calendar and the event but not its text', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const res = await request(app).get('/api/calendar/far-events/feed.ics');
        expect(res.status).toBe(200);
        const lines = warn.mock.calls.map(c => c.map(String).join(' '));
        for (const id of ['e-far-start', 'e-far-end', 'e-neg-start', 'e-edge-fallback']) {
          const mine = lines.filter(l => l.includes(id));
          expect(mine).toHaveLength(1);
          expect(mine[0]).toContain('far-events');
        }
        expect(lines.some(l => l.includes('e-far-fine'))).toBe(false);
        expect(lines.join('\n')).not.toContain('SECRET-FAR-TITLE');
      } finally {
        warn.mockRestore();
      }
    });

    test('an unreadable start leaves a log line too, and an id with a line break cannot add a log line', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        await request(app).get('/api/calendar/broken-events/feed.ics');
        await request(app).get('/api/calendar/evil-events/feed.ics');
        const lines = warn.mock.calls.map(c => c.map(String).join(' '));
        expect(lines.some(l => l.includes('e-nodate') && l.includes('broken-events'))).toBe(true);
        for (const l of lines) expect(l).not.toMatch(/[\r\n]/);
      } finally {
        warn.mockRestore();
      }
    });
  });
});

// RFC 5545: a parameter value that holds a colon, semicolon or comma must be a quoted string, and a
// quoted string cannot hold a double quote. The organizer's display name is the CN parameter.
describe('an organizer name in the .ics feed', () => {
  const organizerLines = (text: string, id: string) => {
    const unfolded = text.replace(/\r\n /g, '');
    const block = unfolded.split('BEGIN:VEVENT').find(b => b.includes(`UID:${id}\r\n`)) ?? '';
    return block.split('\r\n').filter(l => l.startsWith('ORGANIZER'));
  };
  // A well-formed ORGANIZER line: one quoted CN parameter, then the address.
  const WELL_FORMED = /^ORGANIZER;CN="[^"]*":MAILTO:noreply@calendar$/;

  beforeEach(() => holds());

  test('a name with a quote cannot add a parameter', async () => {
    const res = await request(app).get('/api/calendar/quote-events/feed.ics');
    expect(res.status).toBe(200);
    const lines = organizerLines(res.text, 'e-quote-inject');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(WELL_FORMED);
    // Parameters outside the quoted string: only CN.
    const outside = lines[0].replace(/"[^"]*"/g, '""');
    expect(outside.split(':')[0].split(';').slice(1)).toEqual(['CN=""']);
    expect(lines[0]).toContain('Bob');
  });

  test('a name with a comma, colon or semicolon is written as a quoted string and reads as written', async () => {
    const res = await request(app).get('/api/calendar/quote-events/feed.ics');
    const readable = organizerLines(res.text, 'e-quote-readable');
    expect(readable).toEqual(['ORGANIZER;CN="Zoë O\'Neil, Esq.":MAILTO:noreply@calendar']);
    const colon = organizerLines(res.text, 'e-quote-colon');
    expect(colon).toEqual(['ORGANIZER;CN="Dept: Ops; Lead":MAILTO:noreply@calendar']);
  });

  test('a plain name is quoted too, and an address stays an address', async () => {
    holds('association-event-post');
    const plain = await request(app).post('/api/calendar/events').send({ ...newEvent('quote-events'), organizer: 'Bob Smith' });
    const mail = await request(app).post('/api/calendar/events').send({ ...newEvent('quote-events'), organizer: 'bob@example.org' });
    const res = await request(app).get('/api/calendar/quote-events/feed.ics');
    expect(organizerLines(res.text, plain.body.id)).toEqual(['ORGANIZER;CN="Bob Smith":MAILTO:noreply@calendar']);
    expect(organizerLines(res.text, mail.body.id)).toEqual(['ORGANIZER:MAILTO:bob@example.org']);
  });
});
