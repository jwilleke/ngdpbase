'use strict';

/**
 * What each role permits, derived from the access policies (#1431).
 *
 * The policies are the only grant path. Each role also used to carry an inline
 * `permissions[]` array in `ngdpbase.roles.definitions`, which the admin pages
 * rendered — a display copy the configuration asked operators to keep matched
 * by hand ([#713](https://github.com/jwilleke/ngdpbase/issues/713)), so the
 * page could state something the evaluator would never do. This derives the
 * same table from the policies instead, so there is one source and nothing to
 * keep in step.
 *
 * __What this answers.__ "What may this role do in general" — it mirrors the
 * evaluator's ROLE matching: an allow policy naming a role grants its actions,
 * a deny policy naming it takes them away, lower priority first. It does not
 * evaluate resource patterns, an agent token's scope ceiling or a share's, so
 * it is a summary for a human reading a table, never an authorisation answer.
 * The only honest allow remains `hasPermission` / `canAccess` with the
 * caller's own subject.
 */

import type ConfigurationManager from '../managers/ConfigurationManager.js';

/** The policy shape this reads. Narrow on purpose: the fields the table needs. */
interface PolicyLike {
  priority?: number;
  effect?: string;
  subjects?: Array<{ type?: string; value?: string }>;
  actions?: string[];
}

/**
 * Role name → the actions its holders are granted.
 *
 * @param configManager - read through, never a file. Null yields an empty map.
 */
export function rolePermissionsFromPolicies(
  configManager: Pick<ConfigurationManager, 'getProperty'> | null | undefined
): Map<string, Set<string>> {
  const granted = new Map<string, Set<string>>();
  const policies = (configManager?.getProperty('ngdpbase.access.policies', []) ?? []) as PolicyLike[];
  if (!Array.isArray(policies)) return granted;

  // Lower priority first, so a higher-priority deny lands last and wins.
  const ordered = [...policies].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  for (const policy of ordered) {
    const roles = (policy.subjects ?? [])
      .filter((s) => s.type === 'role' && typeof s.value === 'string' && s.value)
      .map((s) => s.value as string);
    for (const role of roles) {
      let set = granted.get(role);
      if (!set) {
        set = new Set<string>();
        granted.set(role, set);
      }
      for (const action of policy.actions ?? []) {
        if (policy.effect === 'deny') set.delete(action);
        else set.add(action);
      }
    }
  }
  return granted;
}

/** The same table as plain arrays, sorted — for template data and JSON. */
export function rolePermissionListsFromPolicies(
  configManager: Pick<ConfigurationManager, 'getProperty'> | null | undefined
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [role, actions] of rolePermissionsFromPolicies(configManager)) {
    out[role] = [...actions].sort();
  }
  return out;
}
