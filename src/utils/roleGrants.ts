/**
 * What each role is granted, read from the access policies (#1521).
 *
 * For the admin user forms: beside each role, the permissions its policies
 * grant, so an admin can see that `contributor` already carries everything
 * `reader` does under the shipped policies. Read from the merged policies —
 * core, add-ons and the instance's own — so it shows what this site grants.
 *
 * Display only. Roles are independent in the code; whether a request is
 * allowed is still decided by the evaluator, policy by policy and resource by
 * resource. A grant that applies only to some resources (a policy naming
 * particular pages or system-categories) is marked `limited`.
 */

import type { Policy } from '../types/Policy.js';

export interface RoleGrant {
  action: string;
  /** True when every policy granting it applies to some resources only. */
  limited: boolean;
}

export interface RoleGrants {
  allows: RoleGrant[];
  /** Actions a deny policy names for this role. */
  denies: string[];
}

const everyResource = (policy: Policy): boolean =>
  !policy.resources || policy.resources.length === 0 || policy.resources.some((r) => r.pattern === '*');

/** Every role a policy names, with what its policies allow and deny. */
export function roleGrants(policies: readonly Policy[]): Record<string, RoleGrants> {
  const allow = new Map<string, Map<string, boolean>>();
  const deny = new Map<string, Set<string>>();
  for (const policy of policies) {
    const roles = (policy.subjects ?? []).filter((s) => s.type === 'role').map((s) => String(s.value));
    const actions = policy.actions ?? [];
    for (const role of roles) {
      if (policy.effect === 'deny') {
        const set = deny.get(role) ?? new Set<string>();
        actions.forEach((a) => set.add(a));
        deny.set(role, set);
        continue;
      }
      const map = allow.get(role) ?? new Map<string, boolean>();
      for (const action of actions) {
        // Unlimited if any granting policy covers every resource.
        map.set(action, (map.get(action) ?? false) || everyResource(policy));
      }
      allow.set(role, map);
    }
  }
  const out: Record<string, RoleGrants> = {};
  for (const role of new Set([...allow.keys(), ...deny.keys()])) {
    out[role] = {
      allows: [...(allow.get(role) ?? new Map<string, boolean>()).entries()]
        .map(([action, unlimited]) => ({ action, limited: !unlimited }))
        .sort((a, b) => a.action.localeCompare(b.action)),
      denies: [...(deny.get(role) ?? new Set())].sort()
    };
  }
  return out;
}
