/**
 * The worked example in docs/access-policies.md must be copyable (#2426).
 *
 * Pasting its configuration into a fresh site's app-custom-config.json must
 * not stop the site. It once turned on auditing for `document-approve`, an
 * event nothing in the build emits, and AuditManager put the instance into
 * maintenance (503). This reads the example straight from the doc, merges it
 * over the shipped configuration the way a site's custom file merges, and
 * runs AuditManager's boot check on the result, so the text a reader copies
 * is the text under test.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';
import AuditManager from '../../managers/AuditManager';
import { MaintenanceState } from '../../utils/maintenanceState';
import type { WikiEngine } from '../../types/WikiEngine';

const root = path.join(__dirname, '../../..');
const shipped = JSON.parse(fs.readFileSync(path.join(root, 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;

/** The first json block under "Worked example: project documents", as the object it is the body of. */
function workedExampleConfig(): Record<string, unknown> {
  const doc = fs.readFileSync(path.join(root, 'docs', 'access-policies.md'), 'utf8');
  const afterHeading = doc.split('## Worked example: project documents')[1];
  expect(afterHeading).toBeDefined();
  const block = /```json\n([\s\S]*?)\n```/.exec(afterHeading);
  expect(block).not.toBeNull();
  return JSON.parse(`{${block[1]}}`) as Record<string, unknown>;
}

/** A site's custom file over the shipped one: a map merges per entry, anything else replaces. */
function mergedWithShipped(custom: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...shipped };
  for (const [key, value] of Object.entries(custom)) {
    const base = shipped[key];
    const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    merged[key] = isMap(base) && isMap(value) ? { ...base, ...value } : value;
  }
  return merged;
}

describe('docs/access-policies.md worked example boots on a fresh site (#2426)', () => {
  test('the example configuration, pasted into app-custom-config.json, leaves the site out of maintenance', async () => {
    const merged = mergedWithShipped(workedExampleConfig());
    const maintenance = new MaintenanceState();
    const configManager = {
      getProperty: (key: string, dv: unknown) => (key === 'ngdpbase.audit.provider' ? 'nullauditprovider' : merged[key] ?? dv),
      // No add-on is enabled on a fresh site: what is declared is the shipped file alone.
      getDeclaredProperty: (key: string, dv: unknown) => shipped[key] ?? dv,
      getResolvedDataPath: (_key: string, dv: string) => dv
    };
    const engine = {
      maintenance,
      getManager: (name: string) => (name === 'ConfigurationManager' ? configManager : null)
    } as unknown as WikiEngine;

    await new AuditManager(engine).initialize();

    expect(maintenance.reasons()).toEqual([]);
  });
});
