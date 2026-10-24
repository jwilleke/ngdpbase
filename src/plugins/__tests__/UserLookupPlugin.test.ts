'use strict';

import UserLookupPluginModule from '../UserLookupPlugin';
import { asExecuted } from '../../test-support/plugins';
import { type MockInstance } from 'vitest';
import { ContactRefusedError } from '../../utils/contactAccess';

const UserLookupPlugin = asExecuted(UserLookupPluginModule);

const alice = { username: 'alice', displayName: 'Alice Smith', email: 'alice@example.com', roles: ['admin'],  lastLogin: '2026-04-18', isActive: true  };
const bob   = { username: 'bob',   displayName: 'Bob Jones',   email: 'bob@example.com',   roles: ['editor'], lastLogin: '2026-04-17', isActive: true  };
const dave  = { username: 'dave',  displayName: 'Dave Brown',  email: 'dave@corp.com',     roles: ['reader'], lastLogin: null,         isActive: false };

/**
 * The viewer, and a decision point that grants `user-read` to the roles named
 * in `readers` (#2033: full fields only with user-read). The admin viewer
 * holds it, so the column tests below see every field.
 */
function makeContext(users: object[], username = 'admin', roles: string[] = ['admin'], readers: string[] = ['admin']) {
  const userManager = { searchUsers: vi.fn().mockResolvedValue(users) };
  const pdp = {
    permits: vi.fn(async (subject: { roles?: string[] }, action: string) =>
      action === 'user-read' && (subject?.roles ?? []).some((r) => readers.includes(r)))
  };
  return {
    pageName: 'TestPage',
    linkGraph: {},
    userContext: { username, isAuthenticated: true, roles },
    pdp,
    engine: {
      getManager: vi.fn((name?: string) => (name === 'PolicyDecisionPoint' ? pdp : userManager))
    }
  };
}

