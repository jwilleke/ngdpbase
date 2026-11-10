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
 * Pure: the caller logs and reports. The site's file is not rewritten; saving
 * the policy list from the configuration editor writes the migrated list.
 */
import type { Policy } from '../types/Policy.js';

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

/**
 * Policies in force that an administrator should review after #2255: an
 * allow that grants a page write on a `page` resource to a role other than
 * admin (it reaches pushed pages), an allow that grants anything but
 * page-read to `anyone` or `authenticated` (#2261, #2283), and every deny (a deny now overrides any
 * allow). Each is a log line in full and the same finding in plain words.
 */
export function pageWritePolicyFindings(policies: readonly Policy[]): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  for (const policy of policies) {
    if (policy.effect === 'deny') {
      out.push({
        log: `'${policy.id}' is a deny: since #2255 a deny overrides any allow`,
        plain: `The rule '${policy.id}' denies access, and a deny beats every rule that allows it. Check that it denies only what you mean it to; if not, change or remove it.`
      });
      continue;
    }
    const everyone = (policy.subjects ?? []).some((s) => s.type === 'anyone') ? 'anyone, including signed-out visitors'
      : (policy.subjects ?? []).some((s) => s.type === 'authenticated') ? 'every signed-in user' : null;
    // Missing or empty `actions` means `*` (#2283); anything but page-read is flagged.
    const held = (policy.actions ?? []).length > 0 ? (policy.actions ?? []) : ['*'];
    const granted = held.filter((a) => a !== READ_ONLY_ACTION);
    if (everyone && granted.length > 0) {
      out.push({
        log: `'${policy.id}' grants ${granted.join(', ')} to ${everyone}, so ${everyone} can do that, beyond reading; grant it to named roles instead (#2261)`,
        plain: `The rule '${policy.id}' lets ${everyone.replace(', including signed-out visitors', ' (including signed-out visitors)')} do more than read. Give those abilities to named roles instead.`
      });
    }
    const writes = (policy.actions ?? []).filter((a) => (PAGE_WRITES as readonly string[]).includes(a) || a === '*');
    const roles = (policy.subjects ?? []).filter((s) => s.type === 'role' && s.value !== 'admin').map((s) => s.value);
    if (writes.length > 0 && roles.length > 0 && (policy.resources ?? []).some((r) => r.type === 'page')) {
      out.push({
        log: `'${policy.id}' grants ${writes.join(', ')} on pages by name to ${roles.join(', ')}, which reaches system, documentation and add-on pages; grant it on system categories instead (#2255)`,
        plain: `The rule '${policy.id}' lets ${roles.length === 1 ? 'the role' : 'the roles'} ${roles.join(', ')} change pages by name, which reaches system, documentation and add-on pages. Change it to apply to page categories instead.`
      });
    }
  }
  return out;
}

/** The log lines of {@link pageWritePolicyFindings}. */
export function pageWritePoliciesToReview(policies: readonly Policy[]): string[] {
  return pageWritePolicyFindings(policies).map((f) => f.log);
}
