/**
 * #2391 slice 1: the marquee text applies each calendar's `visibility` setting
 * for the viewer, with the real access evaluator answering `calendar-read` and
 * `calendar-manage` (the add-on's own policies over the shipped defaults).
 *
 * The add-on is registered the way the site registers it, so the manager's
 * `toMarqueeText(options, viewer)` is reached as MarqueePlugin reaches it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import calendarAddon from '../index';
import type CalendarDataManager from '../managers/CalendarDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';
import { mergeConfigWithAddons } from '../../../dist/src/utils/addonConfigLayer.js';
import { pdpOver } from '../../../dist/src/test-support/policyDecisionPoint.js';

const repoRoot = path.resolve(__dirname, '../../..');
const shipped = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const CALENDARS = {
  open:    { workflow: 'managed', visibility: 'public',        enabled: true },
  members: { workflow: 'managed', visibility: 'authenticated', enabled: true },
  staff:   { workflow: 'managed', visibility: 'private',       enabled: true },
  plain:   { workflow: 'managed',                               enabled: true },
  off:     { workflow: 'managed', visibility: 'public',        enabled: false }
};

const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19);
const ev = (id: string, calendarId: string, days: number) => ({
  id, calendarId, title: `T-${id}`, start: soon(days), end: soon(days + 0.1),
  created: '2026-11-01T00:00:00.000Z', updated: '2026-11-01T00:00:00.000Z'
});
const EVENTS = [
  ev('pub', 'open', 1), ev('mem', 'members', 2), ev('staff', 'staff', 3),
  ev('plain', 'plain', 4), ev('nowhere', 'not-configured', 5), ev('off', 'off', 6),
  ev('early', 'staff', 0.5)
];

let dir: string;
let marquee: (viewer: unknown, options?: Record<string, string>) => Promise<string>;
let live: Record<string, unknown>;

const anonymous = { username: null, roles: ['Anonymous'], isAuthenticated: false };
const reader = { username: 'ann', roles: ['reader'], isAuthenticated: true };
const admin = { username: 'root', roles: ['admin'], isAuthenticated: true };

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-marquee-'));
  const byCalendar = new Map<string, unknown[]>();
  for (const e of EVENTS) byCalendar.set(e.calendarId, [...(byCalendar.get(e.calendarId) ?? []), e]);
  for (const [id, list] of byCalendar) fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(list));

  const { merged } = mergeConfigWithAddons({ ...shipped, 'ngdpbase.addons.calendar.enabled': true }, {}, repoRoot, path.join(dir, 'data'));
  const pdp = await pdpOver(merged);
  live = { calendars: CALENDARS };
  const managers: Record<string, unknown> = {
    PolicyDecisionPoint: pdp,
    AddonsManager: { getAddonConfig: () => live, registerStylesheet: () => undefined, registerDashboardCard: () => undefined }
  };
  const engine = {
    getManager: (name: string) => managers[name],
    registerManager: (name: string, m: unknown) => { managers[name] = m; },
    setCapability: () => undefined,
    createRouter: () => express.Router(),
    serveStatic: () => (_req: unknown, _res: unknown, next: () => void) => next()
  };
  const host = { ...buildAddonHost('calendar', {}), systemContext: () => ({}) } as never;
  await calendarAddon.register(engine, { dataPath: dir, calendars: CALENDARS }, host);
  const manager = managers['CalendarDataManager'] as CalendarDataManager;
  marquee = (viewer, options = {}) => (manager.toMarqueeText as unknown as (o: unknown, v: unknown) => Promise<string>)
    .call(manager, { days: '30', ...options }, viewer);
});

afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('toMarqueeText applies each calendar\'s visibility setting', () => {
  test('a signed-out visitor reads only the public calendars, not one with no setting', async () => {
    const text = await marquee(anonymous);
    expect(text).toContain('T-pub');
    for (const hidden of ['T-plain', 'T-mem', 'T-staff', 'T-nowhere', 'T-off']) expect(text).not.toContain(hidden);
  });

  test('a signed-in account also reads the calendars shown to signed-in people', async () => {
    const text = await marquee(reader);
    expect(text).toContain('T-mem');
    for (const hidden of ['T-plain', 'T-staff', 'T-nowhere', 'T-off']) expect(text).not.toContain(hidden);
  });

  test('a holder of calendar-manage reads the private and unconfigured calendars, but not a disabled one', async () => {
    const text = await marquee(admin);
    for (const shown of ['T-pub', 'T-mem', 'T-staff', 'T-plain', 'T-nowhere']) expect(text).toContain(shown);
    expect(text).not.toContain('T-off');
  });

  test('two viewers asking in turn each get their own text', async () => {
    const first = await marquee(admin);
    const second = await marquee(anonymous);
    expect(first).toContain('T-staff');
    expect(second).not.toContain('T-staff');
  });

  test('no viewer given: only the public calendars', async () => {
    const text = await marquee(undefined);
    expect(text).toContain('T-pub');
    expect(text).not.toContain('T-mem');
    expect(text).not.toContain('T-staff');
  });

  test('the limit counts only what the viewer may read', async () => {
    const text = await marquee(anonymous, { limit: '1' });
    expect(text).toContain('T-pub');
    expect(text).not.toContain('T-early');
  });

  test('a changed setting applies on the next call, with no restart', async () => {
    expect(await marquee(anonymous)).toContain('T-pub');
    live = { calendars: { ...CALENDARS, open: { workflow: 'managed', visibility: 'private', enabled: true } } };
    expect(await marquee(anonymous)).not.toContain('T-pub');
  });
});
