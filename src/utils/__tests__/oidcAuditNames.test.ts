/**
 * #1575 — ngdpbase's OpenID Connect audit names are the package's names, and
 * stay so: a rename or a new event in oidc-auth-server fails here, not in
 * production as an undeclared name. Each is declared on-failure continue,
 * because the package reports after the action has happened.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_EVENT_NAMES } from '@jwilleke/oidc-auth-server';
import { AUDIT_EVENT } from '../auditEventNames';
import { auditDeclarationsFrom } from '../auditRegistry';

const shipped = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
// #1638: declared on permission entries (grantable: false), read through the one reader.
const events = auditDeclarationsFrom((key, d) => shipped[key] ?? d) as Record<string, { 'on-failure': string }>;
const ours = Object.values(AUDIT_EVENT).filter((n) => n.startsWith('oidc')).sort();

describe('OIDC audit names (#1575)', () => {
  test('are exactly the package\'s AUDIT_EVENT_NAMES', () => {
    expect(ours).toEqual([...AUDIT_EVENT_NAMES].sort());
  });

  test('are declared, each on-failure continue', () => {
    for (const name of ours) {
      expect(events[name], name).toBeDefined();
      expect(events[name]['on-failure'], name).toBe('continue');
    }
  });
});
