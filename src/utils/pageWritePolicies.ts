/**
 * The page-write policies after #2255, and the migration of a site's stored
 * copies of the old ones.
 *
 * Until #2255 the shipped role policies granted `page-edit`, `page-delete` and
 * `page-rename` on every page (`page: *`), and an `access: { edit: [admin] }`
 * stamp on each shipped page was the only thing keeping editors out of the
 * system and documentation pages. Those grants now sit on the
 * `system-category` resource type, one policy per group of categories, and the
 * stamp is gone.
 *
 * A site that ever saved `ngdpbase.access.policies` (the configuration editor,
 * the Shared folders screen) holds a full copy of the old role policies, and a
 * stored entry replaces the shipped one with the same id whole
 * (`src/utils/configFiles.ts`). Its `page-edit` on `page: *` would reopen every
 * pushed page to editors. So, before the merge, in memory:
 *
 * - a stored entry with a shipped id below loses the page writes it held on
 *   `page: *`; any it held that the shipped category policies do not give that
 *   role is kept, on the general category only, as a new policy
 *   `<id>-page-write`;
 * - every other policy that grants a page write on a `page` resource to a role
 *   other than admin, and every deny policy (a deny now overrides an allow), is reported and left as it is: it is the site's
 *   own choice.
 *
 * A stored role policy may also have lost a page write the shipped one had: a
 * site narrowed `editor-permissions` before #2255 to take away delete and rename.
 * The shipped category policies are merged in by id, so they would give the
 * write back. `narrowedRoleWrites` finds what the site took away and
 * `withoutNarrowedWrites` leaves it out of the category policies that were not
 * stored (#2270).
 *
 * Pure: the caller logs and reports. The site's file is not rewritten; saving
 * the policy list from the configuration editor writes the migrated list.
 */
import { createHash } from 'crypto';
import type { Policy } from '../types/Policy.js';

/**
 * Where the denies an administrator marked as checked are kept (#2355): rule id to the fingerprint of
 * the rule as it was then. A mark hides the dashboard item and is read by nothing that decides access.
 */
export const CHECKED_DENIES_KEY = 'ngdpbase.access.checked-denies';

/** Where the "Mark as checked" button on the dashboard item posts (#2355). */
export const DENY_CHECKED_ACTION = '/admin/access-policies/deny-checked';

