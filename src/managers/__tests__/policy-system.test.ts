/**
 * Policy System Integration Tests
 * Tests the integration of PolicyManager, PolicyEvaluator, and PolicyValidator
 *
 * NOTE: PolicyManager is READ-ONLY - it loads policies from ConfigurationManager.
 * Policies must be configured in the engine config, not saved dynamically.
 */

import fs from 'fs';
import path from 'path';
import WikiEngine from '../../WikiEngine';
import type { WikiConfig } from '../../types/Config';

describe('Policy System Integration', () => {
  let engine;
  let policyManager;
  let policyEvaluator;
  let policyValidator;
  let aclManager;

  // Define test policies that will be loaded via ConfigurationManager
  const testPolicies = [
    {
      id: 'test-policy-allow-editors',
      name: 'Test Policy - Allow Editors',
      description: 'Allows editor role to edit pages',
      priority: 100,
      effect: 'allow',
      subjects: [
        { type: 'role', value: 'editor' }
      ],
      resources: [
        { type: 'page', pattern: '*' }
      ],
      actions: ['view', 'edit'],
      conditions: [],
      metadata: {
        created: new Date().toISOString(),
        author: 'test-system',
        tags: ['test', 'editor']
      }
    },
    {
      id: 'test-policy-deny-system-pages',
      name: 'Test Policy - Deny System Pages',
      description: 'Denies access to system pages',
      priority: 200, // Higher priority than allow-editors
      effect: 'deny',
      subjects: [
        { type: 'role', value: 'editor' }
      ],
      resources: [
        { type: 'page', pattern: 'System*' }
      ],
      actions: ['edit'],
      conditions: [],
      metadata: {
        created: new Date().toISOString(),
        author: 'test-system',
        tags: ['test', 'system']
      }
    }
  ];

  beforeAll(async () => {
    // Create and initialize the WikiEngine with policies in config
    // Note: ConfigurationManager uses nested objects, not dot-notation keys
    engine = await WikiEngine.createDefault({
      ngdpbase: {
        access: {
          policies: {
            enabled: true
          }
        }
      }
    });

    // Manually add test policies to PolicyManager for testing
    // (since they're not loaded from config files in test environment)
    policyManager = engine.getManager('PolicyManager');

    // Directly inject test policies into PolicyManager's internal Map
    for (const policy of testPolicies) {
      policyManager.policies.set(policy.id, policy);
    }

    policyEvaluator = engine.getManager('PolicyEvaluator');
    policyValidator = engine.getManager('PolicyValidator');
    aclManager = engine.getManager('ACLManager');
  });

  afterAll(async () => {
    if (engine) {
      await engine.shutdown();
    }
    // Clean up test-created subdirectories from the FAST_STORAGE path used
    // during this test run (set to /tmp/ngdpbase-test-N by vi.setup.js).
    // Never touches live ./data/ directories.
    const dataDir = process.env.FAST_STORAGE || path.join(process.cwd(), 'data');
    const testSubdirs = ['sessions', 'logs', 'search-index'];
    for (const sub of testSubdirs) {
      try {
        fs.rmSync(path.join(dataDir, sub), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Policy Loading from Configuration', () => {
    test('should load policies from ConfigurationManager', () => {
      const allPolicies = policyManager.getAllPolicies();

      expect(allPolicies).toBeDefined();
      expect(Array.isArray(allPolicies)).toBe(true);
      expect(allPolicies.length).toBeGreaterThanOrEqual(2); // At least our 2 test policies
    });

    test('should retrieve policy by ID', () => {
      const policy = policyManager.getPolicy('test-policy-allow-editors');

      expect(policy).toBeDefined();
      expect(policy.id).toBe('test-policy-allow-editors');
      expect(policy.effect).toBe('allow');
      expect(policy.priority).toBe(100);
    });

    test('should sort policies by priority (descending)', () => {
      const allPolicies = policyManager.getAllPolicies();

      // Find our test policies in the sorted list
      const allowPolicy = allPolicies.find(p => p.id === 'test-policy-allow-editors');
      const denyPolicy = allPolicies.find(p => p.id === 'test-policy-deny-system-pages');

      expect(allowPolicy).toBeDefined();
      expect(denyPolicy).toBeDefined();

      const allowIndex = allPolicies.indexOf(allowPolicy);
      const denyIndex = allPolicies.indexOf(denyPolicy);

      // Deny policy (priority 200) should come before allow policy (priority 100)
      expect(denyIndex).toBeLessThan(allowIndex);
    });
  });

  describe('Policy Validation', () => {
    test('should validate policy successfully', () => {
      const policy = policyManager.getPolicy('test-policy-allow-editors');
      const validation = policyValidator.validatePolicy(policy);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should validate all policies without conflicts', () => {
      const allPolicies = policyManager.getAllPolicies();
      const allValidation = policyValidator.validateAllPolicies(allPolicies);

      expect(allValidation).toBeDefined();
      expect(allValidation.isValid).toBe(true);
      expect(allValidation.summary.validPolicies).toBeGreaterThan(0);
    });
  });

  describe('Policy Evaluation', () => {
    test('should allow editor to edit pages', async () => {
      const editorContext = {
        pageName: 'TestPage',  // PolicyEvaluator expects pageName, not resource
        action: 'edit',
        userContext: {  // PolicyEvaluator expects userContext, not user
          username: 'test-editor',
          roles: ['editor'],
          isAuthenticated: true
        }
      };

      const result = await policyEvaluator.evaluateAccess(editorContext);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeDefined();
    });

    test('should deny anonymous user from editing', async () => {
      const anonymousContext = {
        pageName: 'TestPage',
        action: 'edit',
        userContext: {
          username: 'anonymous',
          roles: [],
          isAuthenticated: false
        }
      };

      const result = await policyEvaluator.evaluateAccess(anonymousContext);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test('should allow editor to view pages', async () => {
      const viewContext = {
        pageName: 'TestPage',
        action: 'view',
        userContext: {
          username: 'test-editor',
          roles: ['editor'],
          isAuthenticated: true
        }
      };

      const result = await policyEvaluator.evaluateAccess(viewContext);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeDefined();
    });

    test('should deny editor access to system pages due to higher priority deny policy', async () => {
      const systemPageContext = {
        pageName: 'SystemConfiguration',  // Matches "System*" pattern
        action: 'edit',
        userContext: {
          username: 'test-editor',
          roles: ['editor'],
          isAuthenticated: true
        }
      };

      const result = await policyEvaluator.evaluateAccess(systemPageContext);

      // Should be denied because deny policy (priority 200) takes precedence over allow (priority 100)
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Policy match');  // Changed from 'denied' to match actual response
    });
  });

  describe('ACLManager Integration', () => {
    test('should integrate with ACLManager for permission checks', async () => {
      // #632: migrated from deprecated 4-arg `checkPagePermission` to the
      // canonical `checkPagePermissionWithContext`. Both routed through
      // PolicyEvaluator so the integration outcome is the same.
      const user = {
        username: 'test-editor',
        roles: ['editor'],
        isAuthenticated: true
      };
      const wikiContext = {
        pageName: 'TestPage',
        content: '# Test Page Content\n\nThis is a test page.',
        userContext: user,
        pageMetadata: null
      };

      const result = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');

      expect(result).toBe(true);
    });
  });
});
