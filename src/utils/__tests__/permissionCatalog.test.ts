/**
 * #1638 slice 3 — records in the permission catalog are never permissions anyone holds.
 *
 * Every audit event is declared on a permission entry; the ones that record
 * something rather than authorize it carry `grantable: false`. These pin the
 * predicate, and that the shipped catalog and policies keep the promise.
 */
import fs from 'fs';
import path from 'path';
import { isGrantable, grantablePermissionNames, grantablePermissions, withRetiredExpanded, RETIRED_PERMISSIONS } from '../permissionCatalog';
import { delegablePermissions } from '../../managers/OidcManager';

const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
const catalog = shipped['ngdpbase.permissions.definitions'] as Record<string, { grantable?: boolean; audit?: unknown }>;
const records = Object.keys(catalog).filter((n) => catalog[n].grantable === false);

describe('#1638 isGrantable', () => {
  test('omitted means grantable; only an explicit false is a record', () => {
    expect(isGrantable({ description: 'x' })).toBe(true);
    expect(isGrantable({ grantable: true })).toBe(true);
    expect(isGrantable({ grantable: false })).toBe(false);
    expect(isGrantable(null)).toBe(true);
  });

  test('the name and map forms keep catalog order and drop records', () => {
    const defs = { a: {}, b: { grantable: false }, c: { grantable: true } };
    expect(grantablePermissionNames(defs)).toEqual(['a', 'c']);
    expect(Object.keys(grantablePermissions(defs))).toEqual(['a', 'c']);
    expect(grantablePermissionNames(null)).toEqual([]);
  });
});

describe('#1638 the shipped catalog keeps the promise', () => {
  test('the shipped events map is empty: every event is on a permission entry', () => {
    expect(shipped['ngdpbase.audit.events']).toEqual({});
    expect(records).toEqual(expect.arrayContaining(['system-start', 'authentication-failed', 'job-failed']));
  });

  test('every record carries an audit block — that is the only reason it is there', () => {
    for (const name of records) expect(catalog[name].audit, name).toBeTruthy();
  });

  test('no record is offered to an app as a scope', () => {
    const scopes = delegablePermissions(catalog);
    for (const name of records) expect(scopes).not.toContain(name);
    expect(scopes).toContain('page-read');
  });

  test('no shipped access policy grants a record', () => {
    const policies = shipped['ngdpbase.access.policies'] as Array<{ id: string; actions?: string[] }>;
    for (const policy of policies) {
      const granted = (policy.actions ?? []).filter((a) => records.includes(a));
      expect(granted, policy.id).toEqual([]);
    }
  });
});

describe('#1638 a split permission still grants what it stood for', () => {
  test('share-manage reads as share-create, share-extend and share-revoke', () => {
    expect(withRetiredExpanded(['page-read', 'share-manage', 'share-create'])).toEqual(['page-read', 'share-create', 'share-extend', 'share-revoke']);
    expect(withRetiredExpanded(['page-read'])).toEqual(['page-read']);
  });

  test('the shipped catalog no longer declares share-manage, and declares what replaced it', () => {
    expect(catalog['share-manage']).toBeUndefined();
    for (const n of RETIRED_PERMISSIONS.get('share-manage') ?? []) expect(isGrantable(catalog[n]), n).toBe(true);
  });

  test('a custom policy that still grants share-manage grants the three through the PDP', async () => {
    const { default: PolicyDecisionPoint } = await import('../../security/PolicyDecisionPoint');
    const policy = { id: 'old', name: 'old', priority: 10, effect: 'allow', subjects: [{ type: 'role', value: 'sharer' }], resources: [{ type: 'page', pattern: '*' }], actions: ['share-manage'] };
    const engine = {
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.access.policies' ? [policy] : k === 'ngdpbase.access.policies.enabled' ? true : d) }
        : null)
    };
    const pdp = new PolicyDecisionPoint(engine);
    expect([...(pdp.rolePermissions().get('sharer') ?? [])].sort()).toEqual(['share-create', 'share-extend', 'share-revoke']);
  });
});
