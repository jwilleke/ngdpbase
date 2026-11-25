/**
 * #1638 slice 3 — records in the permission catalog are never permissions anyone holds.
 *
 * Every audit event is declared on a permission entry; the ones that record
 * something rather than authorize it carry `grantable: false`. These pin the
 * predicate, and that the shipped catalog and policies keep the promise.
 */
import fs from 'fs';
import path from 'path';
import { readOnlyPermissionNames, isGrantable, grantablePermissionNames, grantablePermissions, withRetiredExpanded, RETIRED_PERMISSIONS, permissionLabel, describeScopes } from '../permissionCatalog';
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

// #2521 (slice 2 of #2247): `share-manage-all` is what lets an administrator see
// and revoke other people's shared links. It ships as its own policy id, so a
// site holding a stored copy of `admin-full-access` still gets it.
describe('#2521 share-manage-all', () => {
  const policies = shipped['ngdpbase.access.policies'] as Array<{ id: string; effect?: string; subjects?: Array<{ type: string; value: string }>; actions?: string[] }>;
  const granting = policies.filter((p) => (p.actions ?? []).includes('share-manage-all'));

  test('is a catalog entry in plain words, with no step-up and no audit event of its own', () => {
    const entry = catalog['share-manage-all'] as { grantable?: boolean; label?: string; description?: string; audit?: unknown; 'step-up'?: unknown };
    expect(entry).toBeDefined();
    expect(isGrantable(entry)).toBe(true);
    expect(entry.label).toBe('See and revoke everyone\'s shared links');
    expect(String(entry.description).length).toBeGreaterThan(20);
    expect(entry['step-up']).toBeUndefined();
    expect(entry.audit).toBeUndefined();
  });

  test('exactly one shipped policy grants it, a new id for the administrator role, never an edit to admin-full-access', () => {
    expect(granting.map((p) => p.id)).toEqual(['admin-share-manage-all']);
    expect(granting[0].effect).toBe('allow');
    expect(granting[0].subjects).toEqual([{ type: 'role', value: 'admin' }]);
    expect(granting[0].actions).toEqual(['share-manage-all']);
  });

  test('the Roles and Permissions page lists it under the administrator role and under no other', async () => {
    const { default: PolicyDecisionPoint } = await import('../../security/PolicyDecisionPoint');
    const engine = {
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.access.policies' ? policies : k === 'ngdpbase.access.policies.enabled' ? true : d) }
        : null)
    };
    const held = [...new PolicyDecisionPoint(engine).rolePermissions().entries()]
      .filter(([, names]) => names.has('share-manage-all'))
      .map(([role]) => role);
    expect(held).toEqual(['admin']);
  });

  test('share-revoke stays grantable and in the policies that grant it today (Q-G: a token or proxy keeps its ceiling)', () => {
    expect(isGrantable(catalog['share-revoke'])).toBe(true);
    const grantingRevoke = policies.filter((p) => (p.actions ?? []).includes('share-revoke')).map((p) => p.id);
    expect(grantingRevoke).toEqual(['admin-full-access', 'editor-permissions', 'vault-owner-permissions']);
  });

  test('the revoke reuses the share-revoke event: no second share event is declared', () => {
    const events = Object.entries(catalog).filter(([n, e]) => e.audit && /^share-/.test(n)).map(([n]) => n).sort();
    expect(events).toEqual(['share-access', 'share-create', 'share-extend', 'share-revoke']);
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

describe('#1764 every permission has plain words', () => {
  const addonCatalogs = fs.readdirSync(path.join(process.cwd(), 'addons'))
    .map((slug) => path.join(process.cwd(), 'addons', slug, 'config', 'default-config.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => [file, (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>)['ngdpbase.permissions.definitions'] ?? {}] as const);

  test.each([['core', catalog] as const, ...addonCatalogs])('%s: each grantable permission declares a label; no record does', (_where, defs) => {
    for (const [name, entry] of Object.entries(defs as Record<string, { grantable?: boolean; label?: unknown }>)) {
      if (entry.grantable === false) expect(entry.label, name).toBeUndefined();
      // A person reads the label: no issue numbers, no configuration keys.
      else expect(String(entry.label), name).toMatch(/^[A-Z][^#]*[^.]$/);
      if (entry.grantable !== false) expect(String(entry.label), name).not.toMatch(/ngdpbase\./);
    }
  });

  test('permissionLabel: the label, else the description, else nothing', () => {
    expect(permissionLabel({ label: 'Read pages', description: 'dev' })).toBe('Read pages');
    expect(permissionLabel({ description: 'Manage it' })).toBe('Manage it');
    expect(permissionLabel({ label: '  ' })).toBeNull();
    expect(permissionLabel(undefined)).toBeNull();
  });

  test('describeScopes: sign-in scopes, catalog permissions, anything else by name, no repeats', () => {
    expect(describeScopes(['openid', 'page-read', 'patient/*.read', 'openid', 'toString'], catalog)).toEqual([
      { name: 'openid', description: 'Confirm who you are (your username)' },
      { name: 'page-read', description: 'View pages' },
      { name: 'patient/*.read', description: 'patient/*.read' },
      { name: 'toString', description: 'toString' }
    ]);
    expect(describeScopes(['page-read'], null)).toEqual([{ name: 'page-read', description: 'page-read' }]);
  });
});

describe('readOnlyPermissionNames', () => {
  test('names the entries marked read-only: true, and nothing else', () => {
    expect(readOnlyPermissionNames({ a: { 'read-only': true }, b: { 'read-only': false }, c: {}, d: { 'read-only': 'yes' }, e: null, f: { 'read-only': true, grantable: false } })).toEqual(['a', 'f']);
  });

  test('anything that is not a catalog reads as empty', () => {
    for (const value of [undefined, null, 'x', 3, [], [{ 'read-only': true }]]) expect(readOnlyPermissionNames(value)).toEqual([]);
  });

  test('the wildcard is never read-only, whoever marks it', () => {
    expect(readOnlyPermissionNames({ '*': { 'read-only': true }, a: { 'read-only': true } })).toEqual(['a']);
  });
});
