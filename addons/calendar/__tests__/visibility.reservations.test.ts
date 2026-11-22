/**
 * #2391 slice 1: POST /api/calendar/reservations applies the same visibility
 * setting as the read routes, read from the add-on's current configuration on
 * each request.
 *
 * A calendar the requester may not see, a disabled one and one the configuration
 * does not name all get the identical answer, so the reply does not tell them
 * apart. A requester who may see a public reservation calendar can still reserve.
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import express from 'express';
import request from 'supertest';
import reservationRoutes from '../routes/reservations';
import CalendarDataManager from '../managers/CalendarDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

const host = () => buildAddonHost('calendar', {});

const who = vi.hoisted(() => ({ permissions: new Set<string>(), username: 'ann' }));
vi.mock('../../../dist/src/context/ApiContext', async () => {
  const real = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
  return {
    ...real,
    ApiContext: {
      from: () => ({
        username: who.username,
        email: undefined,
        displayName: 'Ann',
        isAuthenticated: true,
        getActor: () => ({}),
        actingUsername: () => who.username,
        hasPermission: async (p: string) => who.permissions.has(p),
        requirePermission: async (p: string) => {
          if (!who.permissions.has(p)) throw new real.ApiError(403, 'Forbidden');
        }
      })
    }
  };
});

const CONFIG = {
  calendars: {
    hall:    { workflow: 'reservation', visibility: 'public',  enabled: true },
    board:   { workflow: 'reservation', visibility: 'private', enabled: true },
    closed:  { workflow: 'reservation', visibility: 'public',  enabled: false },
    members: { workflow: 'reservation', visibility: 'authenticated', enabled: true }
  }
};

const body = (calendarId: string) => ({
  calendarId, title: 'Party', start: '2026-12-05T10:00:00', end: '2026-12-05T12:00:00'
});

let dir: string;
let app: express.Application;
let live: Record<string, unknown>;

beforeEach(async () => {
  live = CONFIG;
  who.permissions = new Set(['calendar-reserve']);
  who.username = 'ann';
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cal-reservations-'));
  const manager = new CalendarDataManager(dir);
  await manager.load();
  const engine = {
    getManager: (name: string) => (name === 'CalendarDataManager' ? manager
      : name === 'AddonsManager' ? { getAddonConfig: () => live } : undefined),
    createRouter: () => express.Router()
  };
  app = express();
  app.use(express.json());
  // The configuration register() was given is empty: the live one decides.
  app.use('/api/calendar', reservationRoutes(engine as never, {}, host()));
});

afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

describe('POST /api/calendar/reservations', () => {
  test('a requester who may not see the calendar, a disabled calendar and an unconfigured id get the identical answer', async () => {
    const hidden = await request(app).post('/api/calendar/reservations').send(body('board'));
    const disabled = await request(app).post('/api/calendar/reservations').send(body('closed'));
    const unnamed = await request(app).post('/api/calendar/reservations').send(body('nowhere'));
    expect(hidden.status).toBe(400);
    expect(hidden.body.error).toMatch(/does not accept reservations/);
    expect(disabled.status).toBe(hidden.status);
    expect(unnamed.status).toBe(hidden.status);
    expect(disabled.body.error.replace('closed', 'X')).toBe(hidden.body.error.replace('board', 'X'));
    expect(unnamed.body.error.replace('nowhere', 'X')).toBe(hidden.body.error.replace('board', 'X'));
  });

  test('a time already taken on a calendar the requester may not see is not told apart from the others', async () => {
    who.permissions = new Set(['calendar-reserve', 'calendar-manage']);
    expect((await request(app).post('/api/calendar/reservations').send(body('board'))).status).toBe(201);
    who.permissions = new Set(['calendar-reserve']);
    const taken = await request(app).post('/api/calendar/reservations').send(body('board'));
    expect(taken.status).toBe(400);
    expect(taken.body.error).toMatch(/does not accept reservations/);
  });

  test('a requester who may see a public reservation calendar can still reserve', async () => {
    const res = await request(app).post('/api/calendar/reservations').send(body('hall'));
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Party');
  });

  test('a holder of calendar-read can reserve on an authenticated calendar, a holder of calendar-manage on a private one', async () => {
    expect((await request(app).post('/api/calendar/reservations').send(body('members'))).status).toBe(400);
    who.permissions = new Set(['calendar-reserve', 'calendar-read']);
    expect((await request(app).post('/api/calendar/reservations').send(body('members'))).status).toBe(201);
    who.permissions = new Set(['calendar-reserve', 'calendar-manage']);
    expect((await request(app).post('/api/calendar/reservations').send(body('board'))).status).toBe(201);
  });

  test('the setting is read on each request: a changed visibility applies with no restart', async () => {
    expect((await request(app).post('/api/calendar/reservations').send(body('hall'))).status).toBe(201);
    live = { calendars: { ...CONFIG.calendars, hall: { workflow: 'reservation', visibility: 'private', enabled: true } } };
    expect((await request(app).post('/api/calendar/reservations').send(body('hall'))).status).toBe(400);
  });

  test('the workflow is read on each request too', async () => {
    live = { calendars: { ...CONFIG.calendars, hall: { workflow: 'managed', visibility: 'public', enabled: true } } };
    const res = await request(app).post('/api/calendar/reservations').send(body('hall'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not accept reservations/);
  });

  test('a calendar named __proto__ is treated like one the configuration does not name', async () => {
    const res = await request(app).post('/api/calendar/reservations').send(body('__proto__'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not accept reservations/);
  });
});

describe('DELETE /api/calendar/reservations/:id', () => {
  const reserve = async (calendarId = 'hall') => {
    const res = await request(app).post('/api/calendar/reservations').send(body(calendarId));
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  test('a caller who is neither the requester nor a manager gets the same 404 whether the reservation exists or not', async () => {
    const id = await reserve();
    who.username = 'bob';
    const existing = await request(app).delete(`/api/calendar/reservations/${id}`);
    const missing = await request(app).delete('/api/calendar/reservations/no-such-id');
    expect(existing.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(existing.body).toEqual(missing.body);
    who.username = 'ann';
    expect((await request(app).delete(`/api/calendar/reservations/${id}`)).status).toBe(204);
  });

  test('the requester and a manager can still cancel', async () => {
    const mine = await reserve();
    expect((await request(app).delete(`/api/calendar/reservations/${mine}`)).status).toBe(204);
    const other = await reserve();
    who.username = 'bob';
    who.permissions = new Set(['calendar-reserve', 'calendar-manage']);
    expect((await request(app).delete(`/api/calendar/reservations/${other}`)).status).toBe(204);
  });

  test('a manager asking for a reservation that does not exist still gets 404', async () => {
    who.permissions = new Set(['calendar-reserve', 'calendar-manage']);
    expect((await request(app).delete('/api/calendar/reservations/no-such-id')).status).toBe(404);
  });
});
