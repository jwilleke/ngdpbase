import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import { declaredSubjectAttributes, subjectAttributesProblems } from '../utils/policyAttributes.js';
import { SENSITIVE_USER_FIELDS } from '../types/User.js';
import { conditionProblems, declaredResourceTypes, SUBJECT_MATCHERS, VALUELESS_SUBJECT_TYPES } from './PolicyEvaluator.js';

// CJS/ESM interop: Ajv lacks "exports" field; NodeNext treats default import as module namespace.
// Cast to a constructable/callable type to work around NodeNext namespace typing restrictions.
interface AjvLike {
  compile(schema: unknown): ValidateFunction;
  validate(schema: unknown, data: unknown): boolean;
  errors: ErrorObject[] | null;
}
 
const AjvCtor = Ajv as unknown as new (...args: unknown[]) => AjvLike;
 
const applyFormats = addFormats as unknown as (ajv: AjvLike) => void;

/**
 * Subject type: one the evaluator matches, `role`, `job` (#1999), `authenticated` or `anyone` (#2261) —
 * `SUBJECT_MATCHERS` in PolicyEvaluator, not listed here. A policy naming any
 * other type would grant nothing, so it is refused.
 */
type SubjectType = string;

/**
 * Resource type: one of the types declared in `ngdpbase.access.resource-types`
 * (#1504), read from configuration, not listed here.
 */
type ResourceType = string;

/**
 * Action type enumeration
 */
type ActionType = 'view' | 'edit' | 'delete' | 'upload' | 'download' | 'admin' | 'create' | 'update';

/**
 * Policy effect type
 */
type PolicyEffect = 'allow' | 'deny';

/**
 * Condition operator types
 */
type ConditionOperator = '==' | '===' | '!=' | '!==' | '>' | '>=' | '<' | '<=' | 'in' | 'contains' | 'regex';

/**
 * Condition type enumeration
 */
type ConditionType = 'time-range' | 'ip-range' | 'user-attribute' | 'context-attribute' | 'environment' | 'session-attribute' | 'custom';

/**
 * Policy subject definition
 */
interface PolicySubject {
  type: SubjectType;
  value?: string | number | boolean;
  key?: string;
}

/**
 * Policy resource definition
 */
interface PolicyResource {
  type: ResourceType;
  value?: string | number;
  pattern?: string;
}

/**
 * Policy condition definition
 */
interface PolicyCondition {
  type: ConditionType;
  key?: string;
  value?: string | number | boolean | unknown[];
  operator?: ConditionOperator;
  startTime?: string;
  endTime?: string;
  ranges?: string[];
}

/**
 * Policy metadata
 */
interface PolicyMetadata {
  created?: string;
  modified?: string;
  author?: string;
  tags?: string[];
  version?: string;
}

/**
 * Complete policy definition
 */
interface Policy {
  id: string;
  name: string;
  description?: string;
  priority: number;
  effect: PolicyEffect;
  subjects: PolicySubject[];
  resources: PolicyResource[];
  actions: ActionType[];
  conditions: PolicyCondition[];
  metadata?: PolicyMetadata;
}

/**
 * Validation error structure
 */
interface ValidationError {
  type: 'schema' | 'business' | 'semantic' | 'conflict';
  field: string;
  message: string;
  details?: unknown;
}

/**
 * Validation warning structure
 */
interface ValidationWarning {
  type: 'priority' | 'scope' | 'conditions' | 'conflict';
  field?: string;
  message: string;
  details?: unknown;
}

/**
 * Policy validation result
 */
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Conflict detection result
 */
interface ConflictResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * All policies validation result
 */
interface AllPoliciesValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    totalPolicies: number;
    validPolicies: number;
    conflicts: number;
  };
}

/**
 * Validation statistics
 */
interface ValidationStatistics {
  cacheSize: number;
  schemaLoaded: boolean;
  validatorReady: boolean;
}

