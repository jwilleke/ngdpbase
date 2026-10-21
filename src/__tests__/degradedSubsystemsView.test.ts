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
    expect(section?.textContent).toContain('ngdpbase.metrics.enabled');
  });

  test('both at once: each entry in its own section', async () => {
    const doc = await render([down], [reminder]);
    expect(doc.querySelector('#subsystems-down')?.textContent).toContain('MetricsManager');
    expect(doc.querySelector('#subsystems-down')?.textContent).not.toContain('BackupManager');
    expect(doc.querySelector('#subsystems-attention')?.textContent).toContain('BackupManager');
    expect(doc.querySelector('#subsystems-attention')?.textContent).not.toContain('MetricsManager');
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
