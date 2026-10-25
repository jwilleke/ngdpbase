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

/** A grant to one subject, with the policies that give it (#2067). */
export interface SubjectGrant extends RoleGrant {
  /** The ids of the allow policies that give it, lowest priority first. */
  by: string[];
}

export interface SubjectGrants {
  allows: SubjectGrant[];
  /** Actions a deny policy names for this subject. */
  denies: string[];
}

// Every page: no resources named, or `page: *`. `*` on another type covers only
// what that type names — `vault: *` is every vault, not every page (#1539).
const everyResource = (policy: Policy): boolean =>
  !policy.resources || policy.resources.length === 0 || policy.resources.some((r) => r.type === 'page' && r.pattern === '*');

interface Accruing { unlimited: boolean; where: Set<string>; by: string[] }
type Accrued = Map<string, Accruing>;

/**
 * Every subject of one type a policy names (`role`, or `job` since #1999),
 * with what its policies allow and deny and which policies give each allow.
 * Policies are applied lowest priority first, so a deny takes away what a
 * lower-priority allow gave and an allow above it gives it back — the order
 * the evaluator's first-match-by-priority decides in.
 */
function subjectGrants(policies: readonly Policy[], type: string): Record<string, SubjectGrants> {
  const allow = new Map<string, Accrued>();
  const deny = new Map<string, Set<string>>();
  const ordered = [...policies].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (const policy of ordered) {
    const subjects = (policy.subjects ?? []).filter((s) => s.type === type).map((s) => String(s.value));
    const actions = policy.actions ?? [];
    for (const subject of subjects) {
      const map: Accrued = allow.get(subject) ?? new Map<string, Accruing>();
      allow.set(subject, map);
      if (policy.effect === 'deny') {
        const set = deny.get(subject) ?? new Set<string>();
        actions.forEach((a) => { set.add(a); map.delete(a); });
        deny.set(subject, set);
        continue;
      }
      const all = everyResource(policy);
      for (const action of actions) {
        const g = map.get(action) ?? { unlimited: false, where: new Set<string>(), by: [] };
        // Unlimited if any granting policy covers every resource.
        g.unlimited = g.unlimited || all;
        if (!all) (policy.resources ?? []).forEach((r) => g.where.add(r.type));
        if (!g.by.includes(policy.id)) g.by.push(policy.id);
        map.set(action, g);
      }
    }
  }
  const out: Record<string, SubjectGrants> = {};
  for (const subject of new Set([...allow.keys(), ...deny.keys()])) {
    out[subject] = {
      allows: [...(allow.get(subject) ?? new Map<string, Accruing>()).entries()]
        .map(([action, g]) => ({ action, limited: !g.unlimited, where: g.unlimited ? [] : [...g.where].sort(), by: g.by }))
        .sort((a, b) => a.action.localeCompare(b.action)),
      denies: [...(deny.get(subject) ?? new Set())].sort()
    };
  }
  return out;
}

/**
 * Every role a policy names, with what its policies allow and deny — the one
 * reading of "what a role grants" (#1539): the user forms, the profile, the
 * admin roles page and `PolicyDecisionPoint.rolePermissions` all come from
 * here.
 */
export function roleGrants(policies: readonly Policy[]): Record<string, RoleGrants> {
  const out: Record<string, RoleGrants> = {};
  for (const [role, g] of Object.entries(subjectGrants(policies, 'role'))) {
    out[role] = { allows: g.allows.map(({ action, limited, where }) => ({ action, limited, where })), denies: g.denies };
  }
  return out;
}

/**
 * Every scheduled job a policy names (`{ "type": "job", "value": "<job id>" }`,
 * #1999), with what its policies allow and deny and which policy gives each
 * allow — the admin roles page's Jobs part (#2067). A job a policy names acts
 * as itself and holds only these. Display only, like {@link roleGrants}.
 */
export function jobGrants(policies: readonly Policy[]): Record<string, SubjectGrants> {
  return subjectGrants(policies, 'job');
}