/**
 * Policy schema definition (JSON Schema)
 */
interface PolicySchema {
  type: string;
  required: string[];
  properties: Record<string, unknown>;
}

/** #2284: `authenticated` and `anyone` take neither a value nor a key; say which one to remove. */
function valuelessSubjectProblem(subject: PolicySubject | null | undefined): string | null {
  if (!subject || !VALUELESS_SUBJECT_TYPES.includes(subject.type)) return null;
  if (subject.value !== undefined) return `'${subject.type}' takes no value; remove it`;
  if (subject.key !== undefined) return `'${subject.type}' takes no key; remove it`;
  return null;
}

/**
 * PolicyValidator - Validates policy schemas and detects conflicts
 * Ensures policy integrity and prevents conflicting rules
 */
class PolicyValidator extends BaseManager {
  private configManager: ConfigurationManager | null;
  private schemaValidator: AjvLike | null;
  private policySchema: PolicySchema | null;
  private schemaValidatorCompiled: ValidateFunction | null;
  private validationCache: Map<string, ValidationResult>;

  constructor(engine: WikiEngine) {
    super(engine);
    this.configManager = null;
    this.schemaValidator = null;
    this.policySchema = null;
    this.schemaValidatorCompiled = null;
    this.validationCache = new Map();
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // #1431 step 10: the policies are read through ConfigurationManager, live.
    this.configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager') ?? null;
    if (!this.configManager) {
      throw new Error('PolicyValidator requires ConfigurationManager to be registered');
    }

    // Initialize JSON schema validator
    this.schemaValidator = new AjvCtor({
      allErrors: true,
      verbose: true,
      strict: false
    });
    applyFormats(this.schemaValidator);

    // Load policy schema
    this.loadPolicySchema();

    logger.info('PolicyValidator initialized');
  }

