/**
 * WikiRoutes Schema.org Integration Tests
 * Tests Schema.org functionality in WikiRoutes
 */

import WikiRoutes from '../../routes/WikiRoutes';

// Mock dependencies
const mockSchemaManager = {
  getComprehensiveSiteData: vi.fn().mockReturnValue({
    adminUsers: [{
      '@type': 'Person',
      '@id': 'admin-1',
      'name': 'Admin User',
      'email': 'admin@example.com'
    }],
    organizations: [{
      '@type': 'Organization',
      '@id': 'main-org',
      'name': 'Test Organization'
    }]
  }),
  getOrganizations: vi.fn().mockReturnValue([{
    '@id': 'org-1',
    'name': 'Test Organization',
    'legalName': 'Test Corp LLC'
  }]),
  createOrganization: vi.fn().mockImplementation((data) => {
    if (!data.name) throw new Error('Organization name is required');
    return { ...data, '@type': 'Organization' };
  }),
  updateOrganization: vi.fn().mockReturnValue(true),
  deleteOrganization: vi.fn().mockReturnValue(true),
  saveOrganizations: vi.fn()
};

const mockPageManager = {
  getPageContent: vi.fn().mockResolvedValue('# Welcome\nTest content'),
  getPageMetadata: vi.fn().mockResolvedValue({ title: 'Welcome' }),
  getPage: vi.fn().mockReturnValue({ title: 'Test', content: 'Test' })
};

const mockRenderingManager = {
  textToHTML: vi.fn().mockResolvedValue('<p>Rendered</p>')
};

const mockPolicyInformationPoint = {
  removeACLMarkup: vi.fn().mockReturnValue('Clean content'),
  checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
};

const mockConfigManager = {
  getProperty: vi.fn().mockReturnValue('Welcome')
};

// #1431 step 14: decisions are the PDP's.
const mockPolicyDecisionPoint = {
  permits: vi.fn().mockReturnValue(true)
};

const mockEngine = {
  getManager: vi.fn((name) => {
    const managers = {
      'SchemaManager': mockSchemaManager,
      'PageManager': mockPageManager,
      'RenderingManager': mockRenderingManager,
      'PolicyInformationPoint': mockPolicyInformationPoint,
      'ConfigurationManager': mockConfigManager,
      'PolicyDecisionPoint': mockPolicyDecisionPoint
    };
    return managers[name] || null;
  })
};

describe('WikiRoutes Schema.org Integration', () => {
  let wikiRoutes;

  beforeEach(() => {
    wikiRoutes = new WikiRoutes(mockEngine);
    vi.clearAllMocks();
  });

  describe('SchemaManager Integration', () => {
    test('should have access to SchemaManager', () => {
      const schemaManager = mockEngine.getManager('SchemaManager');
      expect(schemaManager).toBeDefined();
      expect(schemaManager.getOrganizations).toBeDefined();
    });

    test('should get comprehensive site data', () => {
      const siteData = mockSchemaManager.getComprehensiveSiteData();

      expect(siteData).toBeDefined();
      expect(siteData.adminUsers).toBeDefined();
      expect(siteData.organizations).toBeDefined();
    });

    test('should get organizations list', () => {
      const orgs = mockSchemaManager.getOrganizations();

      expect(orgs).toBeInstanceOf(Array);
      expect(orgs.length).toBeGreaterThan(0);
      expect(orgs[0]).toHaveProperty('name');
    });

    test('should create organization', () => {
      const newOrg = mockSchemaManager.createOrganization({
        name: 'New Organization',
        legalName: 'New Org LLC'
      });

      expect(newOrg).toBeDefined();
      expect(newOrg['@type']).toBe('Organization');
      expect(newOrg.name).toBe('New Organization');
    });

    test('should validate organization name is required', () => {
      expect(() => {
        mockSchemaManager.createOrganization({});
      }).toThrow('Organization name is required');
    });

    test('should update organization', () => {
      const result = mockSchemaManager.updateOrganization('org-1', {
        name: 'Updated Organization'
      });

      expect(result).toBe(true);
      expect(mockSchemaManager.updateOrganization).toHaveBeenCalledWith(
        'org-1',
        { name: 'Updated Organization' }
      );
    });

    test('should delete organization', () => {
      const result = mockSchemaManager.deleteOrganization('org-1');

      expect(result).toBe(true);
      expect(mockSchemaManager.deleteOrganization).toHaveBeenCalledWith('org-1');
    });
  });

  describe('Admin Organization Routes (Direct Method Tests)', () => {
    // Create mock request and response objects
    const createMockReq = (userContext, body = {}, params = {}) => ({
      userContext,
      body,
      params,
      session: {}
    });

    const createMockRes = () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        render: vi.fn().mockReturnThis(),
        redirect: vi.fn().mockReturnThis()
      };
      return res;
    };

    test('should require admin access for adminOrganizations', async () => {
      const req = createMockReq(
        { username: 'user', isAuthenticated: true, roles: ['user'] }
      );
      const res = createMockRes();

      // The method checks if user is admin
      mockPolicyDecisionPoint.permits.mockReturnValue(false);

      await wikiRoutes.adminOrganizations(req, res);

      // Should return 403 for non-admin
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should allow admin to access organizations page', async () => {
      const req = createMockReq(
        { username: 'admin', isAuthenticated: true, roles: ['admin'] }
      );
      const res = createMockRes();

      mockPolicyDecisionPoint.permits.mockReturnValue(true);

      await wikiRoutes.adminOrganizations(req, res);

      // Should render the organizations page for admin
      expect(res.status).not.toHaveBeenCalledWith(403);
    });
  });
});
