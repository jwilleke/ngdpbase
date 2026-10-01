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
  /** For a limited grant, the resource types it is limited to — `vault` reads "in your own vaults" (#1539). */
  where: string[];
}

export interface RoleGrants {
  allows: RoleGrant[];
  /** Actions a deny policy names for this role. */
  denies: string[];
}

// Every page: no resources named, or `page: *`. `*` on another type covers only
// what that type names — `vault: *` is every vault, not every page (#1539).
const everyResource = (policy: Policy): boolean =>
  !policy.resources || policy.resources.length === 0 || policy.resources.some((r) => r.type === 'page' && r.pattern === '*');

/**
 * Every role a policy names, with what its policies allow and deny — the one
 * reading of "what a role grants" (#1539): the user forms, the profile, the
 * admin roles page and `PolicyDecisionPoint.rolePermissions` all come from
 * here. Policies are applied lowest priority first, so a deny takes away what
 * a lower-priority allow gave and an allow above it gives it back — the order
 * the evaluator's first-match-by-priority decides in.
 */
export function roleGrants(policies: readonly Policy[]): Record<string, RoleGrants> {
  const allow = new Map<string, Map<string, { unlimited: boolean; where: Set<string> }>>();
  const deny = new Map<string, Set<string>>();
  const ordered = [...policies].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (const policy of ordered) {
    const roles = (policy.subjects ?? []).filter((s) => s.type === 'role').map((s) => String(s.value));
    const actions = policy.actions ?? [];
    for (const role of roles) {
      const map = allow.get(role) ?? new Map<string, { unlimited: boolean; where: Set<string> }>();
      allow.set(role, map);
      if (policy.effect === 'deny') {
        const set = deny.get(role) ?? new Set<string>();
        actions.forEach((a) => { set.add(a); map.delete(a); });
        deny.set(role, set);
        continue;
      }
      const all = everyResource(policy);
      for (const action of actions) {
        const g = map.get(action) ?? { unlimited: false, where: new Set<string>() };
        // Unlimited if any granting policy covers every resource.
        g.unlimited = g.unlimited || all;
        if (!all) (policy.resources ?? []).forEach((r) => g.where.add(r.type));
        map.set(action, g);
      }
    }
  }
  const out: Record<string, RoleGrants> = {};
  for (const role of new Set([...allow.keys(), ...deny.keys()])) {
    out[role] = {
      allows: [...(allow.get(role) ?? new Map<string, { unlimited: boolean; where: Set<string> }>()).entries()]
        .map(([action, g]) => ({ action, limited: !g.unlimited, where: g.unlimited ? [] : [...g.where].sort() }))
        .sort((a, b) => a.action.localeCompare(b.action)),
      denies: [...(deny.get(role) ?? new Set())].sort()
    };
  }
  return out;
}
