import BaseManager from './BaseManager.js';
import type { Policy } from '../types/Policy.js';
import logger from '../utils/logger.js';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';

// #1431: Policy is declared once, in src/types/Policy.ts.

/**
 * Type guard to check if an object is a valid Policy
 */
function isPolicy(obj: unknown): obj is Policy {
  return typeof obj === 'object' && obj !== null && 'id' in obj && typeof (obj as Policy).id === 'string';
}

/**
 * PolicyManager - Manages the lifecycle of access control policies.
 *
 * It loads, stores, and provides access to all defined policies.
 * Policies are loaded from ConfigurationManager and cached in memory
 * for efficient access during permission checks.
 *
 * @class PolicyManager
 * @extends BaseManager
 *
 * @property {Map<string, Policy>} policies - Map of policy ID to policy object
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link PolicyEvaluator} for policy evaluation
 * @see {@link ACLManager} for access control
 *
 * @example
 * const policyManager = engine.getManager('PolicyManager');
 * const policy = policyManager.getPolicy('allow-all-read');
 * const allPolicies = policyManager.getAllPolicies(); // sorted by priority
 */
class PolicyManager extends BaseManager {
  private policies: Map<string, Policy> = new Map();

  /**
   * Creates a new PolicyManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initializes the PolicyManager by loading policies from the ConfigurationManager.
   *
   * Reads the policy configuration and loads all defined policies into memory.
   * Policies must be enabled via 'ngdpbase.access.policies.enabled' configuration.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available
   *
   * @example
   * await policyManager.initialize();
   * console.log('Policies loaded');
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PolicyManager requires ConfigurationManager to be initialized.');
    }

    const policiesEnabled = configManager.getProperty('ngdpbase.access.policies.enabled', false) as boolean;
    if (!policiesEnabled) {
      logger.info('PolicyManager is disabled via configuration.');
      return;
    }

    // Read policies directly from the config object, not a file
    const policies = configManager.getProperty('ngdpbase.access.policies', []);
    if (!Array.isArray(policies)) {
      logger.error('Policies configuration (ngdpbase.access.policies) is invalid or not an array.');
      return;
    }

    this.policies.clear();
    for (const policy of policies) {
      if (isPolicy(policy)) {
        this.policies.set(policy.id, policy);
      }
    }
    logger.info(`📋 Loaded ${this.policies.size} policies from ConfigurationManager.`);
  }

  /**
   * Retrieves a policy by its unique ID.
   *
   * @param {string} id - The ID of the policy
   * @returns {Policy | undefined} The policy object, or undefined if not found
   *
   * @example
   * const policy = policyManager.getPolicy('allow-all-read');
   * if (policy) console.log('Found policy:', policy.id);
   */
  getPolicy(id: string): Policy | undefined {
    return this.policies.get(id);
  }

  /**
   * Returns all loaded policies, sorted by priority (descending).
   *
   * Policies with higher priority values are returned first.
   * Policies without a priority are treated as having priority 0.
   *
   * @returns {Policy[]} An array of all policy objects, sorted by priority
   *
   * @example
   * const policies = policyManager.getAllPolicies();
   * console.log('Highest priority:', policies[0]?.id);
   */
  getAllPolicies(): Policy[] {
    return Array.from(this.policies.values()).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
}

export default PolicyManager;