/** The rule's content in one string: keys in order, so the same rule always gives the same text. */
function stableText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableText).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((k) => record[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableText(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A stable hash of a whole rule, its id included, so a changed rule (or the same content under another name) is a different one (#2355). */
export function policyFingerprint(policy: Policy): string {
  return createHash('sha256').update(stableText(policy)).digest('hex');
}

const PAGE_WRITES = ['page-edit', 'page-delete', 'page-rename'] as const;

/** The one action a grant to everyone may hold without a review line (#2261, #2283). */
const READ_ONLY_ACTION = 'page-read';

/**
 * The shipped role policies whose page writes moved to the category policies
 * (#2255), and the writes the category policies give their roles on general
 * pages. A stored copy keeping more than this keeps the rest on general only.
 */
const MOVED: Readonly<Record<string, readonly string[]>> = {
  'admin-full-access': PAGE_WRITES,
  'editor-permissions': PAGE_WRITES,
  'contributor-permissions': ['page-edit'],
  'demo-admin-access': ['page-edit']
};

/**
 * The role each narrowable shipped policy names. Admin is left out: an administrator who
 * lost a page write by editing `admin-full-access` is not something this repairs.
 */
const ROLE_OF: Readonly<Record<string, string>> = {
  'editor-permissions': 'editor',
  'contributor-permissions': 'contributor',
  'demo-admin-access': 'demo-admin'
};

/**
 * The shipped category policies that came with #2255 and carry the role writes. A stored list that holds
 * one was saved on a release that has them (the editor saves the whole list), and its role policies then
 * hold no page writes by design, so it says nothing about what the site narrowed.
 */
const CATEGORY_POLICY_IDS: readonly string[] = ['general-page-write', 'general-page-edit'];

/** What the migration did and found, one sentence each. */
export interface PageWritePolicyReport {
  /** Stored shipped policies rewritten in memory. */
  rewritten: string[];
  /** Policies left alone that now decide differently, or reopen pushed pages. */
  review: string[];
  /** Each `rewritten` line, in plain words, for the needs-attention entry (no permission ids, issue numbers or setting names). */
  shown: Record<string, string>;
}

/** One finding for the start-up log (`log`, in full) and for the needs-attention entry (`plain`, in plain words). */
export interface PolicyFinding {
  log: string;
  plain: string;
  /** Set when the finding is an allow rule the upgrade notice already lists (`openWriteRules`); the needs-attention item leaves it out. */
  coveredByUpgradeNotice?: boolean;
  /** Set on a deny (#2355): the rule, its fingerprint now, and whether an administrator marked exactly this content as checked. */
  deny?: { id: string; fingerprint: string; checked: boolean };
}

function isPageStar(policy: Policy): boolean {
  return (policy.resources ?? []).some((r) => r.type === 'page' && r.pattern === '*');
}

/**
 * Rewrite the stored copies of the moved shipped policies, in `policies` (the
 * custom layer's `ngdpbase.access.policies`), and return what was done and
 * what an administrator should review. Returns the list to store in place of
 * the input; the input is not changed.
 */
export function migrateStoredPageWritePolicies(policies: unknown): { policies: unknown; report: PageWritePolicyReport } {
  const report: PageWritePolicyReport = { rewritten: [], review: [], shown: {} };
  if (!Array.isArray(policies)) return { policies, report };
  const out: unknown[] = [];
  for (const entry of policies as unknown[]) {
    const policy = entry as Policy;
    const moved = policy && typeof policy === 'object' && typeof policy.id === 'string' && Object.hasOwn(MOVED, policy.id) ? MOVED[policy.id] : null;
    if (!moved || policy.effect === 'deny' || !isPageStar(policy) || !(policy.actions ?? []).some((a) => (PAGE_WRITES as readonly string[]).includes(a))) {
      out.push(entry);
      continue;
    }
    const held = (policy.actions ?? []).filter((a) => (PAGE_WRITES as readonly string[]).includes(a));
    const extra = held.filter((a) => !moved.includes(a));
    out.push({ ...policy, actions: (policy.actions ?? []).filter((a) => !held.includes(a)) });
    if (extra.length > 0) {
      out.push({
        id: `${policy.id}-page-write`,
        name: `${policy.name ?? policy.id}: page writes kept from the site's copy`,
        description: `Carried over from the site's stored '${policy.id}' by the #2255 upgrade, on general pages only`,
        effect: 'allow',
        subjects: policy.subjects,
        resources: [{ type: 'system-category', pattern: 'general' }],
        actions: extra
      });
    }
    const line = `'${policy.id}' in custom config granted ${held.join(', ')} on every page; that now comes from the category policies (#2255)${extra.length > 0 ? `, and ${extra.join(', ')}, which they do not give, is kept on general pages as '${policy.id}-page-write'` : ''}`;
    report.rewritten.push(line);
    report.shown[line] = `The saved rule '${policy.id}' let its roles change every page, which the site now handles with its page category rules, so it was changed for this run only${extra.length > 0 ? `; what the category rules do not cover is kept for general pages in a new rule, '${policy.id}-page-write'` : ''}. Save the policy list in Admin → Configuration to keep the change.`;
  }
  return { policies: out, report };
}

/** A page write a site removed from its stored copy of a shipped role policy (#2270). */
export interface NarrowedWrite {
  role: string;
  action: string;
  /** The stored role policy that lacks it. */
  policyId: string;
}

/** A {@link NarrowedWrite} that was left out of at least one category policy, and which ones. */
export interface AppliedNarrowing extends NarrowedWrite {
  from: string[];
}

/**
 * Page writes the site's stored copies of the shipped role policies lack that the shipped ones had (the
 * `MOVED` table), read from `stored` as the site saved it, before the #2255 migration rewrites it. A copy
 * that holds `*` or lists no actions holds everything; one that no longer covers every page is the site's
 * own choice and is reported elsewhere. A list that holds a shipped category policy was saved after #2255 and
 * is not read at all (`CATEGORY_POLICY_IDS`).
 */
export function narrowedRoleWrites(stored: unknown): NarrowedWrite[] {
  if (!Array.isArray(stored)) return [];
  const list = (stored as unknown[]).filter((p): p is Policy => !!p && typeof p === 'object' && typeof (p as Policy).id === 'string');
  if (list.some((p) => CATEGORY_POLICY_IDS.includes(p.id))) return [];
  const out: NarrowedWrite[] = [];
  for (const [policyId, role] of Object.entries(ROLE_OF)) {
    const policy = list.find((p) => p.id === policyId);
    if (!policy || policy.effect === 'deny') continue;
    const resources = policy.resources ?? [];
    if (resources.length > 0 && !isPageStar(policy)) continue;
    const held = policy.actions ?? [];
    if (held.length === 0 || held.includes('*')) continue;
    for (const action of MOVED[policyId]) {
      if (!held.includes(action)) out.push({ role, action, policyId });
    }
  }
  return out;
}

/**
 * `policies` (the merged list) with each narrowed write left out for its role in every allow policy that
 * covers system categories only and is not in `keep` (the ids the site stored itself: those replace the shipped
 * ones whole and are the site's word). A policy naming the role and others is split: the others keep it
 * unchanged and the role gets `<id>-<role>` with what the site kept, or nothing when nothing is left. Returns
 * the list to use in place of the input, which is not changed, and each narrowing that took something out.
 */
export function withoutNarrowedWrites(policies: unknown, narrowed: readonly NarrowedWrite[], keep: ReadonlySet<string>): { policies: unknown; applied: AppliedNarrowing[] } {
  if (!Array.isArray(policies) || narrowed.length === 0) return { policies, applied: [] };
  const applied = new Map<string, AppliedNarrowing>();
  const out: unknown[] = [];
  for (const entry of policies as unknown[]) {
    const policy = entry as Policy;
    const resources = policy && typeof policy === 'object' ? (policy.resources ?? []) : [];
    const covered = policy && typeof policy === 'object' && typeof policy.id === 'string' && !keep.has(policy.id) && policy.effect !== 'deny' && resources.length > 0 && resources.every((r) => r.type === 'system-category');
    if (!covered) {
      out.push(entry);
      continue;
    }
    const actions = policy.actions ?? [];
    const rest: NonNullable<Policy['subjects']> = [];
    const split: Policy[] = [];
    for (const subject of policy.subjects ?? []) {
      const dropped = subject.type === 'role' ? narrowed.filter((n) => n.role === subject.value && actions.includes(n.action)) : [];
      if (dropped.length === 0) {
        rest.push(subject);
        continue;
      }
      for (const n of dropped) {
        const key = `${n.policyId}/${n.action}`;
        const seen = applied.get(key) ?? { ...n, from: [] };
        if (!seen.from.includes(policy.id)) seen.from.push(policy.id);
        applied.set(key, seen);
      }
      const left = actions.filter((a) => !dropped.some((n) => n.action === a));
      if (left.length > 0) split.push({ ...policy, id: `${policy.id}-${subject.value}`, subjects: [subject], actions: left });
    }
    if (split.length === 0 && rest.length === (policy.subjects ?? []).length) out.push(entry);
    else {
      if (rest.length > 0) out.push({ ...policy, subjects: rest });
      out.push(...split);
    }
  }
  return { policies: out, applied: [...applied.values()] };
}

/**
 * Policies in force that an administrator should review after #2255: an
 * allow that grants a page write on a `page` resource to a role other than
 * admin (it reaches pushed pages), an allow that grants anything but
 * page-read to `anyone` or `authenticated` (#2261, #2283), and every deny (a deny now overrides any
 * allow; one an administrator marked as checked is still reported, with `deny.checked` set, #2355). Each is a log line in full and the same finding in plain words.
 */
export function pageWritePolicyFindings(policies: readonly Policy[], checked: Readonly<Record<string, string>> = {}): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  for (const policy of policies) {
    if (policy.effect === 'deny') {
      const fingerprint = policyFingerprint(policy);
      out.push({
        log: `'${policy.id}' is a deny: since #2255 a deny overrides any allow`,
        plain: `The rule '${policy.id}' denies access, and a deny beats every rule that allows it. Check that it denies only what you mean it to; if not, change or remove it.`,
        deny: { id: policy.id, fingerprint, checked: checked[policy.id] === fingerprint }
      });
      continue;
    }
    for (const rule of openWriteRules([policy])) {
      if (rule.who.kind === 'roles') {
        const roles = rule.who.roles;
        out.push({
          log: `'${policy.id}' grants ${rule.actions.join(', ')} on pages by name to ${roles.join(', ')}, which reaches system, documentation and add-on pages; grant it on system categories instead (#2255)`,
          plain: `The rule '${policy.id}' lets ${roles.length === 1 ? 'the role' : 'the roles'} ${roles.join(', ')} change pages by name, which reaches system, documentation and add-on pages. Change it to apply to page categories instead.`,
          coveredByUpgradeNotice: true
        });
        continue;
      }
      const everyone = rule.who.kind === 'anyone' ? 'anyone, including signed-out visitors' : 'every signed-in user';
      out.push({
        log: `'${policy.id}' grants ${rule.actions.join(', ')} to ${everyone}, so ${everyone} can do that, beyond reading; grant it to named roles instead (#2261)`,
        plain: `The rule '${policy.id}' lets ${everyone.replace(', including signed-out visitors', ' (including signed-out visitors)')} do more than read. Give those abilities to named roles instead.`,
        coveredByUpgradeNotice: true
      });
    }
  }
  return out;
}

/** The log lines of {@link pageWritePolicyFindings}. */
export function pageWritePoliciesToReview(policies: readonly Policy[]): string[] {
  return pageWritePolicyFindings(policies).map((f) => f.log);
}

/** An allow rule in force that lets more people write than the shipped rules do (#2355 handles denies, not this). */
export interface OpenWriteRule {
  id: string;
  /** Who: everyone including signed-out visitors, every signed-in user, or the named roles other than admin. */
  who: { kind: 'anyone' } | { kind: 'authenticated' } | { kind: 'roles'; roles: string[] };
  /** The actions it grants; for `anyone` and `authenticated`, without page-read. `*` means everything. */
  actions: string[];
  resources: NonNullable<Policy['resources']>;
}

/**
 * The allow rules in force that let `anyone` (signed-out visitors) or `authenticated` (every signed-in user)
 * do more than page-read, or give page writes to a role other than admin. Deny rules are left out.
 * Computed from the policies it is given, so what it returns follows the current policies.
 */
export function openWriteRules(policies: readonly Policy[]): OpenWriteRule[] {
  const out: OpenWriteRule[] = [];
  for (const policy of policies) {
    if (policy.effect === 'deny') continue;
    const subjects = policy.subjects ?? [];
    const kind = subjects.some((s) => s.type === 'anyone') ? 'anyone' : subjects.some((s) => s.type === 'authenticated') ? 'authenticated' : null;
    const resources = policy.resources ?? [];
    // Missing or empty `actions` means `*` (#2283).
    const held = (policy.actions ?? []).length > 0 ? (policy.actions ?? []) : ['*'];
    const granted = held.filter((a) => a !== READ_ONLY_ACTION);
    if (kind && granted.length > 0) out.push({ id: policy.id, who: { kind }, actions: granted, resources });
    const writes = (policy.actions ?? []).filter((a) => (PAGE_WRITES as readonly string[]).includes(a) || a === '*');
    const roles = subjects.filter((s) => s.type === 'role' && s.value !== 'admin').map((s) => s.value).filter((v): v is string => typeof v === 'string');
    if (writes.length > 0 && roles.length > 0 && resources.some((r) => r.type === 'page')) {
      out.push({ id: policy.id, who: { kind: 'roles', roles }, actions: writes, resources });
    }
  }
  return out;
}
