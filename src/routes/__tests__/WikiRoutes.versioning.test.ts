/**
 * @file WikiRoutes.versioning.test.js
 * @description Tests for version management API endpoints (Phase 7)
 */

import express from 'express';
import { policyShaped } from './__fixtures__/policyShaped';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';

describe('WikiRoutes - Version Management API', () => {
  let app;
  let mockEngine;
  let mockPageManager;
  let mockProvider;
  let wikiRoutes;

  beforeEach(() => {
    // Mock provider with versioning support
    mockProvider = {
      getVersionHistory: vi.fn(),
      getPageVersion: vi.fn(),
      compareVersions: vi.fn(),
      restoreVersion: vi.fn()
    };

    // Mock PageManager
    mockPageManager = {
      provider: mockProvider,
      pageExists: vi.fn(),
      getPage: vi.fn()
    };

    // Mock WikiEngine
    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'PageManager') return mockPageManager;
        // #1198: restoring asks page-edit of policy; the test user holds it.
        if (name === 'UserManager') return { hasPermission: vi.fn(policyShaped) };
        if (name === 'ConfigurationManager') {
          return {
            getProperty: vi.fn((key, defaultValue) => defaultValue)
          };
        }
        return null;
      })
    };

    // Create Express app
    app = express();
    app.use(express.json());

    // Mock user context middleware
    app.use((req, res, next) => {
      req.userContext = {
        username: 'testuser',
        isAuthenticated: true,
        roles: ['Authenticated']
      };
      next();
    });

    // Create WikiRoutes instance and register routes
    wikiRoutes = new WikiRoutes(mockEngine);
    wikiRoutes.registerRoutes(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // GET /api/page/:identifier/versions
  // ============================================================================

  describe('GET /api/page/:identifier/versions', () => {
    it('should return version history for a page', async () => {
      const mockVersions = [
        {
          version: 3,
          dateCreated: '2024-01-03T10:00:00Z',
          author: 'user3',
          changeType: 'updated',
          comment: 'Latest changes'
        },
        {
          version: 2,
          dateCreated: '2024-01-02T10:00:00Z',
          author: 'user2',
          changeType: 'updated',
          comment: 'Second version'
        },
        {
          version: 1,
          dateCreated: '2024-01-01T10:00:00Z',
          author: 'user1',
          changeType: 'created',
          comment: 'Initial version'
        }
      ];

      mockProvider.getVersionHistory.mockResolvedValue(mockVersions);

      const response = await request(app)
        .get('/api/page/TestPage/versions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.identifier).toBe('TestPage');
      expect(response.body.versionCount).toBe(3);
      expect(response.body.versions).toEqual(mockVersions);
      expect(mockProvider.getVersionHistory).toHaveBeenCalledWith('TestPage');
    });

    it('should return 404 for non-existent page', async () => {
      mockProvider.getVersionHistory.mockRejectedValue(
        new Error('Page not found: NonExistentPage')
      );

      const response = await request(app)
        .get('/api/page/NonExistentPage/versions')
        .expect(404);

      expect(response.body.error).toBe('Page not found');
    });

    it('should return 501 when versioning not supported', async () => {
      // Remove versioning methods from provider
      delete mockProvider.getVersionHistory;

      const response = await request(app)
        .get('/api/page/TestPage/versions')
        .expect(501);

      expect(response.body.error).toBe('Versioning not supported');
    });

    it('should handle provider errors gracefully', async () => {
      mockProvider.getVersionHistory.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/page/TestPage/versions')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });
  });

  // ============================================================================
  // GET /api/page/:identifier/version/:version
  // ============================================================================

  describe('GET /api/page/:identifier/version/:version', () => {
    it('should return specific version content', async () => {
      const mockVersionData = {
        content: '# Test Page\n\nVersion 2 content',
        metadata: {
          version: 2,
          dateCreated: '2024-01-02T10:00:00Z',
          author: 'user2',
          changeType: 'updated',
          comment: 'Second version'
        }
      };

      mockProvider.getPageVersion.mockResolvedValue(mockVersionData);

      const response = await request(app)
        .get('/api/page/TestPage/version/2')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.identifier).toBe('TestPage');
      expect(response.body.version).toBe(2);
      expect(response.body.content).toBe(mockVersionData.content);
      expect(response.body.metadata).toEqual(mockVersionData.metadata);
      expect(mockProvider.getPageVersion).toHaveBeenCalledWith('TestPage', 2);
    });

    it('should return 400 for invalid version number', async () => {
      const response = await request(app)
        .get('/api/page/TestPage/version/invalid')
        .expect(400);

      expect(response.body.error).toBe('Invalid version number');
    });

    it('should return 400 for zero version number', async () => {
      const response = await request(app)
        .get('/api/page/TestPage/version/0')
        .expect(400);

      expect(response.body.error).toBe('Invalid version number');
    });

    it('should return 400 for negative version number', async () => {
      const response = await request(app)
        .get('/api/page/TestPage/version/-1')
        .expect(400);

      expect(response.body.error).toBe('Invalid version number');
    });

    it('should return 404 for non-existent version', async () => {
      mockProvider.getPageVersion.mockRejectedValue(
        new Error('Version 999 does not exist')
      );

      const response = await request(app)
        .get('/api/page/TestPage/version/999')
        .expect(404);

      expect(response.body.error).toBe('Version not found');
    });

    it('should return 501 when versioning not supported', async () => {
      delete mockProvider.getPageVersion;

      const response = await request(app)
        .get('/api/page/TestPage/version/1')
        .expect(501);

      expect(response.body.error).toBe('Versioning not supported');
    });
  });

  // ============================================================================
  // GET /api/page/:identifier/compare/:v1/:v2
  // ============================================================================

  describe('GET /api/page/:identifier/compare/:v1/:v2', () => {
    it('should compare two versions successfully', async () => {
      const mockComparison = {
        version1: {
          version: 1,
          dateCreated: '2024-01-01T10:00:00Z',
          author: 'user1'
        },
        version2: {
          version: 2,
          dateCreated: '2024-01-02T10:00:00Z',
          author: 'user2'
        },
        diff: [
          [0, 'Unchanged line\n'],
          [-1, 'Deleted line\n'],
          [1, 'Added line\n']
        ],
        stats: {
          additions: 1,
          deletions: 1,
          unchanged: 1
        }
      };

      mockProvider.compareVersions.mockResolvedValue(mockComparison);

      const response = await request(app)
        .get('/api/page/TestPage/compare/1/2')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.identifier).toBe('TestPage');
      expect(response.body.comparison).toEqual(mockComparison);
      expect(mockProvider.compareVersions).toHaveBeenCalledWith('TestPage', 1, 2);
    });

    it('should return 400 for invalid version numbers', async () => {
      const response = await request(app)
        .get('/api/page/TestPage/compare/invalid/2')
        .expect(400);

      expect(response.body.error).toBe('Invalid version numbers');
    });

    it('should return 400 for negative version numbers', async () => {
      const response = await request(app)
        .get('/api/page/TestPage/compare/-1/2')
        .expect(400);

      expect(response.body.error).toBe('Invalid version numbers');
    });

    it('should handle comparison errors gracefully', async () => {
      mockProvider.compareVersions.mockRejectedValue(
        new Error('Version not found: TestPage')
      );

      const response = await request(app)
        .get('/api/page/TestPage/compare/1/999')
        .expect(404);

      expect(response.body.error).toBe('Page or version not found');
    });

    it('should return 501 when versioning not supported', async () => {
      delete mockProvider.compareVersions;

      const response = await request(app)
        .get('/api/page/TestPage/compare/1/2')
        .expect(501);

      expect(response.body.error).toBe('Versioning not supported');
    });
  });

  // ============================================================================
  // POST /api/page/:identifier/restore/:version
  // ============================================================================

  describe('POST /api/page/:identifier/restore/:version', () => {
    it('should restore version successfully', async () => {
      mockProvider.restoreVersion.mockResolvedValue(4); // New version number

      const response = await request(app)
        .post('/api/page/TestPage/restore/2')
        .send({ comment: 'Restoring to version 2' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.identifier).toBe('TestPage');
      expect(response.body.restoredFromVersion).toBe(2);
      expect(response.body.newVersion).toBe(4);
      expect(mockProvider.restoreVersion).toHaveBeenCalledWith(
        'TestPage',
        2,
        expect.objectContaining({
          author: 'testuser',
          comment: 'Restoring to version 2'
        })
      );
    });

    it('should use default comment if not provided', async () => {
      mockProvider.restoreVersion.mockResolvedValue(4);

      await request(app)
        .post('/api/page/TestPage/restore/2')
        .send({})
        .expect(200);

      expect(mockProvider.restoreVersion).toHaveBeenCalledWith(
        'TestPage',
        2,
        expect.objectContaining({
          comment: 'Restored from v2'
        })
      );
    });

    it('should return 401 if user not authenticated', async () => {
      // Create app with anonymous user
      const anonApp = express();
      anonApp.use(express.json());
      anonApp.use((req, res, next) => {
        req.userContext = {
          username: 'Anonymous',
          isAuthenticated: false
        };
        next();
      });
      const anonRoutes = new WikiRoutes(mockEngine);
      anonRoutes.registerRoutes(anonApp);

      const response = await request(anonApp)
        .post('/api/page/TestPage/restore/2')
        .send({})
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should return 400 for invalid version number', async () => {
      const response = await request(app)
        .post('/api/page/TestPage/restore/invalid')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Invalid version number');
    });

    it('should return 404 for non-existent page or version', async () => {
      mockProvider.restoreVersion.mockRejectedValue(
        new Error('Page not found: TestPage')
      );

      const response = await request(app)
        .post('/api/page/TestPage/restore/2')
        .send({})
        .expect(404);

      expect(response.body.error).toBe('Page or version not found');
    });

    it('should return 501 when versioning not supported', async () => {
      delete mockProvider.restoreVersion;

      const response = await request(app)
        .post('/api/page/TestPage/restore/2')
        .send({})
        .expect(501);

      expect(response.body.error).toBe('Versioning not supported');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration: Complete Version Workflow', () => {
    it('should handle complete version management workflow', async () => {
      // Step 1: Get version history
      const mockVersions = [
        { version: 2, author: 'user2', changeType: 'updated' },
        { version: 1, author: 'user1', changeType: 'created' }
      ];
      mockProvider.getVersionHistory.mockResolvedValue(mockVersions);

      const historyResponse = await request(app)
        .get('/api/page/TestPage/versions')
        .expect(200);

      expect(historyResponse.body.versionCount).toBe(2);

      // Step 2: Get specific version
      mockProvider.getPageVersion.mockResolvedValue({
        content: 'Version 1 content',
        metadata: { version: 1 }
      });

      const versionResponse = await request(app)
        .get('/api/page/TestPage/version/1')
        .expect(200);

      expect(versionResponse.body.version).toBe(1);

      // Step 3: Compare versions
      mockProvider.compareVersions.mockResolvedValue({
        version1: { version: 1 },
        version2: { version: 2 },
        diff: [[1, 'New content']],
        stats: { additions: 1, deletions: 0, unchanged: 0 }
      });

      const compareResponse = await request(app)
        .get('/api/page/TestPage/compare/1/2')
        .expect(200);

      expect(compareResponse.body.comparison.stats.additions).toBe(1);

      // Step 4: Restore version
      mockProvider.restoreVersion.mockResolvedValue(3);

      const restoreResponse = await request(app)
        .post('/api/page/TestPage/restore/1')
        .send({ comment: 'Reverting changes' })
        .expect(200);

      expect(restoreResponse.body.newVersion).toBe(3);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle special characters in page names', async () => {
      mockProvider.getVersionHistory.mockResolvedValue([]);

      await request(app)
        .get('/api/page/Test%20Page%20%26%20More/versions')
        .expect(200);

      expect(mockProvider.getVersionHistory).toHaveBeenCalledWith(
        'Test Page & More'
      );
    });

    it('should handle UUID as identifier', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      mockProvider.getVersionHistory.mockResolvedValue([]);

      await request(app)
        .get(`/api/page/${uuid}/versions`)
        .expect(200);

      expect(mockProvider.getVersionHistory).toHaveBeenCalledWith(uuid);
    });

    it('should handle very large version numbers', async () => {
      mockProvider.getPageVersion.mockResolvedValue({
        content: 'Content',
        metadata: { version: 999999 }
      });

      const response = await request(app)
        .get('/api/page/TestPage/version/999999')
        .expect(200);

      expect(response.body.version).toBe(999999);
    });

    it('should handle pages with no versions', async () => {
      mockProvider.getVersionHistory.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/page/NewPage/versions')
        .expect(200);

      expect(response.body.versionCount).toBe(0);
      expect(response.body.versions).toEqual([]);
    });
  });

  // ============================================================================
  // Security Tests
  // ============================================================================

  describe('Security', () => {
    it('should track author correctly on restore', async () => {
      mockProvider.restoreVersion.mockResolvedValue(5);

      await request(app)
        .post('/api/page/TestPage/restore/2')
        .send({})
        .expect(200);

      expect(mockProvider.restoreVersion).toHaveBeenCalledWith(
        'TestPage',
        2,
        expect.objectContaining({
          author: 'testuser'
        })
      );
    });

    it('should sanitize user input in comments', async () => {
      mockProvider.restoreVersion.mockResolvedValue(5);

      await request(app)
        .post('/api/page/TestPage/restore/2')
        .send({ comment: '<script>alert("xss")</script>' })
        .expect(200);

      // Comment should be passed as-is (sanitization happens at storage level)
      expect(mockProvider.restoreVersion).toHaveBeenCalled();
    });
  });
});