describe('UserLookupPlugin', () => {
  test('renders a table with default columns when fields omitted', async () => {
    const html = await UserLookupPlugin.execute(makeContext([alice, bob]), {});
    expect(html).toContain('<table');
    expect(html).toContain('Username');
    expect(html).toContain('Display Name');
    expect(html).toContain('alice');
    expect(html).toContain('Alice Smith');
  });

  test('fields=all includes all returned fields', async () => {
    const html = await UserLookupPlugin.execute(makeContext([alice]), { fields: 'all' });
    expect(html).toContain('Email');
    expect(html).toContain('Roles');
    expect(html).toContain('Last Login');
    expect(html).toContain('Active');
  });

  test('explicit fields list shows only those columns', async () => {
    const html = await UserLookupPlugin.execute(makeContext([alice]), { fields: 'username,email' });
    expect(html).toContain('Username');
    expect(html).toContain('Email');
    expect(html).not.toContain('Display Name');
    expect(html).not.toContain('Roles');
  });

  test('renders roles array as comma-separated string', async () => {
    const multi = { ...alice, roles: ['admin', 'editor'] };
    const html = await UserLookupPlugin.execute(makeContext([multi]), { fields: 'all' });
    expect(html).toContain('admin, editor');
  });

  test('renders boolean isActive as ✓ / ✗', async () => {
    const html = await UserLookupPlugin.execute(makeContext([alice, dave]), { fields: 'username,isActive' });
    expect(html).toContain('✓');
    expect(html).toContain('✗');
  });

  test('returns empty message when no users found', async () => {
    const html = await UserLookupPlugin.execute(makeContext([]), {});
    expect(html).toContain('No users found');
    expect(html).not.toContain('<table');
  });

  test('passes q param to searchUsers', async () => {
    const ctx = makeContext([alice]);
    await UserLookupPlugin.execute(ctx, { q: 'alice' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith('alice', expect.any(Object), expect.anything());
  });

  test('resolves $currentUser token to logged-in username', async () => {
    const ctx = makeContext([alice], 'alice');
    await UserLookupPlugin.execute(ctx, { q: '$currentUser' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith('alice', expect.any(Object), expect.anything());
  });

  test('passes role filter to searchUsers', async () => {
    const ctx = makeContext([alice]);
    await UserLookupPlugin.execute(ctx, { role: 'admin' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ role: 'admin' }), expect.anything());
  });

  test('passes max as limit to searchUsers', async () => {
    const ctx = makeContext([alice]);
    await UserLookupPlugin.execute(ctx, { max: '5' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ limit: 5 }), expect.anything());
  });

  test('passes activeOnly=false when param set', async () => {
    const ctx = makeContext([alice, dave]);
    await UserLookupPlugin.execute(ctx, { activeOnly: 'false' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ activeOnly: false }), expect.anything());
  });

  test('escapes HTML in user values', async () => {
    const evil = { username: '<script>alert(1)</script>', displayName: 'XSS' };
    const html = await UserLookupPlugin.execute(makeContext([evil]), {});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('searches under the viewer\'s own context (#2018)', async () => {
    const ctx = makeContext([alice]);
    await UserLookupPlugin.execute(ctx, { q: 'alice' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith('alice', expect.any(Object), ctx.userContext);
  });

  test('a viewer refused search-user (anonymous) sees nothing', async () => {
    const anonymous = { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false };
    const ctx = {
      pageName: 'TestPage', linkGraph: {}, userContext: anonymous,
      engine: { getManager: vi.fn().mockReturnValue({ searchUsers: vi.fn().mockRejectedValue(new ContactRefusedError('search-user', { permit: false, applicable: true, reason: 'no_policy' })) }) }
    };
    expect(await UserLookupPlugin.execute(ctx, {})).toBe('');
  });

  test('without user-read (a vault-owner-only viewer), fields=all shows only username and display name (#2033)', async () => {
    const ctx = makeContext([alice, bob], 'olive', ['vault-owner']);
    const html = await UserLookupPlugin.execute(ctx, { fields: 'all' });
    expect(html).toContain('alice');
    expect(html).toContain('Alice Smith');
    for (const hidden of ['alice@example.com', 'Email', 'Roles', 'Last Login', 'Active', '2026-04-18']) expect(html).not.toContain(hidden);
    // Asked of the decision point, with the viewer's own context.
    expect(ctx.pdp.permits).toHaveBeenCalledWith(ctx.userContext, 'user-read');
  });

  test('without user-read, an explicit fields list is cut to username and display name (#2033)', async () => {
    const html = await UserLookupPlugin.execute(makeContext([alice], 'olive', ['vault-owner']), { fields: 'email,roles' });
    expect(html).not.toContain('alice@example.com');
    expect(html).not.toContain('Roles');
    expect(html).toContain('alice');
  });

  test('a user-read holder sees the email they asked for (#2033)', async () => {
    const html = await UserLookupPlugin.execute(makeContext([alice], 'ua', ['user-admin'], ['user-admin']), { fields: 'username,email' });
    expect(html).toContain('alice@example.com');
  });

  test('no decision point: the restricted view, never the full one (#2033)', async () => {
    const userManager = { searchUsers: vi.fn().mockResolvedValue([alice]) };
    const ctx = { pageName: 'T', linkGraph: {}, userContext: { username: 'admin', isAuthenticated: true, roles: ['admin'] }, engine: { getManager: vi.fn((name?: string) => (name === 'PolicyDecisionPoint' ? null : userManager)) } };
    const html = await UserLookupPlugin.execute(ctx, { fields: 'all' });
    expect(html).not.toContain('alice@example.com');
  });

  test('never a password hash or credential, even for a user-read holder with fields=all', async () => {
    const leaky = { ...alice, password: 'hashed:secret', credentials: [{ id: 'pk' }], passkeys: ['pk'] };
    const html = await UserLookupPlugin.execute(makeContext([leaky]), { fields: 'all' });
    expect(html).not.toContain('hashed:secret');
    expect(html).not.toMatch(/password|credential|passkey/i);
  });

  test('returns error message when UserManager unavailable', async () => {
    const ctx = { pageName: 'Test', linkGraph: {}, engine: { getManager: vi.fn().mockReturnValue(null) } };
    const html = await UserLookupPlugin.execute(ctx, {});
    expect(html).toContain('plugin-error');
    expect(html).toContain('UserManager not available');
  });
});
