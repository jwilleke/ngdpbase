'use strict';

import UserLookupPlugin from '../UserLookupPlugin';
import { type MockInstance } from 'vitest';

const alice = { username: 'alice', displayName: 'Alice Smith', email: 'alice@example.com', roles: ['admin'],  lastLogin: '2026-04-18', isActive: true  };
const bob   = { username: 'bob',   displayName: 'Bob Jones',   email: 'bob@example.com',   roles: ['editor'], lastLogin: '2026-04-17', isActive: true  };
const dave  = { username: 'dave',  displayName: 'Dave Brown',  email: 'dave@corp.com',     roles: ['reader'], lastLogin: null,         isActive: false };

function makeContext(users: object[], username = 'admin') {
  return {
    pageName: 'TestPage',
    linkGraph: {},
    userContext: { username, isAuthenticated: true, roles: ['admin'] },
    engine: {
      getManager: vi.fn().mockReturnValue({
        searchUsers: vi.fn().mockResolvedValue(users)
      })
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
    expect(searchUsers).toHaveBeenCalledWith('alice', expect.any(Object));
  });

  test('resolves $currentUser token to logged-in username', async () => {
    const ctx = makeContext([alice], 'alice');
    await UserLookupPlugin.execute(ctx, { q: '$currentUser' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith('alice', expect.any(Object));
  });

  test('passes role filter to searchUsers', async () => {
    const ctx = makeContext([alice]);
    await UserLookupPlugin.execute(ctx, { role: 'admin' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ role: 'admin' }));
  });

  test('passes max as limit to searchUsers', async () => {
    const ctx = makeContext([alice]);
    await UserLookupPlugin.execute(ctx, { max: '5' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ limit: 5 }));
  });

  test('passes activeOnly=false when param set', async () => {
    const ctx = makeContext([alice, dave]);
    await UserLookupPlugin.execute(ctx, { activeOnly: 'false' });
    const searchUsers = (ctx.engine.getManager() as { searchUsers: MockInstance }).searchUsers;
    expect(searchUsers).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ activeOnly: false }));
  });

  test('escapes HTML in user values', async () => {
    const evil = { username: '<script>alert(1)</script>', displayName: 'XSS' };
    const html = await UserLookupPlugin.execute(makeContext([evil]), {});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('returns error message when UserManager unavailable', async () => {
    const ctx = { pageName: 'Test', linkGraph: {}, engine: { getManager: vi.fn().mockReturnValue(null) } };
    const html = await UserLookupPlugin.execute(ctx, {});
    expect(html).toContain('plugin-error');
    expect(html).toContain('UserManager not available');
  });
});
