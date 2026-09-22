// Opt out of the global VersioningFileProvider and FileSystemProvider mocks
vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import { TEST_ACTOR, actor } from '../../test-support/actors';
import VersioningMaintenance from '../../utils/VersioningMaintenance';
import VersioningAnalytics from '../../utils/VersioningAnalytics';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('VersioningFileProvider - Maintenance', () => {
  let testDir;
  let engine;
  let configManager;
  let provider;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `versioning-maintenance-test-${Date.now()}`);
    await fs.ensureDir(testDir);

    const indexPath = path.join(testDir, 'data', 'page-index.json');

    configManager = {
      getProperty: vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(testDir, 'pages');
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.versioning.maxversions') return 50;
        if (key === 'ngdpbase.page.provider.versioning.retentiondays') return 365;
        if (key === 'ngdpbase.page.provider.versioning.checkpointinterval') return 10;
        return defaultValue;
      }),
      getResolvedDataPath: vi.fn((key, defaultPath) => {
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(testDir, 'pages');
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return path.join(testDir, 'data', 'page-index.json');
        return defaultPath;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };

    engine = {
      getManager: vi.fn((managerName) => {
        if (managerName === 'ConfigurationManager') {
          return configManager;
        }
        return null;
      })
    };

    // Create .install-complete so the provider doesn't scan the live required-pages dir
    await fs.ensureFile(path.join(testDir, '.install-complete'));

    provider = new VersioningFileProvider(engine);
    await provider.initialize();
  });

  afterEach(async () => {
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  /**
   * Helper: Create versions for a page
   */
  async function createPageWithVersions(uuid, title, versionCount) {
    for (let i = 1; i <= versionCount; i++) {
      await provider.savePage(title, `Content version ${i}`, {
        uuid,
        author: `user${i}`,
        comment: `Version ${i}`
      }, TEST_ACTOR);

      // Add delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  describe('purgeOldVersions()', () => {
    test('should purge old versions based on keepLatest', async () => {
      const uuid = 'purge-test-1';
      await createPageWithVersions(uuid, 'Purge Test', 30);

      const result = await provider.purgeOldVersions(uuid, {
        keepLatest: 10,
        retentionDays: 0,
        keepMilestones: false
      });

      expect(result.versionsRemoved).toBe(20); // 30 - 10 = 20
      expect(result.versionsPurged).toHaveLength(20);
      expect(result.dryRun).toBe(false);
    });

    test('should keep milestone versions', async () => {
      const uuid = 'purge-test-2';
      await createPageWithVersions(uuid, 'Milestone Test', 25);

      const result = await provider.purgeOldVersions(uuid, {
        keepLatest: 5,
        retentionDays: 0,
        keepMilestones: true // Keep v1, v10, v20
      });

      // Keep: v1 (milestone), v10 (milestone), v20 (milestone), v21-v25 (last 5)
      // Remove: v2-v9 (8), v11-v19 (9) = 17 versions
      expect(result.versionsRemoved).toBe(17);
    });

    test('should support dry-run mode', async () => {
      const uuid = 'purge-test-3';
      await createPageWithVersions(uuid, 'Dry Run Test', 20);

      const result = await provider.purgeOldVersions(uuid, {
        keepLatest: 5,
        retentionDays: 0,
        keepMilestones: false,
        dryRun: true
      });

      expect(result.dryRun).toBe(true);
      expect(result.versionsRemoved).toBe(15);

      // Verify versions still exist (dry run should not delete)
      const history = await provider.getVersionHistory(uuid, TEST_ACTOR);
      expect(history.length).toBe(20);
    });

    test('should throw error for non-existent page', async () => {
      await expect(
        provider.purgeOldVersions('non-existent-page-uuid')
      ).rejects.toThrow('Page not found');
    });

    test('should handle page with no versions to purge', async () => {
      const uuid = 'purge-test-4';
      await createPageWithVersions(uuid, 'Few Versions', 3);

      const result = await provider.purgeOldVersions(uuid, {
        keepLatest: 10,
        retentionDays: 9999
      });

      expect(result.versionsRemoved).toBe(0);
      expect(result.message).toContain('No versions meet purge criteria');
    });
  });

  describe('Performance Optimizations', () => {
    test('should create checkpoints at configured interval', async () => {
      const uuid = 'checkpoint-test-1';

      // Create 25 versions (checkpoints at v10, v20)
      await createPageWithVersions(uuid, 'Checkpoint Test', 25);

      // Check that v10 and v20 have full content (checkpoints)
      const versionDir = provider._getVersionDirectory
        ? provider._getVersionDirectory(uuid, 'pages')
        : provider.getVersionDirectory(uuid, 'pages');

      const v10Path = path.join(versionDir, 'v10', 'content.md');
      const v11Path = path.join(versionDir, 'v11', 'content.diff');
      const v20Path = path.join(versionDir, 'v20', 'content.md');

      expect(await fs.pathExists(v10Path)).toBe(true); // Checkpoint
      expect(await fs.pathExists(v11Path)).toBe(true); // Diff after checkpoint
      expect(await fs.pathExists(v20Path)).toBe(true); // Checkpoint
    });

    test('should use checkpoints for faster reconstruction', async () => {
      const uuid = 'checkpoint-test-2';

      // Create 50 versions
      await createPageWithVersions(uuid, 'Performance Test', 50);

      // Retrieve v48 (should use v40 checkpoint, not v1)
      const start = Date.now();
      const { content } = await provider.getPageVersion(uuid, 48, TEST_ACTOR);
      const duration = Date.now() - start;

      expect(content).toBe('Content version 48');
      expect(duration).toBeLessThan(500); // Should be reasonably fast with checkpoint
    });
  });

  describe('VersioningMaintenance', () => {
    test('should clean up all pages', async () => {
      // Create 3 pages with multiple versions
      await createPageWithVersions('uuid-1', 'Page 1', 20);
      await createPageWithVersions('uuid-2', 'Page 2', 25);
      await createPageWithVersions('uuid-3', 'Page 3', 30);

      const maintenance = new VersioningMaintenance({
        provider,
        dryRun: false,
        verbose: false
      });

      const report = await maintenance.cleanupAllPages({
        keepLatest: 10,
        retentionDays: 0,
        keepMilestones: false
      });

      expect(report.success).toBe(true);
      expect(report.pagesProcessed).toBe(3);
      expect(report.versionsRemoved).toBe(45); // (20-10) + (25-10) + (30-10)
    });

    test('should support dry run mode', async () => {
      await createPageWithVersions('uuid-1', 'Page 1', 20);

      const maintenance = new VersioningMaintenance({
        provider,
        dryRun: true,
        verbose: false
      });

      const report = await maintenance.cleanupAllPages({
        keepLatest: 5,
        retentionDays: 0,
        keepMilestones: false
      });

      expect(report.dryRun).toBe(true);
      expect(report.versionsRemoved).toBe(15);

      // Verify nothing was actually deleted
      const history = await provider.getVersionHistory('uuid-1', TEST_ACTOR);
      expect(history.length).toBe(20);
    });
  });

  describe('VersioningAnalytics', () => {
    test('should generate storage report', async () => {
      // Create pages with various version counts
      await createPageWithVersions('uuid-1', 'Small Page', 3);
      await createPageWithVersions('uuid-2', 'Medium Page', 15);
      await createPageWithVersions('uuid-3', 'Large Page', 40);

      const analytics = new VersioningAnalytics({
        provider,
        verbose: false
      });

      const report = await analytics.generateStorageReport();

      expect(report.summary.totalPages).toBe(3);
      expect(report.summary.pagesWithVersions).toBe(3);
      expect(report.summary.totalVersions).toBe(58); // 3 + 15 + 40
      expect(report.topPages).toHaveLength(3);
      expect(report.versionDistribution).toBeDefined();
    });

    test('should include recommendations for pages with many versions', async () => {
      // Create a page with many versions
      await createPageWithVersions('uuid-1', 'Many Versions', 60);

      const analytics = new VersioningAnalytics({
        provider,
        verbose: false
      });

      const report = await analytics.generateStorageReport();

      expect(report.recommendations.length).toBeGreaterThan(0);
      const cleanupRec = report.recommendations.find(r => r.type === 'cleanup');
      expect(cleanupRec).toBeDefined();
    });

    test('should get page storage details', async () => {
      const uuid = 'details-test-1';
      await createPageWithVersions(uuid, 'Details Test', 15);

      const analytics = new VersioningAnalytics({
        provider,
        verbose: false
      });

      const details = await analytics.getPageStorageDetails(uuid);

      expect(details.summary.versionCount).toBe(15);
      expect(details.versions).toHaveLength(15);
      expect(details.storageByType).toHaveProperty('fullContent');
      expect(details.storageByType).toHaveProperty('deltas');
    });
  });

  describe('Integration Tests', () => {
    test('should handle realistic maintenance scenario', async () => {
      // Create a wiki with various page patterns
      await createPageWithVersions('active-1', 'Active Page', 50);
      await createPageWithVersions('moderate-1', 'Moderate Page', 20);
      await createPageWithVersions('new-1', 'New Page', 3);

      // Run analytics
      const analytics = new VersioningAnalytics({ provider });
      const analyticReport = await analytics.generateStorageReport();

      expect(analyticReport.summary.totalVersions).toBe(73);

      // Run cleanup
      const maintenance = new VersioningMaintenance({ provider, dryRun: false });
      const cleanupReport = await maintenance.cleanupAllPages({
        keepLatest: 20,
        retentionDays: 0,
        keepMilestones: false
      });

      expect(cleanupReport.versionsRemoved).toBe(30); // Active page: 50 - 20 = 30

      // Verify pages still accessible
      const history = await provider.getVersionHistory('active-1', TEST_ACTOR);
      expect(history.length).toBe(20);

      // Verify kept versions are accessible (v31-v50 should remain)
      const { content } = await provider.getPageVersion('active-1', 40, TEST_ACTOR);
      expect(content).toContain('Content version 40');
    });
  });
});
