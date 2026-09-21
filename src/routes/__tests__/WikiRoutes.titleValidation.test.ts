/**
 * Unit tests for WikiRoutes — page title validation in savePage()
 *
 * savePage() rejects titles containing characters that break URL routing
 * or YAML parsing: / \ # ? % " < > | *
 * Apostrophes (') are allowed — e.g. "President's Surveillance Program"
 *
 * Covers:
 * - Each invalid character triggers a 400
 * - Clean titles are accepted
 * - Titles with apostrophes are accepted
 * - Empty/absent title is not rejected by the validator
 * - createPageFromTemplate also rejects invalid page names
 */

import WikiRoutes from '../WikiRoutes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePageManager(existingPage = null) {
  return {
    getPage:         vi.fn().mockResolvedValue(existingPage),
    getPageMetadata: vi.fn().mockResolvedValue(existingPage?.metadata ?? null),
    pageExists:      vi.fn().mockReturnValue(!!existingPage),
    savePage:        vi.fn().mockResolvedValue(undefined),
    getCurrentPageProvider: vi.fn().mockReturnValue({ pageIndex: { pages: {} } })
  };
}

function makeValidationManager() {
  return {
    generateValidMetadata: vi.fn((title, meta) => ({ title, ...meta })),
    getAvailableCategories: vi.fn().mockReturnValue([]),
    getAvailableRoles: vi.fn().mockReturnValue([])
  };
}

function makePolicyInformationPoint(allowed = true) {
  return {
    checkAccess: vi.fn().mockResolvedValue({ allowed, reason: 'ok' })
  };
}

function makeConfigManager() {
  return {
    getProperty: vi.fn((key, defaultValue) => {
      // Provide a valid system-category so savePage can get past category validation
      if (key === 'ngdpbase.system-category') {
        return { general: { enabled: true, label: 'general' } };
      }
      return defaultValue;
    })
  };
}

function makeEngine({ pageManager = undefined, validationManager = undefined, policyInformationPoint = undefined, configManager = undefined }: {
  pageManager?: ReturnType<typeof makePageManager>;
  validationManager?: ReturnType<typeof makeValidationManager>;
  policyInformationPoint?: ReturnType<typeof makePolicyInformationPoint>;
  configManager?: ReturnType<typeof makeConfigManager>;
} = {}) {
  const pm = pageManager      ?? makePageManager();
  const vm = validationManager ?? makeValidationManager();
  const acl = policyInformationPoint      ?? makePolicyInformationPoint(true);
  const cm = configManager    ?? makeConfigManager();

  return {
    getManager: vi.fn((name) => {
      switch (name) {
      case 'PageManager':          return pm;
      case 'ValidationManager':    return vm;
      case 'PolicyInformationPoint':           return acl;
      case 'ConfigurationManager': return cm;
      default:                     return null;
      }
    })
  };
}

function createSaveReq(title, params = { page: 'TestPage' }) {
  return {
    params,
    session:  {},
    path:     `/save/${params.page}`,
    userContext: { username: 'editor', roles: ['editor'], authenticated: true },
    headers:  {},
    query:    {},
    body: {
      title,
      content: '# Test\n\nContent.',
      categories: '',
      userKeywords: '',
      'system-category': 'general',
      'author-lock-present': '1'
    }
  };
}

function createRes() {
  return {
    status:   vi.fn().mockReturnThis(),
    json:     vi.fn().mockReturnThis(),
    send:     vi.fn().mockReturnThis(),
    render:   vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis()
  };
}

// ---------------------------------------------------------------------------
// Tests — savePage title validation
// ---------------------------------------------------------------------------

describe('WikiRoutes — savePage() title validation', () => {
  let wikiRoutes;

  beforeEach(() => {
    wikiRoutes = new WikiRoutes(makeEngine());
  });

  const invalidChars = ['/', '\\', '#', '?', '%', '"', '<', '>', '|', '*'];

  test.each(invalidChars)(
    'title containing "%s" is rejected with 400',
    async (char) => {
      const req = createSaveReq(`Bad${char}Title`);
      const res = createRes();

      await wikiRoutes.savePage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining('invalid characters')
      );
    }
  );

  test('clean title is accepted — no "invalid characters" rejection', async () => {
    const req = createSaveReq('My Clean Page Title');
    const res = createRes();

    await wikiRoutes.savePage(req, res);

    // Title validation passes; any subsequent 400 is from another check (e.g., ACL)
    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });

  test("title with apostrophe is accepted — e.g. President's Surveillance Program", async () => {
    const req = createSaveReq("President's Surveillance Program");
    const res = createRes();

    await wikiRoutes.savePage(req, res);

    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });

  test('title with hyphens, numbers, and dots is accepted', async () => {
    const req = createSaveReq('Meeting-Notes-2026-04-06');
    const res = createRes();

    await wikiRoutes.savePage(req, res);

    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });

  test('absent title does not trigger title validation rejection', async () => {
    const req = createSaveReq(undefined);
    const res = createRes();

    await wikiRoutes.savePage(req, res);

    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });

  test('empty string title does not trigger title validation rejection', async () => {
    const req = createSaveReq('');
    const res = createRes();

    await wikiRoutes.savePage(req, res);

    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });

  test('title with forward slash is rejected with descriptive message', async () => {
    const req = createSaveReq('NEWS / FORE / YOU');
    const res = createRes();

    await wikiRoutes.savePage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const sentMessage = res.send.mock.calls[0]?.[0] ?? '';
    expect(sentMessage).toMatch(/\/.*\\.*#.*\?/);  // message lists the forbidden chars
  });
});

// ---------------------------------------------------------------------------
// Tests — createPageFromTemplate page name validation
// ---------------------------------------------------------------------------

describe('WikiRoutes — createPageFromTemplate() page name validation', () => {
  let wikiRoutes;

  beforeEach(() => {
    wikiRoutes = new WikiRoutes(makeEngine());
  });

  function createTemplateReq(pageName) {
    return {
      params:  {},
      session: {},
      path:    '/create',
      userContext: { username: 'editor', roles: ['editor'], authenticated: true },
      headers: {},
      query:   {},
      body: {
        pageName,
        templateName: 'default'   // field name used by createPageFromTemplate
      }
    };
  }

  test('page name with slash is rejected with 400', async () => {
    const req = createTemplateReq('My/Page');
    const res = createRes();

    await wikiRoutes.createPageFromTemplate(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });

  test('page name with backslash is rejected with 400', async () => {
    const req = createTemplateReq('My\\Page');
    const res = createRes();

    await wikiRoutes.createPageFromTemplate(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });

  test('clean page name passes title validation', async () => {
    const req = createTemplateReq('My New Page');
    const res = createRes();

    await wikiRoutes.createPageFromTemplate(req, res);

    // Title validation passes; any subsequent 400 is from category/ACL checks
    expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('invalid characters'));
  });
});
