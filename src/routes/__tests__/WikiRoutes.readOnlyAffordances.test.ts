/**
 * Read-only admin affordances (#1034).
 *
 * #1029 made the admin dashboard viewable without being usable. The
 * enforcement was right — every mutating route still requires `admin-system` —
 * but nothing told the user that, so a read-only account was offered all 23
 * POST forms across 11 admin views and discovered one at a time, in three
 * different visual styles, that none of them worked.
 *
 * `lockedUnless()` is the mechanism: a control declares the permission it
 * needs, and renders disabled with that permission named when the caller
 * lacks it. It is PRESENTATION ONLY — the server still refuses the request,
 * and these tests exist partly to stop anyone mistaking a disabled button for
 * the control.
 *
 * Messages name the permission, never a role. Roles are bundles; the same
 * permission can arrive through any number of them, so "Admin role required"
 * is wrong the moment a custom role grants it.
 */

import WikiRoutes from '../WikiRoutes';

function makeRoutes(granted: string[]) {
  const managers: Record<string, unknown> = {
    UserManager: {
      hasPermission: vi.fn((_u: string, p: string) => Promise.resolve(granted.includes(p))),
      getContactRecipient: vi.fn(() => Promise.resolve(null)),
      // Reached only on the anonymous path, where WikiRoutes falls back to
      // asking UserManager who the caller is.
      getCurrentUser: vi.fn(() => null)
    },
    PageManager: { getAllPages: vi.fn(() => Promise.resolve([])) },
    ConfigurationManager: {
      getProperty: vi.fn((_k: string, d: unknown) => d),
      getCustomProperty: vi.fn(() => null)
    }
  };
  const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
  return new WikiRoutes(engine);
}

const req = (authenticated = true) => ({
  params: {},
  query: {},
  body: {},
  session: { csrfToken: 'tok' },
  path: '/admin',
  originalUrl: '/admin',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: authenticated
    ? { username: 'admindemo', isAuthenticated: true, roles: ['demo-admin'] }
    : null
});

async function templateData(granted: string[], authenticated = true) {
  return (await makeRoutes(granted).getCommonTemplateData(req(authenticated))) as unknown as {
    can: (p: string) => boolean;
    lockedUnless: (p: string) => string;
    canViewAdmin: boolean;
  };
}

describe('can() reflects the caller’s permissions (#1034)', () => {
  test('true for a held permission, false for one that is not', async () => {
    const data = await templateData(['admin-read', 'user-read']);

    expect(data.can('user-read')).toBe(true);
    expect(data.can('admin-system')).toBe(false);
  });

  test('an anonymous caller holds nothing', async () => {
    const data = await templateData(['admin-system'], false);

    expect(data.can('admin-system')).toBe(false);
    expect(data.canViewAdmin).toBe(false);
  });
});

describe('lockedUnless() disables and explains (#1034)', () => {
  test('emits nothing when the permission is held, so the control works normally', async () => {
    const data = await templateData(['admin-system']);

    expect(data.lockedUnless('admin-system')).toBe('');
  });

  test('disables the control and names the PERMISSION, not a role', async () => {
    const data = await templateData(['admin-read']);
    const attrs = data.lockedUnless('admin-system');

    expect(attrs).toContain('disabled');
    expect(attrs).toContain('admin-system');
    expect(attrs).toMatch(/read-only/i);
    // "Admin role required" was the old message and was wrong: it sends an
    // operator looking for a role name instead of granting the permission.
    expect(attrs).not.toMatch(/role/i);
  });

  test('marks the control up for assistive tech too', async () => {
    const data = await templateData([]);

    expect(data.lockedUnless('admin-system')).toContain('aria-disabled="true"');
  });

  test('is presentation only — it never reports the caller as permitted', async () => {
    // The guard against someone reading a disabled button as enforcement.
    const data = await templateData([]);

    expect(data.can('admin-system')).toBe(false);
    expect(data.lockedUnless('admin-system')).not.toBe('');
  });
});

describe('the read-only demo role, end to end (#1034)', () => {
  test('demo-admin may view the dashboard but no control on it', async () => {
    const data = await templateData(['admin-read']);

    expect(data.canViewAdmin).toBe(true);
    for (const permission of ['admin-system', 'admin-roles', 'user-read', 'user-create']) {
      expect(data.can(permission)).toBe(false);
      expect(data.lockedUnless(permission)).toContain('disabled');
    }
  });

  test('a full admin sees no disabled controls at all', async () => {
    const data = await templateData([
      'admin-read', 'admin-system', 'admin-roles', 'user-read', 'user-edit', 'user-create'
    ]);

    for (const permission of ['admin-system', 'admin-roles', 'user-read', 'user-create']) {
      expect(data.lockedUnless(permission)).toBe('');
    }
  });
});
