/**
 * #1906 (operator, 2026-10-19): one maintenance door. MaintenanceState owns
 * whether the site is in maintenance mode, the reasons (administrators only),
 * the visitor message and estimate, and whether administrators may enter.
 *
 * The four entry paths are each proven where their manager is tested, through
 * the real door: the admin toggle (WikiRoutes.coverage16), audit refuse-boot
 * (AuditManager.test), a site-critical add-on (AddonsManager.siteCritical),
 * the application database (DatabaseManager.unavailable). This file holds the
 * door itself, the gate that reads it, and the page it renders.
 *
 * Sabotage (each done once, each turned these red): take the manager's message
 * after the configured one → "a manager's own message wins"; read the legacy
 * key before the site's message → "the site's message beats the legacy key";
 * drop the legacy read → "the retired key still speaks"; let `adminsMayEnter`
 * ignore a failure → "a failure keeps administrators out"; read
 * `isClosedToAdmins` once at boot in initialisationGate (engineReady alone) →
 * "leave() reopens the site"; drop `siteName` from the title in the view →
 * "the page names the site"; make the visitor message the joined reasons →
 * "no reason reaches visitors" (and siteCritical's "none of the details").
 * Each entry path's `maintenance.enter` dropped in turn (AuditManager
 * refuse-boot, AddonsManager site-critical, DatabaseManager unavailable, the
 * admin toggle) turned its own manager's test red.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MaintenanceState,
  ADMIN_SWITCH_REASON,
  LEGACY_MESSAGE_KEY,
  MAINTENANCE_MESSAGE_KEY,
  MAINTENANCE_DURATION_KEY,
  MAINTENANCE_ALLOW_ADMINS_KEY,
  MAINTENANCE_ENABLED_KEY
} from '../maintenanceState';
import { initialisationGate } from '../startupState';

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const VIEW = path.join(__dirname_, '../../../views/maintenance.ejs');

const SHIPPED_MESSAGE = 'System is currently under maintenance. Please try again later.';
const SECRET_REASON = 'Audit provider DatabaseAuditProvider could not be used: SQLITE_CANTOPEN /data/audit.db';

/**
 * A stand-in ConfigurationManager: `shipped` is the default layer, `custom`
 * the site's own file, which is all `getCustomProperty` sees.
 */
function config(custom: Record<string, unknown> = {}, shipped: Record<string, unknown> = { [MAINTENANCE_MESSAGE_KEY]: SHIPPED_MESSAGE }) {
  const merged = { ...shipped, ...custom };
  return {
    getProperty: (key: string, fallback: unknown) => (key in merged ? merged[key] : fallback),
    getCustomProperty: (key: string) => (key in custom ? custom[key] : null)
  };
}

describe('#1906 the door: enter, leave, reasons', () => {
  test('open by default; enter closes, leave reopens', () => {
    const m = new MaintenanceState();
    expect(m.isOn()).toBe(false);
    expect(m.visitorView(config())).toBeNull();
    m.enter(SECRET_REASON);
    expect(m.isOn()).toBe(true);
    expect(m.reasons()).toEqual([SECRET_REASON]);
    expect(m.leave(SECRET_REASON)).toBe(true);
    expect(m.isOn()).toBe(false);
    expect(m.leave(SECRET_REASON)).toBe(false);
  });

  test('every reason is kept, in order, and each leaves on its own', () => {
    const m = new MaintenanceState();
    m.enter('first');
    m.enter('second');
    m.enter('first', { message: 'again' });
    expect(m.reasons()).toEqual(['first', 'second']);
    m.leave('first');
    expect(m.reasons()).toEqual(['second']);
    expect(m.isOn()).toBe(true);
  });

  test('no reason reaches visitors', () => {
    const m = new MaintenanceState();
    m.enter(SECRET_REASON);
    m.enter(ADMIN_SWITCH_REASON, { adminsMayEnter: true });
    const seen = JSON.stringify(m.visitorView(config()));
    expect(seen).not.toMatch(/Audit|SQLITE|audit\.db|administrator turned/);
    expect(m.visitorView(config())?.message).toBe(SHIPPED_MESSAGE);
  });
});

describe('#1906 the visitor message: manager > configuration > default', () => {
  test('a manager\'s own message wins over the configured one', () => {
    const m = new MaintenanceState();
    m.enter('database down', { message: 'Back at noon', estimatedDuration: 'an hour' });
    const view = m.visitorView(config({ [MAINTENANCE_MESSAGE_KEY]: 'Site message', [MAINTENANCE_DURATION_KEY]: 'a day' }));
    expect(view).toMatchObject({ message: 'Back at noon', estimatedDuration: 'an hour' });
  });

  test('without one, the message an administrator set — any text', () => {
    const m = new MaintenanceState();
    m.enter('database down');
    const view = m.visitorView(config({ [MAINTENANCE_MESSAGE_KEY]: 'Moving house — see you Monday', [MAINTENANCE_DURATION_KEY]: 'a day' }));
    expect(view).toMatchObject({ message: 'Moving house — see you Monday', estimatedDuration: 'a day' });
  });

  test('without either, the shipped message and no estimate', () => {
    const m = new MaintenanceState();
    m.enter('database down');
    expect(m.visitorView(config())).toMatchObject({ message: SHIPPED_MESSAGE, estimatedDuration: null });
    // No configuration at all still renders something.
    expect(m.visitorView(null)?.message).toBe(SHIPPED_MESSAGE);
  });

  test('a blank message or estimate from a manager counts as none', () => {
    const m = new MaintenanceState();
    m.enter('database down', { message: '  ', estimatedDuration: '' });
    expect(m.visitorView(config({ [MAINTENANCE_MESSAGE_KEY]: 'Site message' }))).toMatchObject({ message: 'Site message', estimatedDuration: null });
  });

  test('the first reason with a message of its own speaks', () => {
    const m = new MaintenanceState();
    m.enter('no message');
    m.enter('with message', { message: 'Second one' });
    expect(m.visitorView(config())?.message).toBe('Second one');
  });
});

