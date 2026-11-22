/**
 * #2391 slice 1: the clubhouse reservation form's handler applies the same
 * visibility, enabled and workflow settings as POST /api/calendar/reservations,
 * read from the add-on's current configuration on each submission.
 *
 * A calendar the submitter may not see, a disabled one and one the configuration
 * does not name all get the identical refusal, the same text whether the slot is
 * booked or free, and the refusal creates no event.
 */
import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import express from 'express';
import calendarAddon from '../index';
import type CalendarDataManager from '../managers/CalendarDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

const who = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('../../../dist/src/context/ApiContext', async () => {
  const real = await vi.importActual<typeof import('../../../dist/src/context/ApiContext.js')>('../../../dist/src/context/ApiContext.js');
  return {
    ...real,
    ApiContext: {
      from: () => ({
        username: 'ann',
        isAuthenticated: who.permissions.size > 0,
        hasPermission: async (p: string) => who.permissions.has(p)
      })
    }
  };
});

type Handler = (submission: unknown, context: unknown) => Promise<{ ok: boolean; error?: string; calendarEventId?: string }>;

const entry = (visibility: string, extra: Record<string, unknown> = {}) => ({ workflow: 'reservation', visibility, enabled: true, ...extra });

let dir: string;
let live: Record<string, unknown>;
let handler: Handler;
let manager: CalendarDataManager;

const submission = {
  submittedBy: 'ann', submitterName: 'Ann',
  data: { name: 'Ann', email: 'ann@example.com', date: '2026-12-05', startTime: '10:00', endTime: '12:00' }
};
const submit = () => handler(submission, { engine: {}, req: {}, decider: null });
const stored = () => manager.query({ calendarId: 'clubhouse' }).length;

async function start(calendars: Record<string, unknown> | unknown[] | undefined) {
  live = calendars === undefined ? {} : { calendars };
  const managers: Record<string, unknown> = {
    AddonsManager: { getAddonConfig: () => live, registerStylesheet: () => undefined, registerDashboardCard: () => undefined },
    FormsAddon: { registerHandler: (id: string, h: Handler) => { if (id === 'clubhouse-reservation') handler = h; } }
  };
  const engine = {
    getManager: (name: string) => managers[name],
    registerManager: (name: string, m: unknown) => { managers[name] = m; },
    setCapability: () => undefined,
    createRouter: () => express.Router(),
    serveStatic: () => (_req: unknown, _res: unknown, next: () => void) => next()
  };
  const host = { ...buildAddonHost('calendar', {}), systemContext: () => ({}) } as never;
  await calendarAddon.register(engine, { dataPath: dir }, host);
  manager = managers['CalendarDataManager'] as CalendarDataManager;
}

beforeEach(async () => {
  who.permissions = new Set(['form-submit']);
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cal-clubhouse-'));
});
afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

describe('the clubhouse reservation form handler', () => {
  test('a private, a disabled and an unnamed clubhouse calendar get the identical refusal and create nothing', async () => {
    const answers: unknown[] = [];
    for (const calendars of [
      { clubhouse: entry('private') },
      { clubhouse: entry('public', { enabled: false }) },
      { elsewhere: entry('public') }
    ]) {
      await fsp.rm(dir, { recursive: true, force: true });
      dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cal-clubhouse-'));
      await start(calendars);
      answers.push(await submit());
      expect(stored()).toBe(0);
    }
    expect(answers[0]).toMatchObject({ ok: false });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  test('the refusal reads the same whether the slot is booked or free', async () => {
    await start({ clubhouse: entry('private') });
    const free = await submit();
    who.permissions = new Set(['form-submit', 'calendar-manage']);
    await manager.create({ calendarId: 'clubhouse', title: 'Taken', start: '2026-12-05T09:00', end: '2026-12-05T13:00' });
    who.permissions = new Set(['form-submit']);
    const booked = await submit();
    expect(free.ok).toBe(false);
    expect(booked).toEqual(free);
    expect(stored()).toBe(1);
  });

  test('a signed-out submitter gets the same refusal for a calendar shown to signed-in people', async () => {
    await start({ clubhouse: entry('authenticated') });
    who.permissions = new Set();
    const refused = await submit();
    expect(refused.ok).toBe(false);
    expect(stored()).toBe(0);
    await fsp.rm(dir, { recursive: true, force: true });
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cal-clubhouse-'));
    await start({ clubhouse: entry('private') });
    expect(await submit()).toEqual(refused);
  });

  test('a calendar whose workflow is not reservation is refused', async () => {
    await start({ clubhouse: entry('public', { workflow: 'managed' }) });
    expect((await submit()).ok).toBe(false);
    expect(stored()).toBe(0);
  });

  test('a calendars list in the configuration is read as naming no calendar', async () => {
    await start([entry('public')]);
    expect((await submit()).ok).toBe(false);
    expect(stored()).toBe(0);
  });

  test('a submitter who may see a public reservation calendar still reserves; a taken slot is still reported as taken', async () => {
    await start({ clubhouse: entry('public') });
    const first = await submit();
    expect(first.ok).toBe(true);
    expect(stored()).toBe(1);
    const again = await submit();
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already reserved/);
  });

  test('a holder of calendar-read reserves on an authenticated calendar, a holder of calendar-manage on a private one', async () => {
    await start({ clubhouse: entry('authenticated') });
    expect((await submit()).ok).toBe(false);
    who.permissions = new Set(['form-submit', 'calendar-read']);
    expect((await submit()).ok).toBe(true);
    await fsp.rm(dir, { recursive: true, force: true });
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cal-clubhouse-'));
    await start({ clubhouse: entry('private') });
    who.permissions = new Set(['form-submit', 'calendar-manage']);
    expect((await submit()).ok).toBe(true);
  });
});
