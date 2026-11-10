/**
 * #1946 — the dashboard told the operator that features were "silently doing
 * nothing" when what it listed was a reminder, such as "Save the backup key off
 * this server", while backups ran. Down and "works, but needs an admin" are now
 * declared by the manager (`markDegraded` / `markNeedsAttention`), carried by
 * the engine as `kind`, and drawn as two sections with their own headlines.
 *
 * Renders the real partial, as Express does: the defect was the view choosing
 * one headline for both.
 */
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import Engine from '../core/Engine';
import BaseManager from '../managers/BaseManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

async function render(degradedManagers: unknown[], attentionManagers: unknown[]): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, '_degraded-subsystems.ejs'), { degradedManagers, attentionManagers });
  return new JSDOM(html).window.document;
}

const down = { manager: 'MetricsManager', state: 'degraded', kind: 'outage', reason: 'Metrics were configured but could not start', configKey: 'ngdpbase.metrics.enabled' };
const reminder = { manager: 'BackupManager', state: 'degraded', kind: 'attention', reason: 'Save the backup key off this server (fingerprint abc)', configKey: 'ngdpbase.backup.key-saved-fingerprint' };

describe('#1946 the dashboard separates down from needs-attention', () => {
  test('a reminder lands under "Working, but needs your attention", never "silently doing nothing"', async () => {
    const doc = await render([], [reminder]);
    expect(doc.querySelector('#subsystems-down')).toBeNull();
    const section = doc.querySelector('#subsystems-attention');
    expect(section?.textContent).toContain('Working, but needs your attention');
    expect(section?.textContent).toContain('Save the backup key off this server');
    expect(section?.textContent).not.toContain('(degraded)');
    expect(doc.body.textContent).not.toMatch(/silently doing nothing|not working/);
  });

  test('an outage keeps the "silently doing nothing" headline, alone', async () => {
    const doc = await render([down], []);
    expect(doc.querySelector('#subsystems-attention')).toBeNull();
    const section = doc.querySelector('#subsystems-down');
    expect(section?.textContent).toMatch(/1 subsystem is not working/);
    expect(section?.textContent).toContain('silently doing nothing');
  });

  test('both at once: each entry in its own section', async () => {
    const doc = await render([down], [reminder]);
    expect(doc.querySelector('#subsystems-down')?.textContent).toContain('Metrics were configured');
    expect(doc.querySelector('#subsystems-down')?.textContent).not.toContain('Save the backup key');
    expect(doc.querySelector('#subsystems-attention')?.textContent).toContain('Save the backup key');
    expect(doc.querySelector('#subsystems-attention')?.textContent).not.toContain('Metrics were configured');
  });

  test('#2348 no item shows the manager name, the state word or the configuration key', async () => {
    const doc = await render([down], [reminder, { manager: 'PolicyEvaluator', state: 'degraded', kind: 'attention', reason: 'Access policies need review (1 problem): x.', configKey: 'ngdpbase.access.policies' }]);
    const text = doc.body.textContent ?? '';
    expect(text).not.toMatch(/MetricsManager|BackupManager|PolicyEvaluator|\(degraded\)|Configuration key/);
    expect(text).not.toContain('ngdpbase.');
    expect(doc.querySelector('code')).toBeNull();
  });

  test('#2348 each item leads with its plain feature name and carries the manager id as data; the class name is not shown', async () => {
    const doc = await render([], [{ ...reminder, feature: 'Backups', reason: 'No good backup since: never' }]);
    const li = doc.querySelector('#subsystems-attention li');
    expect(li?.getAttribute('data-manager')).toBe('BackupManager');
    expect(li?.querySelector('strong')?.textContent).toBe('Backups:');
    expect(li?.textContent).toContain('No good backup since: never');
    expect(doc.body.textContent).not.toContain('BackupManager');
  });

  test('#2348 the feature name is not repeated when the reason starts with it, and absent when unknown', async () => {
    const doc = await render([], [
      { manager: 'PolicyEvaluator', state: 'degraded', kind: 'attention', feature: 'Access policies', reason: 'Access policies need review (1 problem): x.' },
      { manager: 'Mystery', state: 'degraded', kind: 'attention', reason: 'Something to do' }
    ]);
    const [a, b] = [...doc.querySelectorAll('#subsystems-attention li')];
    expect(a.querySelector('strong')?.textContent).toBe('Access policies');
    expect(a.textContent?.trim()).toMatch(/^Access policies need review/);
    expect(a.textContent).not.toContain('Access policies:');
    expect(b.querySelector('strong')).toBeNull();
    expect(b.textContent).not.toContain('Mystery');
  });

  test('#2348 a setting gets a plain link to its own row in Admin → Configuration; an environment variable gets none', async () => {
    const doc = await render([], [{ ...reminder, fixUrl: undefined }, { manager: 'BackupManager', state: 'degraded', kind: 'attention', reason: 'The backup key is not set', configKey: 'NGDPBASE_BACKUP_KEY' }]);
    const links = [...doc.querySelectorAll('#subsystems-attention a')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/admin/configuration#config-ngdpbase.backup.key-saved-fingerprint');
    expect(links[0].textContent).toBe('Change this in Admin → Configuration');
  });

  test('#2354 when a caller names a fix and a setting, both links show', async () => {
    const doc = await render([], [{ ...reminder, fixUrl: '/admin/required-pages', fixLabel: 'Open Required Pages Sync' }]);
    const links = [...doc.querySelectorAll('#subsystems-attention a')];
    expect(links.map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['/admin/required-pages', 'Open Required Pages Sync'],
      ['/admin/configuration#config-ngdpbase.backup.key-saved-fingerprint', 'Change this in Admin → Configuration']
    ]);
  });

  test('#2354 when only a setting is named, only the Configuration link shows', async () => {
    const doc = await render([], [reminder]);
    const links = [...doc.querySelectorAll('#subsystems-attention a')];
    expect(links.map((a) => a.textContent)).toEqual(['Change this in Admin → Configuration']);
  });

  test('#2348 a caller that names its own fix gets that link and label', async () => {
    const doc = await render([], [{ ...reminder, configKey: undefined, fixUrl: '/admin/backup', fixLabel: 'Open Admin → Backup' }]);
    const links = [...doc.querySelectorAll('#subsystems-attention a')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/admin/backup');
    expect(links[0].textContent).toBe('Open Admin → Backup');
    expect(doc.body.textContent).not.toContain('Change this in Admin');
  });

  test('#2348 a fix link must be a path on this site: "//host" and "/\\host" are not drawn', async () => {
    for (const fixUrl of ['//evil.example/x', '/\\evil.example/x', 'https://evil.example/', 'admin/backup']) {
      const doc = await render([], [{ ...reminder, configKey: undefined, fixUrl }]);
      expect(doc.querySelectorAll('#subsystems-attention a')).toHaveLength(0);
    }
    const doc = await render([], [{ ...reminder, configKey: undefined, fixUrl: '/admin/backup', fixLabel: 'Open Admin → Backup' }]);
    expect(doc.querySelectorAll('#subsystems-attention a')).toHaveLength(1);
  });

  test('#2348 item text keeps the alert\'s own colour (no text-muted), and the link sits in its own block', async () => {
    const doc = await render([down], [{ ...reminder, fixUrl: '/admin/backup', fixLabel: 'Open Admin → Backup' }]);
    expect(doc.querySelector('.text-muted')).toBeNull();
    expect(doc.querySelector('br')).toBeNull();
    expect(doc.querySelector('#subsystems-attention li > div.mt-1 > a.alert-link')).not.toBeNull();
    expect(doc.querySelector('#subsystems-attention li')?.classList.contains('mb-2')).toBe(true);
  });

  test('#2348 every link takes the alert\'s own link colour, which passes contrast', async () => {
    const doc = await render([down], [reminder, { ...reminder, fixUrl: '/admin/backup', fixLabel: 'Open Admin → Backup' }]);
    const links = [...doc.querySelectorAll('a')];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.classList.contains('alert-link')).toBe(true);
  });

  test('#2348 details draw as a nested list, one problem per line, with the headline above', async () => {
    const doc = await render([], [{ manager: 'PolicyEvaluator', state: 'degraded', kind: 'attention', feature: 'Access policies', reason: 'Access policies need review (2 problems):', details: ['First problem.', 'Second <b>problem</b>.'] }]);
    const items = [...doc.querySelectorAll('#subsystems-attention li li')];
    expect(items.map((li) => li.textContent?.trim())).toEqual(['First problem.', 'Second <b>problem</b>.']);
    expect(doc.querySelector('#subsystems-attention li li b')).toBeNull();
    expect(doc.querySelector('#subsystems-attention li')?.textContent).toContain('Access policies need review (2 problems):');
  });

  test('#2348 an entry with no reason still draws a line', async () => {
    const doc = await render([], [{ manager: 'X', state: 'degraded', kind: 'attention' }]);
    expect(doc.querySelector('#subsystems-attention li')?.textContent).toContain('No details were recorded.');
  });

  test('nothing to report draws nothing', async () => {
    const doc = await render([], []);
    expect(doc.querySelector('.alert')).toBeNull();
  });

  test('reasons are escaped', async () => {
    const doc = await render([{ ...down, reason: '<img src=x onerror=alert(1)>' }], []);
    expect(doc.querySelector('img')).toBeNull();
  });

  test('the admin dashboard draws it through this partial, passing both lists', () => {
    const source = fs.readFileSync(path.join(VIEWS, 'admin-dashboard.ejs'), 'utf8');
    expect(source.match(/include\('_degraded-subsystems'/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/degradedManagers:/);
    expect(source).toMatch(/attentionManagers:/);
  });
});

class Probe extends BaseManager {
  down(reason: string): void { this.markDegraded(reason); }
  attention(reason: string): void { this.markNeedsAttention(reason); }
  fail(reason: string): void { this.markFailed(reason); }
  off(reason: string): void { this.markDisabled(reason); }
}

describe('#1946 Engine.getDegradedManagers carries each entry\'s kind', () => {
  test('outage, attention and failed are reported with their kind; disabled and ready are not', () => {
    const engine = new Engine();
    const stub = { getManager: () => null } as never;
    const make = (fn: (p: Probe) => void): Probe => { const p = new Probe(stub); fn(p); return p; };
    engine.registerManager('Down', make((p) => p.down('cannot write')));
    engine.registerManager('Reminder', make((p) => p.attention('save the key')));
    engine.registerManager('Failed', make((p) => p.fail('cannot start')));
    engine.registerManager('Off', make((p) => p.off('switched off')));
    engine.registerManager('Fine', make(() => undefined));
    const kinds = Object.fromEntries(engine.getDegradedManagers().map((m) => [m.manager, m.kind]));
    expect(kinds).toEqual({ Down: 'outage', Reminder: 'attention', Failed: 'outage' });
  });

  test('a degraded state with no declared kind (an older producer) is shown as down, never hidden as a reminder', () => {
    const engine = new Engine();
    engine.registerManager('Legacy', { getManagerStatus: () => ({ state: 'degraded', reason: 'x' }) });
    expect(engine.getDegradedManagers()).toEqual([{ manager: 'Legacy', state: 'degraded', reason: 'x', kind: 'outage' }]);
  });
});