describe('#1906 the retired #1883 key', () => {
  test('the retired key still speaks when the site set it and not the maintenance message', () => {
    const m = new MaintenanceState();
    m.enter('site-critical add-on down');
    expect(m.visitorView(config({ [LEGACY_MESSAGE_KEY]: "We're having temporary issues." }))?.message).toBe("We're having temporary issues.");
  });

  test('the site\'s message beats the legacy key', () => {
    const m = new MaintenanceState();
    m.enter('site-critical add-on down');
    expect(m.visitorView(config({ [LEGACY_MESSAGE_KEY]: 'Old wording', [MAINTENANCE_MESSAGE_KEY]: 'New wording' }))?.message).toBe('New wording');
  });

  test('a manager\'s message beats the legacy key', () => {
    const m = new MaintenanceState();
    m.enter('down', { message: 'Mine' });
    expect(m.visitorView(config({ [LEGACY_MESSAGE_KEY]: 'Old wording' }))?.message).toBe('Mine');
  });

  test('the shipped configuration no longer carries it', async () => {
    const { readFileSync } = await import('fs');
    const shipped = JSON.parse(readFileSync(path.join(__dirname_, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
    expect(LEGACY_MESSAGE_KEY in shipped).toBe(false);
    expect(shipped[MAINTENANCE_MESSAGE_KEY]).toBe(SHIPPED_MESSAGE);
  });
});

describe('#1906 who may enter', () => {
  test('the admin switch lets administrators use the whole site, as allow-admins says', () => {
    const m = new MaintenanceState();
    m.enter(ADMIN_SWITCH_REASON, { adminsMayEnter: true });
    expect(m.isClosedToAdmins()).toBe(false);
    expect(m.visitorView(config())?.adminsMayEnter).toBe(true);
    expect(m.visitorView(config({ [MAINTENANCE_ALLOW_ADMINS_KEY]: false }))?.adminsMayEnter).toBe(false);
  });

  test('a failure keeps administrators out of all but the repair screens', () => {
    const m = new MaintenanceState();
    m.enter(ADMIN_SWITCH_REASON, { adminsMayEnter: true });
    m.enter(SECRET_REASON);
    expect(m.isClosedToAdmins()).toBe(true);
    expect(m.visitorView(config())?.adminsMayEnter).toBe(false);
  });

  test('restoreSwitch enters the admin switch only when it was left on (#1147)', () => {
    const off = new MaintenanceState();
    off.restoreSwitch(config());
    expect(off.isOn()).toBe(false);
    const on = new MaintenanceState();
    on.restoreSwitch(config({ [MAINTENANCE_ENABLED_KEY]: 'true' }));
    expect(on.reasons()).toEqual([ADMIN_SWITCH_REASON]);
    expect(on.isClosedToAdmins()).toBe(false);
  });
});

describe('#1906 the initialisation gate reads the door per request', () => {
  test('a failure closes everything but /admin, /login and /logout, after boot too', () => {
    const m = new MaintenanceState();
    m.enter(SECRET_REASON);
    for (const p of ['/admin', '/admin/backup', '/login', '/logout', '/css/site.css']) expect(initialisationGate(true, m, p)).toBe('serve');
    for (const p of ['/', '/view/Main', '/api/pages', '/adminish']) expect(initialisationGate(true, m, p)).toBe('block');
  });

  test('leave() reopens the site without a restart', () => {
    const m = new MaintenanceState();
    m.enter(SECRET_REASON);
    expect(initialisationGate(true, m, '/view/Main')).toBe('block');
    m.leave(SECRET_REASON);
    expect(initialisationGate(true, m, '/view/Main')).toBe('serve');
  });

  test('the admin switch does not close this gate; the maintenance gate behind the session does', () => {
    const m = new MaintenanceState();
    m.enter(ADMIN_SWITCH_REASON, { adminsMayEnter: true });
    expect(initialisationGate(true, m, '/view/Main')).toBe('serve');
  });

  test('while starting, only assets are served', () => {
    expect(initialisationGate(false, new MaintenanceState(), '/admin')).toBe('block');
    expect(initialisationGate(false, null, '/css/site.css')).toBe('serve');
  });
});

describe('#1906 the page names the site (#1878)', () => {
  const render = (locals: Record<string, unknown>) => ejs.renderFile(VIEW, {
    message: SHIPPED_MESSAGE, estimatedDuration: null, notifications: [], allowAdmins: false, isAdmin: false, ...locals
  }, { async: true });

  test('the page names the site in its title and heading, never "ngdpbase"', async () => {
    const html = await render({ reason: 'misconfigured', siteName: 'The Fairways' });
    expect(html).toMatch(/<title>[^<]*The Fairways[^<]*<\/title>/);
    expect(html).toMatch(/<h1[^>]*>The Fairways<\/h1>/);
    expect(html).not.toMatch(/ngdpbase/i);
  });

  test('without a name it still renders a heading', async () => {
    const html = await render({ reason: 'starting' });
    expect(html).toMatch(/<h1[^>]*>System Maintenance<\/h1>/);
    expect(html).not.toMatch(/ngdpbase/i);
  });

  test('the name is escaped', async () => {
    const html = await render({ siteName: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
  });
});