  /**
   * Load JSON schema for policy validation
   *
   * @returns {void}
   */
  loadPolicySchema(): void {
    try {
      // Define comprehensive policy schema
      this.policySchema = {
        type: 'object',
        required: ['id', 'name', 'effect', 'subjects', 'resources', 'actions'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]+$',
            minLength: 1,
            maxLength: 100
          },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 200
          },
          description: {
            type: 'string',
            maxLength: 1000
          },
          priority: {
            type: 'number',
            minimum: 0,
            maximum: 1000,
            default: 50
          },
          effect: {
            type: 'string',
            enum: ['allow', 'deny']
          },
          subjects: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  // #1999: only the types the evaluator matches.
                  enum: Object.keys(SUBJECT_MATCHERS)
                },
                value: {
                  type: ['string', 'number', 'boolean']
                },
                key: {
                  type: 'string'
                }
              },
              // #2261: `role` and `job` need a value; `authenticated` and `anyone` take none
              // (a value on them is refused in validateBusinessLogic, with a message that says so).
              oneOf: [
                { required: ['type', 'value'], properties: { type: { not: { enum: VALUELESS_SUBJECT_TYPES } } } },
                { required: ['type', 'key', 'value'], properties: { type: { not: { enum: VALUELESS_SUBJECT_TYPES } } } },
                { properties: { type: { enum: VALUELESS_SUBJECT_TYPES } } }
              ]
            }
          },
          resources: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  // #1504: the declared resource types, read through ConfigurationManager.
                  enum: [...declaredResourceTypes((key, def) => this.configManager?.getProperty(key, def) ?? def)]
                },
                value: {
                  type: ['string', 'number']
                },
                pattern: {
                  type: 'string'
                }
              },
              oneOf: [{ required: ['type', 'value'] }, { required: ['type', 'pattern'] }]
            }
          },
          actions: {
            type: 'array',
            minItems: 1,
            // #2278: the actions are permission names (`page-edit`), not the old fixed verbs, so
            // every shipped policy was refused by the enum that stood here.
            items: { type: 'string', minLength: 1 }
          },
          // #2255, #2261: the shape of the tree (operators, depth, types) is
          // checked by conditionProblems, which can say what to change.
          condition: { type: 'object' },
          conditions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['time-range', 'ip-range', 'user-attribute', 'context-attribute', 'environment', 'session-attribute', 'custom']
                },
                key: { type: 'string' },
                value: { type: ['string', 'number', 'boolean', 'array'] },
                operator: {
                  type: 'string',
                  enum: ['==', '===', '!=', '!==', '>', '>=', '<', '<=', 'in', 'contains', 'regex']
                },
                // Accept RFC 3339 date-time, RFC 3339 time (HH:MM:SS), or HH:MM[(:SS)][TZ]
                startTime: {
                  type: 'string',
                  anyOf: [{ format: 'date-time' }, { format: 'time' }, { pattern: '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?(Z|[+-][0-2]\\d:[0-5]\\d)?$' }]
                },
                endTime: {
                  type: 'string',
                  anyOf: [{ format: 'date-time' }, { format: 'time' }, { pattern: '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?(Z|[+-][0-2]\\d:[0-5]\\d)?$' }]
                },
                ranges: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          },
          metadata: {
            type: 'object',
            properties: {
              created: { type: 'string', format: 'date-time' },
              modified: { type: 'string', format: 'date-time' },
              author: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              version: { type: 'string' }
            }
          }
        }
      };

      // Compile the schema
      if (this.schemaValidator) {
        this.schemaValidatorCompiled = this.schemaValidator.compile(this.policySchema);
      }

      logger.info('Policy schema loaded and compiled');
    } catch (error) {
      logger.error('Error loading policy schema:', error);
      this.policySchema = null;
    }
  }

  /**
   * Validate a single policy
   *
   * @param {Policy} policy - Policy to validate
   * @returns {ValidationResult} Validation result
   */
  validatePolicy(policy: Policy): ValidationResult {
    const errors: ValidationError[] = [];
    const cacheKey = `policy_${policy.id}`;

    // Check cache first
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    // Schema validation
    if (this.schemaValidatorCompiled && !this.schemaValidatorCompiled(policy)) {
      errors.push(...this.formatSchemaErrors(this.schemaValidatorCompiled.errors || []));
    }

    // Business logic validation
    errors.push(...this.validateBusinessLogic(policy));

    // Semantic validation
    errors.push(...this.validateSemantics(policy));

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings: this.generateWarnings(policy)
    };

    // Cache result
    this.validationCache.set(cacheKey, result);

    return result;
  }

  /**
   * The problems in a list of policies, each as `'<id>': <message>` (#2278):
   * the schema's, unknown action names, then `conditionProblems`' (the boot warning's own messages).
   * Used on save and on load in Admin → Configuration. Empty when all are fine.
   *
   * @param {unknown} policies - The value of `ngdpbase.access.policies`
   * @returns {string[]} One line per problem
   */
  policyProblems(policies: unknown): string[] {
    if (!Array.isArray(policies)) return ['the policies must be a list'];
    // #2278: an action must be a defined permission (add-ons' included, the config layer merges
    // them), else a mistyped deny never applies. `*` is the evaluator's wildcard.
    const definitions = this.configManager?.getProperty('ngdpbase.permissions.definitions', null) as Record<string, unknown> | null;
    if (!definitions || typeof definitions !== 'object' || Object.keys(definitions).length === 0) {
      return ['the permission definitions (ngdpbase.permissions.definitions) could not be read, so the policies\' actions cannot be checked'];
    }
    const resourceTypes = this.configManager?.getProperty('ngdpbase.access.resource-types', null) as Record<string, { attributes?: Record<string, { type?: string }> }> | null;
    const subjectAttributes = declaredSubjectAttributes(this.configManager?.getProperty('ngdpbase.access.subject-attributes', null));
    return policies.flatMap((policy: unknown, index) => {
      const id = typeof (policy as { id?: unknown } | null)?.id === 'string' ? (policy as { id: string }).id : `#${index + 1}`;
      const schema = this.schemaValidatorCompiled && !this.schemaValidatorCompiled(policy)
        ? this.formatSchemaErrors(this.schemaValidatorCompiled.errors || []).map((e) => `${e.field} ${e.message}`.trim())
        : [];
      const condition = policy && typeof policy === 'object' ? conditionProblems((policy as { condition?: unknown }).condition, resourceTypes?.page?.attributes ?? {}, subjectAttributes) : [];
      const actions = Array.isArray((policy as { actions?: unknown } | null)?.actions) ? (policy as { actions: unknown[] }).actions : [];
      const unknown = actions.filter((a) => typeof a === 'string' && a !== '*' && !Object.prototype.hasOwnProperty.call(definitions, a))
        .map((a) => `action '${String(a)}' is not a defined permission; use a name from ngdpbase.permissions.definitions (add-on permissions included), or '*'`);
      const subjects = Array.isArray((policy as { subjects?: unknown } | null)?.subjects) ? (policy as { subjects: unknown[] }).subjects : [];
      const extra = subjects.map((sub) => valuelessSubjectProblem(sub as PolicySubject)).filter((m): m is string => !!m)
        .map((m) => `subjects: ${m}`);
      return [...schema, ...extra, ...unknown, ...condition].map((message) => `'${id}': ${message}`);
    });
  }

  /**
   * The problems in the value of `ngdpbase.access.subject-attributes` (#2287):
   * `id` and `aal` declared with another meaning (refused; the built-in is kept
   * regardless), a bad type or source, a sensitive account field. For save and
   * load in Admin → Configuration, and the boot warning. Empty when fine.
   *
   * @param {unknown} declared - The value of `ngdpbase.access.subject-attributes`
   * @returns {string[]} One line per problem
   */
  subjectAttributeProblems(declared: unknown): string[] {
    return subjectAttributesProblems(declared, SENSITIVE_USER_FIELDS);
  }

  /**
   * Format JSON schema validation errors
   *
   * @param {ErrorObject[]} schemaErrors - Schema validation errors
   * @returns {ValidationError[]} Formatted errors
   */
  formatSchemaErrors(schemaErrors: ErrorObject[]): ValidationError[] {
    return schemaErrors.map((error) => ({
      type: 'schema',

      field: error.instancePath || (error as { dataPath?: string }).dataPath || 'root',
      message: error.message || 'Schema validation error',
      details: error
    }));
  }

  /**
   * Validate business logic rules
   *
   * @param {Policy} policy - Policy to validate
   * @returns {ValidationError[]} Business logic errors
   */
  validateBusinessLogic(policy: Policy): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for duplicate subjects
    const subjectKeys = new Set<string>();
    policy.subjects.forEach((subject, index) => {
      const valueless = VALUELESS_SUBJECT_TYPES.includes(subject.type);
      const extra = valuelessSubjectProblem(subject);
      if (extra) {
        errors.push({ type: 'business', field: `subjects[${index}]`, message: extra });
      }
      // #2284: a valueless type is one subject whatever extra fields it carries.
      const key = valueless ? subject.type : `${subject.type}:${subject.value || subject.key || ''}`;
      if (subjectKeys.has(key)) {
        errors.push({
          type: 'business',
          field: `subjects[${index}]`,
          message: 'Duplicate subject criteria found'
        });
      }
      subjectKeys.add(key);
    });

    // Check for duplicate resources
    const resourceKeys = new Set<string>();
    policy.resources.forEach((resource, index) => {
      const key = `${resource.type}:${resource.value || resource.pattern}`;
      if (resourceKeys.has(key)) {
        errors.push({
          type: 'business',
          field: `resources[${index}]`,
          message: 'Duplicate resource criteria found'
        });
      }
      resourceKeys.add(key);
    });

    // Check for duplicate actions
    const actionSet = new Set(policy.actions);
    if (actionSet.size !== policy.actions.length) {
      errors.push({
        type: 'business',
        field: 'actions',
        message: 'Duplicate actions found'
      });
    }

    // Validate priority range
    if (policy.priority < 0 || policy.priority > 1000) {
      errors.push({
        type: 'business',
        field: 'priority',
        message: 'Priority must be between 0 and 1000'
      });
    }

    return errors;
  }

  /**
   * Validate semantic correctness
   *
   * @param {Policy} policy - Policy to validate
   * @returns {ValidationError[]} Semantic errors
   */
  validateSemantics(policy: Policy): ValidationError[] {
    const errors: ValidationError[] = [];

    // #2255: a condition may read only declared attributes, of matching types.
    const resourceTypes = this.configManager?.getProperty('ngdpbase.access.resource-types', null) as Record<string, { attributes?: Record<string, { type?: string }> }> | null;
    const subjectAttributes = declaredSubjectAttributes(this.configManager?.getProperty('ngdpbase.access.subject-attributes', null));
    for (const message of conditionProblems((policy as { condition?: unknown }).condition, resourceTypes?.page?.attributes ?? {}, subjectAttributes)) {
      errors.push({ type: 'semantic', field: 'condition', message });
    }

    // Check for potentially conflicting conditions
    policy.conditions.forEach((condition, index) => {
      if (condition.type === 'time-range' && (!condition.startTime || !condition.endTime)) {
        errors.push({
          type: 'semantic',
          field: `conditions[${index}]`,
          message: 'Time range condition must have both startTime and endTime'
        });
      }

      if (condition.type === 'ip-range' && (!condition.ranges || condition.ranges.length === 0)) {
        errors.push({
          type: 'semantic',
          field: `conditions[${index}]`,
          message: 'IP range condition must have ranges defined'
        });
      }

      if ((condition.type === 'user-attribute' || condition.type === 'context-attribute') && (!condition.key || condition.operator === undefined || condition.value === undefined)) {
        errors.push({
          type: 'semantic',
          field: `conditions[${index}]`,
          message: 'Attribute condition must have key, operator, and value'
        });
      }
    });

    // Check for logical inconsistencies
    if (policy.effect === 'deny' && policy.actions.includes('admin')) {
      errors.push({
        type: 'semantic',
        field: 'effect',
        message: 'Deny policies should not include admin actions'
      });
    }

    return errors;
  }

  /**
   * Generate warnings for potential issues
   *
   * @param {Policy} policy - Policy to check
   * @returns {ValidationWarning[]} Generated warnings
   */
  generateWarnings(policy: Policy): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Warn about very high or low priorities
    if (policy.priority > 900) {
      warnings.push({
        type: 'priority',
        message: 'Very high priority may override important security policies'
      });
    }

    if (policy.priority < 10) {
      warnings.push({
        type: 'priority',
        message: 'Very low priority may be overridden by other policies'
      });
    }

    // Warn about overly broad patterns
    policy.resources.forEach((resource, index) => {
      if (resource.pattern === '*' || resource.pattern === '**') {
        warnings.push({
          type: 'scope',
          field: `resources[${index}]`,
          message: 'Very broad resource pattern may grant excessive permissions'
        });
      }
    });

    // Warn about policies without conditions
    if (policy.conditions.length === 0) {
      warnings.push({
        type: 'conditions',
        message: 'Policy has no conditions - consider adding time or context restrictions'
      });
    }

    return warnings;
  }

  /**
   * Validate all policies for conflicts
   *
   * @param {Policy[] | null} policies - Policies to validate (null = the policies in force)
   * @returns {AllPoliciesValidationResult} Validation result
   */
  validateAllPolicies(policies: Policy[] | null = null): AllPoliciesValidationResult {
    if (!policies) {
      // #1431 step 14b: the STORED entries, read through their owner. The
      // validator checks what was written — every entry, including a
      // duplicate id or one written while policies are switched off — so it
      // does not ask the PDP, which interprets them.
      const stored = this.configManager?.getProperty('ngdpbase.access.policies', []);
      policies = (Array.isArray(stored) ? stored : []) as Policy[];
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for duplicate IDs
    const ids = new Set<string>();
    policies.forEach((policy) => {
      if (ids.has(policy.id)) {
        errors.push({
          type: 'conflict',
          field: 'id',
          message: `Duplicate policy ID: ${policy.id}`
        });
      }
      ids.add(policy.id);
    });

    // Check for conflicting policies
    const conflicts = this.detectPolicyConflicts(policies);
    errors.push(...conflicts.errors);
    warnings.push(...conflicts.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalPolicies: policies.length,
        validPolicies: policies.length - errors.length,
        conflicts: conflicts.errors.length
      }
    };
  }

  /**
   * Detect conflicting policies
   *
   * @param {Policy[]} policies - Policies to check
   * @returns {ConflictResult} Conflict detection result
   */
  detectPolicyConflicts(policies: Policy[]): ConflictResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Group policies by overlapping criteria
    const policyGroups = this.groupPoliciesByOverlap(policies);

    policyGroups.forEach((group) => {
      if (group.length < 2) return;

      // Check for same subjects and resources but different effects
      const allowPolicies = group.filter((p) => p.effect === 'allow');
      const denyPolicies = group.filter((p) => p.effect === 'deny');

      if (allowPolicies.length > 0 && denyPolicies.length > 0) {
        // Find highest priority policy
        const highestPriority = Math.max(...group.map((p) => p.priority));
        const highestPolicies = group.filter((p) => p.priority === highestPriority);

        if (highestPolicies.length === 1) {
          const winner = highestPolicies[0];
          const losers = group.filter((p) => p.id !== winner.id);

          warnings.push({
            type: 'conflict',
            message: `Policy ${winner.id} (${winner.effect}) overrides ${losers.map((p) => p.id).join(', ')} due to higher priority`,
            details: {
              winner: winner.id,
              losers: losers.map((p) => p.id),
              priority: winner.priority
            }
          });
        } else {
          errors.push({
            type: 'conflict',
            field: 'priority',
            message: `Multiple policies with same highest priority: ${highestPolicies.map((p) => p.id).join(', ')}`,
            details: {
              policies: highestPolicies.map((p) => p.id),
              priority: highestPriority
            }
          });
        }
      }
    });

    return { errors, warnings };
  }

  /**
   * Group policies by overlapping criteria
   *
   * @param {Policy[]} policies - Policies to group
   * @returns {Policy[][]} Grouped policies
   */
  groupPoliciesByOverlap(policies: Policy[]): Policy[][] {
    const groups: Policy[][] = [];

    policies.forEach((policy) => {
      let foundGroup = false;

      for (const group of groups) {
        if (this.policiesOverlap(policy, group[0])) {
          group.push(policy);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.push([policy]);
      }
    });

    return groups;
  }

  /**
   * Check if two policies have overlapping criteria
   *
   * @param {Policy} policy1 - First policy
   * @param {Policy} policy2 - Second policy
   * @returns {boolean} True if policies overlap
   */
  policiesOverlap(policy1: Policy, policy2: Policy): boolean {
    // Check subject overlap
    const subjectOverlap = this.hasSubjectOverlap(policy1.subjects, policy2.subjects);
    if (!subjectOverlap) return false;

    // Check resource overlap
    const resourceOverlap = this.hasResourceOverlap(policy1.resources, policy2.resources);
    if (!resourceOverlap) return false;

    // Check action overlap
    const actionOverlap = this.hasActionOverlap(policy1.actions, policy2.actions);
    if (!actionOverlap) return false;

    return true;
  }

  /**
   * Check if subject criteria overlap
   *
   * @param {PolicySubject[]} subjects1 - First subject list
   * @param {PolicySubject[]} subjects2 - Second subject list
   * @returns {boolean} True if subjects overlap
   */
  hasSubjectOverlap(subjects1: PolicySubject[], subjects2: PolicySubject[]): boolean {
    for (const s1 of subjects1) {
      for (const s2 of subjects2) {
        if (this.subjectsMatch(s1, s2)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if resource criteria overlap
   *
   * @param {PolicyResource[]} resources1 - First resource list
   * @param {PolicyResource[]} resources2 - Second resource list
   * @returns {boolean} True if resources overlap
   */
  hasResourceOverlap(resources1: PolicyResource[], resources2: PolicyResource[]): boolean {
    for (const r1 of resources1) {
      for (const r2 of resources2) {
        if (this.resourcesMatch(r1, r2)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if action criteria overlap
   *
   * @param {ActionType[]} actions1 - First action list
   * @param {ActionType[]} actions2 - Second action list
   * @returns {boolean} True if actions overlap
   */
  hasActionOverlap(actions1: ActionType[], actions2: ActionType[]): boolean {
    return actions1.some((action) => actions2.includes(action));
  }

  /**
   * Check if two subjects match
   *
   * @param {PolicySubject} s1 - First subject
   * @param {PolicySubject} s2 - Second subject
   * @returns {boolean} True if subjects match
   */
  subjectsMatch(s1: PolicySubject, s2: PolicySubject): boolean {
    // #2284: `anyone` overlaps every subject; `authenticated` every one but anonymous.
    if (s1.type === 'anyone' || s2.type === 'anyone') return true;
    if (s1.type === 'authenticated' || s2.type === 'authenticated') {
      return s1.type !== 'anonymous' && s2.type !== 'anonymous';
    }
    if (s1.type !== s2.type) return false;

    switch (s1.type) {
    case 'user':
    case 'role':
    case 'group':
    case 'job':
      return s1.value === s2.value;
    case 'attribute':
      return s1.key === s2.key && s1.value === s2.value;
    case 'authenticated':
    case 'anyone':
    case 'anonymous':
    case 'admin':
      return true; // These are global
    default:
      return false;
    }
  }

  /**
   * Check if two resources match
   *
   * @param {PolicyResource} r1 - First resource
   * @param {PolicyResource} r2 - Second resource
   * @returns {boolean} True if resources match
   */
  resourcesMatch(r1: PolicyResource, r2: PolicyResource): boolean {
    if (r1.type !== r2.type) return false;
    // #1504: only a declared resource type matches anything; every declared
    // type (page, system-category) matches by pattern.
    if (!declaredResourceTypes((key, def) => this.configManager?.getProperty(key, def) ?? def).has(r1.type)) return false;
    return this.patternsOverlap((r1.pattern || r1.value) as string, (r2.pattern || r2.value) as string);
  }

  /**
   * Check if two patterns overlap
   *
   * @param {string} pattern1 - First pattern
   * @param {string} pattern2 - Second pattern
   * @returns {boolean} True if patterns overlap
   */
  patternsOverlap(pattern1: string, pattern2: string): boolean {
    if (pattern1 === pattern2) return true;
    if (pattern1 === '*' || pattern2 === '*') return true;

    // Simple overlap detection - could be more sophisticated
    return pattern1.includes('*') || pattern2.includes('*') || pattern1.startsWith(pattern2.split('*')[0]) || pattern2.startsWith(pattern1.split('*')[0]);
  }

  /**
   * Clear validation cache
   *
   * @returns {void}
   */
  clearCache(): void {
    this.validationCache.clear();
  }

  /**
   * Get validation statistics
   *
   * @returns {ValidationStatistics} Current statistics
   */
  getStatistics(): ValidationStatistics {
    return {
      cacheSize: this.validationCache.size,
      schemaLoaded: !!this.policySchema,
      validatorReady: !!this.schemaValidatorCompiled
    };
  }
}

export default PolicyValidator;
