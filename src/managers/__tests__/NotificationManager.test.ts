import { promises as fs } from 'fs';
import path from 'path';
import NotificationManager from '../NotificationManager';
import type { WikiEngine } from '../../types/WikiEngine';

// Mock logger to avoid console output during tests
vi.mock('../../utils/logger', () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    })

  }
}));

// Helper function to create a properly mocked engine with ConfigurationManager
function createMockEngine(dataDir) {
  const mockConfigManager = {
    getProperty: vi.fn((key, defaultValue) => {
      if (key === 'ngdpbase.directories.data' || key === 'ngdpbase.notifications.dir') {
        return dataDir;
      }
      if (key === 'ngdpbase.notifications.file') {
        return 'notifications.json';
      }
      if (key === 'ngdpbase.notifications.auto-save-interval') {
        return 60000; // 1 minute for tests
      }
      return defaultValue;
    }),
    // Support INSTANCE_DATA_FOLDER feature
    getResolvedDataPath: vi.fn((key, defaultValue) => {
      if (key === 'ngdpbase.notifications.dir') {
        return dataDir;
      }
      return defaultValue;
    })
  };

  return {
    getManager: vi.fn((name) => {
      if (name === 'ConfigurationManager' || name === 'ConfigManager') {
        return mockConfigManager;
      }
      return undefined;
    })
  };
}

