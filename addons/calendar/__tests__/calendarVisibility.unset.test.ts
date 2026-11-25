/**
 * #2391: every calendar must have a visibility setting. A configured calendar
 * with no `visibility` is read like a setting that is none of the three: only
 * holders of `calendar-manage` see it. Nothing falls back to public. The admin
 * page names each calendar that has no setting.
 */
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import express from 'express';
import request from 'supertest';
import adminRoutes from '../routes/admin';
import { calendarGate, unsetVisibilityCalendars, visibilityOf } from '../managers/calendarVisibility';

const config = {
  calendars: {
    Clubhouse: { workflow: 'reservation', enabled: true },
    events:    { workflow: 'managed', visibility: 'public', enabled: true },
    tennis:    { workflow: 'reservation', visibility: 'authenticated' },
    staff:     { workflow: 'managed', visibility: 'private' },
    Garden:    { workflow: 'managed' },
    off:       { workflow: 'managed', enabled: false }
  }
};

const anonymous = async () => false;
const member = async (p: string) => p === 'calendar-read';
const manager = async (p: string) => p === 'calendar-read' || p === 'calendar-manage';

describe('a configured calendar with no visibility', () => {
  test('is read as private', () => {
    expect(visibilityOf(config, 'Clubhouse')).toBe('private');
  });

  test('is hidden from a signed-out visitor', async () => {
    expect(await calendarGate(anonymous, config)('Clubhouse')).toBe(false);
  });

  test('is hidden from a signed-in member', async () => {
    expect(await calendarGate(member, config)('Clubhouse')).toBe(false);
  });

  test('is visible to a holder of calendar-manage', async () => {
    expect(await calendarGate(manager, config)('Clubhouse')).toBe(true);
  });

  test('a visibility of undefined counts as no setting', async () => {
    const odd = { calendars: { c: { workflow: 'managed', visibility: undefined } } };
    expect(await calendarGate(member, odd)('c')).toBe(false);
  });

  test('settings that are set still apply', async () => {
    expect(await calendarGate(anonymous, config)('events')).toBe(true);
    expect(await calendarGate(anonymous, config)('tennis')).toBe(false);
    expect(await calendarGate(member, config)('tennis')).toBe(true);
    expect(await calendarGate(member, config)('staff')).toBe(false);
  });
});

describe('unsetVisibilityCalendars', () => {
  test('lists exactly the enabled calendars with no visibility setting', () => {
    expect(unsetVisibilityCalendars(config)).toEqual(['Clubhouse', 'Garden']);
  });

  test('lists nothing when every calendar has a setting', () => {
    expect(unsetVisibilityCalendars({ calendars: { a: { visibility: 'public' }, b: { visibility: 'private' } } })).toEqual([]);
  });

  test('lists nothing when no calendars are configured', () => {
    expect(unsetVisibilityCalendars({})).toEqual([]);
    expect(unsetVisibilityCalendars({ calendars: [] })).toEqual([]);
  });

  test('does not list a calendar whose setting is wrong rather than missing', () => {
    expect(unsetVisibilityCalendars({ calendars: { a: { visibility: 'privte' } } })).toEqual([]);
  });
});

describe('the admin page warning', () => {
  const view = fs.readFileSync(path.join(__dirname, '../../../views/admin-calendar.ejs'), 'utf8');
  const render = (unset: string[]) => ejs.render(view, {
    calendarSections: [], csrfToken: 'x', successMessage: null, errorMessage: null, unsetVisibility: unset
  }, { includer: () => ({ template: '' }) });

  test('names each calendar with no setting, in plain words', () => {
    const html = render(['Clubhouse', 'Garden']);
    expect(html).toContain('These calendars have no visibility setting, so only calendar managers can see them: Clubhouse, Garden.');
    expect(html).toContain('Set each one to Public, Signed-in or Private.');
  });

  test('escapes the calendar names', () => {
    const html = render(['<script>alert(1)</script>']);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('shows no warning when every calendar has a setting', () => {
    expect(render([])).not.toContain('no visibility setting');
  });
});

describe('GET /addons/calendar hands the page the calendars with no setting', () => {
  const host = {
    ApiContext: { from: () => ({ requirePermission: async () => undefined }) },
    ApiError: class extends Error {},
    sendApiError: () => undefined
  };
  const page = async (live: Record<string, unknown>) => {
    const engine = {
      getManager: (name: string) => (name === 'AddonsManager' ? { getAddonConfig: () => live } : undefined),
      createRouter: () => express.Router()
    };
    const app = express();
    app.use((_req, res, next) => { res.render = ((_v: string, data: unknown) => res.json(data)) as never; next(); });
    app.use('/addons/calendar', adminRoutes(engine as never, {}, host as never));
    return (await request(app).get('/addons/calendar')).body as { unsetVisibility: string[] };
  };

  test('names exactly the calendars with no setting', async () => {
    expect((await page(config)).unsetVisibility).toEqual(['Clubhouse', 'Garden']);
  });

  test('names none when every calendar has a setting', async () => {
    expect((await page({ calendars: { a: { visibility: 'public' } } })).unsetVisibility).toEqual([]);
  });
});
