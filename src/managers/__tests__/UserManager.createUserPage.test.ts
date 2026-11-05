/**
 * Unit tests for UserManager.createUserPage()
 *
 * Verifies that when a new user account is created, the profile page:
 * - Has the title "Profile: {displayName}"
 * - Has author-lock: true in its metadata
 * - Has system-category: "user-profile" (dedicated category for profile pages)
 * - Has description: "{displayName}'s profile page" (#661)
 * - Has badge: "Profile {displayName}" (#661)
 * - Has the page author set to the user's username
 * - Is saved via PageManager.savePage() by a system job, made for the new
 *   user (#1815, decision 3): the job's `page-create` comes from policy, and
 *   `createdFor` makes the new user its author, so author-lock leaves it to
 *   them rather than to the admin who created the account (#1462)
 * - Is skipped when the account has no active subject
 * - Returns false (gracefully) when required managers are unavailable
 * - Skips creation when the page already exists
 */

import UserManager from '../UserManager';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER = {
  username:    'jsmith',
  displayName: 'Jane Smith',
  email:       'jane@example.com',
  createdAt:   '2026-04-06T00:00:00.000Z',
  roles:       ['reader'],
  isActive:    true
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makePageManager({ pageAlreadyExists = false } = {}) {
  return {
    pageExists: vi.fn().mockReturnValue(pageAlreadyExists),
    savePage:   vi.fn().mockResolvedValue(undefined)
  };
}

function makeTemplateManager() {
  return {
    applyTemplate: vi.fn((templateName, vars) =>
      `# ${vars.pageName}\n\n## About Me\n\n*Stub content for ${vars.displayName}*`
    )
  };
}

function makeValidationManager() {
  return {
    generateValidMetadata: vi.fn((title, meta) => ({ title, ...meta }))
  };
}

function makeConfigManager() {
  return {
    getProperty: vi.fn((key, defaultValue) => {
      const config = {
        'ngdpbase.user.provider':         'fileuserprovider',
        'ngdpbase.user.provider.default': 'fileuserprovider',
        'ngdpbase.user.defaultPassword':  'admin',
        'ngdpbase.user.passwordSalt':     'test-salt',
        'ngdpbase.user.sessionExpiration': 3600000,
        'ngdpbase.user.defaultTimezone':  'UTC',
        'ngdpbase.directories.users':     './users'
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    })
  };
}

/** The new account's own subject, as PolicyInformationPoint resolves it. */
const OWNER_SUBJECT = { username: 'jsmith', roles: ['reader'], isAuthenticated: true };

function makePolicyInformationPoint({ subject = OWNER_SUBJECT } = {}) {
  return { subjectFor: vi.fn().mockResolvedValue(subject) };
}

function makeEngine({ pageManager = undefined, templateManager = undefined, validationManager = undefined, configManager = undefined, policyInformationPoint = undefined }: {
  pageManager?: ReturnType<typeof makePageManager>;
  templateManager?: ReturnType<typeof makeTemplateManager>;
  validationManager?: ReturnType<typeof makeValidationManager>;
  configManager?: ReturnType<typeof makeConfigManager>;
  policyInformationPoint?: ReturnType<typeof makePolicyInformationPoint>;
} = {}) {
  const pm = pageManager       ?? makePageManager();
  const tm = templateManager   ?? makeTemplateManager();
  const vm = validationManager ?? makeValidationManager();
  const cm = configManager     ?? makeConfigManager();
  const pip = policyInformationPoint ?? makePolicyInformationPoint();

  return {
    getManager: vi.fn((name) => {
      switch (name) {
      case 'PageManager':          return pm;
      case 'TemplateManager':      return tm;
      case 'ValidationManager':    return vm;
      case 'ConfigurationManager': return cm;
      case 'PolicyInformationPoint': return pip;
      default:                     return null;
      }
    }),
    getConfig: vi.fn(() => ({ get: vi.fn() }))
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const ADMIN_CTX = { username: 'root', roles: ['admin'], isAuthenticated: true };

describe('UserManager.createUserPage()', () => {
  let userManager;
  let pageManager;
  let templateManager;
  let validationManager;

  beforeEach(async () => {
    pageManager       = makePageManager();
    templateManager   = makeTemplateManager();
    validationManager = makeValidationManager();

    const engine = makeEngine({ pageManager, templateManager, validationManager });
    userManager  = new UserManager(engine);
    await userManager.initialize();
  });

  afterEach(async () => {
    if (userManager?.initialized) await userManager.shutdown();
    vi.clearAllMocks();
  });

  test('page is saved with title "Profile: {displayName}"', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    expect(pageManager.savePage).toHaveBeenCalledWith(
      'Profile: Jane Smith',
      expect.any(String),
      expect.any(Object),
      // #1815: a system job writes it, through the door.
      expect.objectContaining({ username: 'system', origin: 'boot' }),
      // #1037: the profile page is generated from a template by the system,
      // not typed by a user, so it bypasses save-time content validation.
      // #1815: made for the new user, who is its author.
      { skipValidation: true, createdFor: 'jsmith' }
    );
  });

  test('metadata includes author-lock: true', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    const savedMetadata = pageManager.savePage.mock.calls[0][2];
    expect(savedMetadata['author-lock']).toBe(true);
  });

  test('metadata includes system-category: "user-profile"', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    const savedMetadata = pageManager.savePage.mock.calls[0][2];
    expect(savedMetadata['system-category']).toBe('user-profile');
  });

  test('metadata includes description with displayName (#661)', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    const savedMetadata = pageManager.savePage.mock.calls[0][2];
    expect(savedMetadata.description).toBe("Jane Smith's profile page");
  });

  test('metadata includes badge "Profile {displayName}" (#661)', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    const savedMetadata = pageManager.savePage.mock.calls[0][2];
    expect(savedMetadata.badge).toBe('Profile Jane Smith');
  });

  test('metadata author is set to user.username (not displayName)', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    const savedMetadata = pageManager.savePage.mock.calls[0][2];
    expect(savedMetadata.author).toBe('jsmith');
  });

  test('generateValidMetadata is called with the Profile title', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    expect(validationManager.generateValidMetadata).toHaveBeenCalledWith(
      'Profile: Jane Smith',
      expect.objectContaining({ 'author-lock': true })
    );
  });

  test('applyTemplate is called with pageName equal to the profile title', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    expect(templateManager.applyTemplate).toHaveBeenCalledWith(
      'user-page',
      expect.objectContaining({ pageName: 'Profile: Jane Smith' })
    );
  });

  test('returns true on success', async () => {
    const result = await userManager.createUserPage(TEST_USER, ADMIN_CTX);
    expect(result).toBe(true);
  });

  test('skips page creation and returns true when page already exists', async () => {
    const pm    = makePageManager({ pageAlreadyExists: true });
    const eng   = makeEngine({ pageManager: pm });
    const mgr   = new UserManager(eng);
    await mgr.initialize();

    const result = await mgr.createUserPage(TEST_USER);

    expect(result).toBe(true);
    expect(pm.savePage).not.toHaveBeenCalled();

    await mgr.shutdown();
  });

  test('returns false when PageManager is unavailable', async () => {
    const eng = makeEngine({ pageManager: null });
    // override PageManager to return null
    eng.getManager = vi.fn((name) => {
      if (name === 'ConfigurationManager') return makeConfigManager();
      return null;
    });
    const mgr = new UserManager(eng);
    await mgr.initialize();

    const result = await mgr.createUserPage(TEST_USER);

    expect(result).toBe(false);

    await mgr.shutdown();
  });

  test('returns false when TemplateManager is unavailable', async () => {
    const pm  = makePageManager();
    const eng = makeEngine({ pageManager: pm });
    eng.getManager = vi.fn((name) => {
      if (name === 'ConfigurationManager') return makeConfigManager();
      if (name === 'PageManager')          return pm;
      return null;  // TemplateManager → null
    });
    const mgr = new UserManager(eng);
    await mgr.initialize();

    const result = await mgr.createUserPage(TEST_USER);

    expect(result).toBe(false);

    await mgr.shutdown();
  });

  test('user-keywords include slugified display name', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    const savedMetadata = pageManager.savePage.mock.calls[0][2];
    expect(savedMetadata['user-keywords']).toContain('jane-smith');
    expect(savedMetadata['user-keywords']).toContain('user-page');
  });

  test('the page is authored by its owner, not by the admin who created the account (#1462)', async () => {
    await userManager.createUserPage(TEST_USER, ADMIN_CTX);

    const [, , metadata, ctx, options] = pageManager.savePage.mock.calls[0];
    expect(metadata.author).toBe('jsmith');
    expect(options.createdFor).toBe('jsmith');
    // #1815: neither the admin nor the new account writes it — the new account holds no page-create.
    expect(ctx).not.toEqual(ADMIN_CTX);
    expect(ctx).not.toEqual(OWNER_SUBJECT);
  });

  test('no active subject for the account: nothing is written', async () => {
    const engine = makeEngine({
      pageManager,
      templateManager,
      validationManager,
      policyInformationPoint: makePolicyInformationPoint({ subject: null })
    });
    const manager = new UserManager(engine);
    await manager.initialize();

    await expect(manager.createUserPage(TEST_USER, ADMIN_CTX)).resolves.toBe(false);
    expect(pageManager.savePage).not.toHaveBeenCalled();
    await manager.shutdown();
  });
});