describe('NotificationManager', () => {
  let notificationManager;
  let mockEngine;
  let tempDir;
  let testCounter = 0;

  beforeEach(async () => {
    // Create truly unique temporary directory for test data
    testCounter++;
    tempDir = path.join(__dirname, 'temp', `${Date.now()}-${testCounter}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Mock engine with ConfigurationManager pointing to temp directory
    mockEngine = createMockEngine(tempDir);

    // Initialize NotificationManager
    notificationManager = new NotificationManager(mockEngine);
    await notificationManager.initialize({});
  });

  afterEach(async () => {
    // Shutdown manager
    if (notificationManager) {
      await notificationManager.shutdown();
    }

    // Clean up temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('Failed to clean up temp directory:', err.message);
      }
    }
  });

  describe('addNotification method (Bug Fix)', () => {
    test('should exist and be callable', () => {
      expect(typeof notificationManager.addNotification).toBe('function');
      expect(notificationManager.addNotification).toBeDefined();
    });

    test('should be async function', () => {
      expect(notificationManager.addNotification.constructor.name).toBe('AsyncFunction');
    });

    test('should create notification via addNotification alias', async () => {
      const notification = {
        type: 'performance',
        title: 'MarkupParser Performance Alert: SLOW_PARSING',
        message: 'Average parse time 150.25ms exceeds threshold 100ms',
        priority: 'medium',
        source: 'MarkupParser'
      };

      // Spy on createNotification to verify it's called
      const createSpy = vi.spyOn(notificationManager, 'createNotification');
      
      const result = await notificationManager.addNotification(notification);
      
      expect(createSpy).toHaveBeenCalledWith(notification);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^notification_\d+$/);
      
      createSpy.mockRestore();
    });

    test('should return same result as createNotification', async () => {
      const notification = {
        type: 'system',
        title: 'Test Notification',
        message: 'Test message'
      };

      const createResult = await notificationManager.createNotification(notification);
      
      // Reset for clean test
      notificationManager.notifications.clear();
      notificationManager.notificationId = 0;
      
      const addResult = await notificationManager.addNotification(notification);
      
      // Both should return same format (notification_1)
      expect(typeof createResult).toBe(typeof addResult);
      expect(createResult).toMatch(/^notification_\d+$/);
      expect(addResult).toMatch(/^notification_\d+$/);
    });

    test('should handle MarkupParser performance alert format', async () => {
      // Simulate exact call from MarkupParser.generatePerformanceAlert()
      const performanceAlert = {
        type: 'performance',
        title: 'MarkupParser Performance Alert: SLOW_PARSING',
        message: 'Average parse time 125.50ms exceeds threshold 100ms',
        priority: 'medium',
        source: 'MarkupParser'
      };

      const id = await notificationManager.addNotification(performanceAlert);
      
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      
      // Verify notification was actually created
      const notifications = notificationManager.getAllNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('performance');
      expect(notifications[0].title).toContain('MarkupParser Performance Alert');
    });

    test('should handle different alert types from MarkupParser', async () => {
      const alertTypes = [
        {
          type: 'performance',
          title: 'MarkupParser Performance Alert: SLOW_PARSING',
          message: 'Average parse time exceeds threshold',
          priority: 'medium',
          source: 'MarkupParser'
        },
        {
          type: 'performance', 
          title: 'MarkupParser Performance Alert: LOW_CACHE_HIT_RATIO',
          message: 'Cache hit ratio below threshold',
          priority: 'medium',
          source: 'MarkupParser'
        },
        {
          type: 'performance',
          title: 'MarkupParser Performance Alert: HIGH_ERROR_RATE', 
          message: 'Error rate exceeds threshold',
          priority: 'medium',
          source: 'MarkupParser'
        }
      ];

      const ids = [];
      for (const alert of alertTypes) {
        const id = await notificationManager.addNotification(alert);
        ids.push(id);
      }

      expect(ids).toHaveLength(3);
      expect(ids.every(id => typeof id === 'string')).toBe(true);
      
      const notifications = notificationManager.getAllNotifications();
      expect(notifications).toHaveLength(3);
    });

    test('should persist notifications created via addNotification', async () => {
      const notification = {
        type: 'performance',
        title: 'Test Performance Alert',
        message: 'Test persistence'
      };

      await notificationManager.addNotification(notification);
      
      // Verify it was saved to storage
      const storagePath = path.join(tempDir, 'notifications.json');
      const data = await fs.readFile(storagePath, 'utf8');
      const parsed = JSON.parse(data);
      
      expect(parsed.notifications).toBeDefined();
      expect(Object.keys(parsed.notifications)).toHaveLength(1);
    });

    test('should handle missing optional properties gracefully', async () => {
      // Minimal notification object
      const minimalNotification = {
        message: 'Minimal test notification'
      };

      const id = await notificationManager.addNotification(minimalNotification);
      
      expect(id).toBeDefined();
      
      const notifications = notificationManager.getAllNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('system'); // default
      expect(notifications[0].level).toBe('info'); // default
      expect(notifications[0].title).toBe('System Notification'); // default
    });
  });

  describe('backward compatibility', () => {
    test('both addNotification and createNotification should work identically', async () => {
      const notification1 = {
        type: 'test',
        title: 'Test 1',
        message: 'Created via createNotification'
      };
      
      const notification2 = {
        type: 'test', 
        title: 'Test 2',
        message: 'Created via addNotification'
      };

      const id1 = await notificationManager.createNotification(notification1);
      const id2 = await notificationManager.addNotification(notification2);

      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      
      const allNotifications = notificationManager.getAllNotifications();
      expect(allNotifications).toHaveLength(2);
      
      // Both should have same structure
      const notif1 = allNotifications.find(n => n.message.includes('createNotification'));
      const notif2 = allNotifications.find(n => n.message.includes('addNotification'));
      
      expect(notif1).toBeDefined();
      expect(notif2).toBeDefined();
      expect(Object.keys(notif1)).toEqual(Object.keys(notif2));
    });
  });

  describe('integration with MarkupParser error scenario', () => {
    test('should prevent TypeError: addNotification is not a function', async () => {
      // Simulate the exact scenario that was failing
      const mockMarkupParserCall = async () => {
        const notificationManager = mockEngine.getManager('NotificationManager');
        if (notificationManager) {
          return await notificationManager.addNotification({
            type: 'performance',
            title: 'MarkupParser Performance Alert: SLOW_PARSING',
            message: 'Average parse time 150ms exceeds threshold 100ms',
            priority: 'medium',
            source: 'MarkupParser'
          });
        }
      };

      // Mock engine to return our notification manager
      mockEngine.getManager.mockReturnValue(notificationManager);

      // This should NOT throw "addNotification is not a function"
      await expect(mockMarkupParserCall()).resolves.toBeDefined();
      
      // Verify the call was successful
      const notifications = notificationManager.getAllNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('performance');
      expect(notifications[0].title).toContain('MarkupParser Performance Alert');
    });
  });

  describe('initialization and storage', () => {
    test('should handle failed directory creation gracefully', async () => {
      const invalidPath = path.join(tempDir, 'invalid-subdir');
      const localMockEngine = createMockEngine(invalidPath);
      const manager = new NotificationManager(localMockEngine);

      // Mock fs.mkdir to throw error
      const originalMkdir = require('fs').promises.mkdir;
      require('fs').promises.mkdir = vi.fn().mockRejectedValue(new Error('Permission denied'));

      // Should not throw error, just log warning
      await expect(manager.initialize({})).resolves.not.toThrow();

      // Restore original mkdir
      require('fs').promises.mkdir = originalMkdir;

      await manager.shutdown();
    });

    test('should load existing notifications from storage', async () => {
      // Create a storage file with existing notifications
      const existingNotifications = {
        lastSaved: new Date().toISOString(),
        notifications: {
          'notification_1': {
            id: 'notification_1',
            type: 'system',
            title: 'Existing Notification',
            message: 'This was loaded from storage',
            level: 'info',
            targetUsers: [],
            createdAt: '2023-01-01T00:00:00.000Z',
            expiresAt: null,
            dismissedBy: []
          },
          'notification_5': {
            id: 'notification_5',
            type: 'performance',
            title: 'Performance Alert',
            message: 'High CPU usage',
            level: 'warning',
            targetUsers: ['admin'],
            createdAt: '2023-01-02T00:00:00.000Z',
            expiresAt: '2023-12-31T23:59:59.999Z',
            dismissedBy: []
          }
        }
      };

      const storagePath = path.join(tempDir, 'notifications.json');
      await fs.writeFile(storagePath, JSON.stringify(existingNotifications, null, 2));

      // Create new manager that should load existing notifications
      const localMockEngine = createMockEngine(tempDir);
      const manager = new NotificationManager(localMockEngine);
      await manager.initialize({});

      // Verify notifications were loaded
      const loadedNotifications = manager.getAllNotifications(true); // include expired
      expect(loadedNotifications).toHaveLength(2);
      
      // Verify notification ID counter was updated to highest ID
      expect(manager.notificationId).toBe(5);
      
      // Verify dates were converted back to Date objects
      const notification1 = manager.notifications.get('notification_1');
      expect(notification1.createdAt).toBeInstanceOf(Date);
      
      const notification5 = manager.notifications.get('notification_5');
      expect(notification5.expiresAt).toBeInstanceOf(Date);

      await manager.shutdown();
    });

    test('should handle corrupted storage file gracefully', async () => {
      // Create a unique temp directory for this test to avoid interference
      const corruptedTempDir = path.join(__dirname, 'temp', `corrupted-${Date.now()}`);
      await fs.mkdir(corruptedTempDir, { recursive: true });

      // Create corrupted storage file
      const storagePath = path.join(corruptedTempDir, 'notifications.json');
      await fs.writeFile(storagePath, 'invalid json content');

      const localMockEngine = createMockEngine(corruptedTempDir);
      const manager = new NotificationManager(localMockEngine);

      // Should not throw error, just log error and continue
      await expect(manager.initialize({})).resolves.not.toThrow();

      // Should start with empty notifications
      expect(manager.getAllNotifications()).toHaveLength(0);

      await manager.shutdown();

      // Clean up
      await fs.rm(corruptedTempDir, { recursive: true, force: true });
    });

    test('should handle missing storage file (ENOENT)', async () => {
      const nonExistentDir = path.join(tempDir, 'nonexistent-' + Date.now());
      const localMockEngine = createMockEngine(nonExistentDir);
      const manager = new NotificationManager(localMockEngine);

      // Initialize - directory will be created, but file won't exist
      await manager.initialize({});

      // Should start with empty notifications
      expect(manager.getAllNotifications()).toHaveLength(0);

      await manager.shutdown();
    });
  });

  describe('user notifications', () => {
    test('should get notifications for specific user', async () => {
      // Create notifications with different target users
      await notificationManager.createNotification({
        type: 'system',
        title: 'Global Notification',
        message: 'For all users',
        targetUsers: [] // All users
      });

      await notificationManager.createNotification({
        type: 'user',
        title: 'User Specific',
        message: 'Only for john',
        targetUsers: ['john']
      });

      await notificationManager.createNotification({
        type: 'admin',
        title: 'Admin Only',
        message: 'Only for admin',
        targetUsers: ['admin']
      });

      // Test getting notifications for different users
      const johnNotifications = notificationManager.getUserNotifications('john');
      expect(johnNotifications).toHaveLength(2); // Global + user specific

      const adminNotifications = notificationManager.getUserNotifications('admin');
      expect(adminNotifications).toHaveLength(2); // Global + admin specific

      const otherUserNotifications = notificationManager.getUserNotifications('other');
      expect(otherUserNotifications).toHaveLength(1); // Only global
    });

    test('should exclude dismissed notifications', async () => {
      const id = await notificationManager.createNotification({
        type: 'system',
        title: 'Test Notification',
        message: 'Test message',
        targetUsers: []
      });

      // Initially user should see the notification
      let userNotifications = notificationManager.getUserNotifications('testuser');
      expect(userNotifications).toHaveLength(1);

      // Dismiss the notification
      await notificationManager.dismissNotification(id, 'testuser');

      // Now user should not see the notification
      userNotifications = notificationManager.getUserNotifications('testuser');
      expect(userNotifications).toHaveLength(0);
    });

    test('should exclude expired notifications by default', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      
      await notificationManager.createNotification({
        type: 'system',
        title: 'Expired Notification',
        message: 'This is expired',
        expiresAt: pastDate
      });

      await notificationManager.createNotification({
        type: 'system',
        title: 'Active Notification',
        message: 'This is active'
      });

      // By default, should not include expired
      const activeNotifications = notificationManager.getUserNotifications('testuser');
      expect(activeNotifications).toHaveLength(1);
      expect(activeNotifications[0].title).toBe('Active Notification');

      // With includeExpired=true, should include both
      const allNotifications = notificationManager.getUserNotifications('testuser', true);
      expect(allNotifications).toHaveLength(2);
    });
  });

  describe('notification dismissal', () => {
    test('should dismiss notification successfully', async () => {
      const id = await notificationManager.createNotification({
        type: 'system',
        title: 'Test Notification',
        message: 'Test message'
      });

      const success = await notificationManager.dismissNotification(id, 'testuser');
      expect(success).toBe(true);

      const notification = notificationManager.notifications.get(id);
      expect(notification.dismissedBy).toContain('testuser');
    });

    test('should return false for non-existent notification', async () => {
      const success = await notificationManager.dismissNotification('nonexistent', 'testuser');
      expect(success).toBe(false);
    });

    test('should not add duplicate dismissals', async () => {
      const id = await notificationManager.createNotification({
        type: 'system',
        title: 'Test Notification',
        message: 'Test message'
      });

      // Dismiss twice
      await notificationManager.dismissNotification(id, 'testuser');
      await notificationManager.dismissNotification(id, 'testuser');

      const notification = notificationManager.notifications.get(id);
      expect(notification.dismissedBy).toEqual(['testuser']); // Should only appear once
    });
  });

  describe('maintenance notifications', () => {
    test('should create maintenance enabled notification', async () => {
      const id = await notificationManager.createMaintenanceNotification(true, 'admin', {});
      
      const notification = notificationManager.notifications.get(id);
      expect(notification.type).toBe('maintenance');
      expect(notification.title).toBe('Maintenance Mode Enabled');
      expect(notification.level).toBe('warning');
      expect(notification.expiresAt).toBeNull(); // Should not expire while enabled
    });

    test('should create maintenance disabled notification', async () => {
      const id = await notificationManager.createMaintenanceNotification(false, 'admin', {});
      
      const notification = notificationManager.notifications.get(id);
      expect(notification.type).toBe('maintenance');
      expect(notification.title).toBe('Maintenance Mode Disabled');
      expect(notification.level).toBe('success');
      expect(notification.expiresAt).toBeInstanceOf(Date); // Should expire after 24 hours
    });
  });

  describe('notification cleanup', () => {
    test('should clean up expired notifications', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now

      // Create expired notification
      await notificationManager.createNotification({
        type: 'system',
        title: 'Expired',
        message: 'This should be cleaned up',
        expiresAt: pastDate
      });

      // Create active notification
      await notificationManager.createNotification({
        type: 'system',
        title: 'Active',
        message: 'This should remain',
        expiresAt: futureDate
      });

      // Create notification without expiry
      await notificationManager.createNotification({
        type: 'system',
        title: 'Permanent',
        message: 'This should remain'
      });

      expect(notificationManager.notifications.size).toBe(3);

      // Clean up expired notifications
      await notificationManager.cleanupExpiredNotifications();

      expect(notificationManager.notifications.size).toBe(2);
      
      const remaining = notificationManager.getAllNotifications(true);
      expect(remaining.find(n => n.title === 'Expired')).toBeUndefined();
      expect(remaining.find(n => n.title === 'Active')).toBeDefined();
      expect(remaining.find(n => n.title === 'Permanent')).toBeDefined();
    });

    test('should handle cleanup when no expired notifications exist', async () => {
      await notificationManager.createNotification({
        type: 'system',
        title: 'Active',
        message: 'This should remain'
      });

      const sizeBefore = notificationManager.notifications.size;
      await notificationManager.cleanupExpiredNotifications();
      const sizeAfter = notificationManager.notifications.size;

      expect(sizeBefore).toBe(sizeAfter);
    });
  });

  describe('statistics', () => {
    test('should return correct statistics', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Create various notifications
      await notificationManager.createNotification({
        type: 'system',
        title: 'System 1',
        message: 'System notification',
        level: 'info'
      });

      await notificationManager.createNotification({
        type: 'performance',
        title: 'Performance 1',
        message: 'Performance alert',
        level: 'warning'
      });

      await notificationManager.createNotification({
        type: 'system',
        title: 'Expired System',
        message: 'Expired notification',
        level: 'error',
        expiresAt: pastDate
      });

      const stats = notificationManager.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(2);
      expect(stats.expired).toBe(1);
      expect(stats.byType.system).toBe(2);
      expect(stats.byType.performance).toBe(1);
      expect(stats.byLevel.info).toBe(1);
      expect(stats.byLevel.warning).toBe(1);
      expect(stats.byLevel.error).toBe(1);
    });
  });

  describe('save error handling', () => {
    test('should handle save errors gracefully', async () => {
      // Mock fs.writeFile to throw error
      const originalWriteFile = require('fs').promises.writeFile;
      require('fs').promises.writeFile = vi.fn().mockRejectedValue(new Error('Disk full'));

      // Should not throw error when saving fails
      await expect(notificationManager.saveNotifications()).resolves.not.toThrow();

      // Restore original writeFile
      require('fs').promises.writeFile = originalWriteFile;
    });
  });
});

// ---------------------------------------------------------------------------
// Email escalation tests — use a standalone describe so we can build custom
// engine mocks without touching the shared beforeEach/afterEach above.
// ---------------------------------------------------------------------------

function makeEscalationEngine({
  escalationEnabled = false,
  levels = ['error'],
  recipientRole = 'admin',
  mailEnabled = true,
  providerName = 'smtp',
  from = 'wiki@example.com',
  adminUsers = [{ username: 'jim', email: 'jim@example.com', roles: ['admin'] }],
  sendTo = vi.fn().mockResolvedValue(undefined),
  dataDir = ''
} = {}) {
  const configManager = {
    getProperty: vi.fn((key, defaultValue) => {
      if (key === 'ngdpbase.notifications.dir') return dataDir;
      if (key === 'ngdpbase.notifications.file') return 'notifications.json';
      if (key === 'ngdpbase.notifications.auto-save-interval') return 60000;
      if (key === 'ngdpbase.notifications.escalation.enabled') return escalationEnabled;
      if (key === 'ngdpbase.notifications.escalation.levels') return levels;
      if (key === 'ngdpbase.notifications.escalation.recipient-role') return recipientRole;
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn((key, defaultValue) => {
      if (key === 'ngdpbase.notifications.dir') return dataDir;
      return defaultValue;
    })
  };

  const emailManager = {
    isEnabled: vi.fn().mockReturnValue(mailEnabled),
    getProviderName: vi.fn().mockReturnValue(providerName),
    getFrom: vi.fn().mockReturnValue(from),
    sendTo
  };

  const userManager = {
    searchUsers: vi.fn().mockResolvedValue(adminUsers)
  };

  return {
    engine: {
      getManager: vi.fn((name) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'EmailManager') return emailManager;
        if (name === 'UserManager') return userManager;
        return undefined;
      })
    },
    emailManager,
    userManager,
    configManager
  };
}

describe('NotificationManager — email escalation', () => {
  let tempDir: string;
  let testCounter = 0;

  beforeEach(async () => {
    testCounter++;
    tempDir = path.join(__dirname, 'temp', `esc-${Date.now()}-${testCounter}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // -- Startup validation --

  test('validateEscalationConfig: escalation enabled but mail disabled → warn', async () => {
    const { engine, configManager } = makeEscalationEngine({ dataDir: tempDir, escalationEnabled: true, mailEnabled: false });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    const loggerInstance = (mgr as any).logger;
    expect(loggerInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining('ngdpbase.mail.enabled=false')
    );
    await mgr.shutdown();
  });

  test('validateEscalationConfig: escalation enabled + mail enabled but provider console → warn', async () => {
    const { engine } = makeEscalationEngine({ dataDir: tempDir, escalationEnabled: true, providerName: 'console', from: 'wiki@example.com' });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    const loggerInstance = (mgr as any).logger;
    expect(loggerInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining('"console"')
    );
    await mgr.shutdown();
  });

  test('validateEscalationConfig: all prerequisites met → info log', async () => {
    const { engine } = makeEscalationEngine({ dataDir: tempDir, escalationEnabled: true });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    const loggerInstance = (mgr as any).logger;
    expect(loggerInstance.info).toHaveBeenCalledWith(
      expect.stringContaining('Email escalation active'),
      expect.anything(),
      expect.anything()
    );
    await mgr.shutdown();
  });

  // -- Runtime escalation --

  test('escalation disabled (default) → sendTo not called', async () => {
    const sendTo = vi.fn().mockResolvedValue(undefined);
    const { engine } = makeEscalationEngine({ dataDir: tempDir, escalationEnabled: false, sendTo });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    await mgr.createNotification({ level: 'error', title: 'Oops', message: 'Bad thing' });
    // allow fire-and-forget to settle
    await new Promise(r => setTimeout(r, 20));

    expect(sendTo).not.toHaveBeenCalled();
    await mgr.shutdown();
  });

  test('level not in escalation list → sendTo not called', async () => {
    const sendTo = vi.fn().mockResolvedValue(undefined);
    const { engine } = makeEscalationEngine({ dataDir: tempDir, escalationEnabled: true, levels: ['error'], sendTo });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    await mgr.createNotification({ level: 'info', title: 'FYI', message: 'Just info' });
    await new Promise(r => setTimeout(r, 20));

    expect(sendTo).not.toHaveBeenCalled();
    await mgr.shutdown();
  });

  test('error notification + escalation enabled → sendTo called for each admin with email', async () => {
    const sendTo = vi.fn().mockResolvedValue(undefined);
    const { engine } = makeEscalationEngine({
      dataDir: tempDir,
      escalationEnabled: true,
      sendTo,
      adminUsers: [
        { username: 'jim', email: 'jim@example.com', roles: ['admin'] },
        { username: 'alice', email: 'alice@example.com', roles: ['admin'] }
      ]
    });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    await mgr.createNotification({ level: 'error', title: 'Disk full', message: 'Storage at 100%' });
    await new Promise(r => setTimeout(r, 20));

    expect(sendTo).toHaveBeenCalledTimes(2);
    expect(sendTo).toHaveBeenCalledWith('jim@example.com', expect.stringContaining('[ERROR]'), expect.any(String), expect.any(String));
    expect(sendTo).toHaveBeenCalledWith('alice@example.com', expect.stringContaining('[ERROR]'), expect.any(String), expect.any(String));
    await mgr.shutdown();
  });

  test('mail not enabled at runtime → no send', async () => {
    const sendTo = vi.fn().mockResolvedValue(undefined);
    const { engine } = makeEscalationEngine({ dataDir: tempDir, escalationEnabled: true, mailEnabled: false, sendTo });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    await mgr.createNotification({ level: 'error', title: 'Boom', message: 'Error' });
    await new Promise(r => setTimeout(r, 20));

    expect(sendTo).not.toHaveBeenCalled();
    await mgr.shutdown();
  });

  test('no admin users with email → no send, no throw', async () => {
    const sendTo = vi.fn().mockResolvedValue(undefined);
    const { engine } = makeEscalationEngine({
      dataDir: tempDir,
      escalationEnabled: true,
      sendTo,
      adminUsers: [{ username: 'nomail', email: '', roles: ['admin'] }]
    });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    await expect(mgr.createNotification({ level: 'error', title: 'Boom', message: 'Error' })).resolves.toBeDefined();
    await new Promise(r => setTimeout(r, 20));

    expect(sendTo).not.toHaveBeenCalled();
    await mgr.shutdown();
  });

  test('sendTo rejects → notification still created (fire-and-forget)', async () => {
    const sendTo = vi.fn().mockRejectedValue(new Error('SMTP timeout'));
    const { engine } = makeEscalationEngine({ dataDir: tempDir, escalationEnabled: true, sendTo });
    const mgr = new NotificationManager(engine as any);
    await mgr.initialize({});

    const id = await mgr.createNotification({ level: 'error', title: 'Fail', message: 'Error' });
    await new Promise(r => setTimeout(r, 20));

    expect(id).toMatch(/^notification_\d+$/);
    expect(mgr.getAllNotifications()).toHaveLength(1);
    await mgr.shutdown();
  });
});
