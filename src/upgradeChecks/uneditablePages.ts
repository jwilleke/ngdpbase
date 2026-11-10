/**
 * Upgrade check: pages nobody can edit (#2299, first check of #2301).
 *
 * Since #2255 a page is changed by whoever the policies on its system-category
 * allow. A stored category with no policy granting a page edit leaves its
 * pages unchangeable, administrators included. With no pages in it that is
 * only a log line; with pages, the administrator is told how many, and a list
 * page names them and offers one button. Only public pages count: a vault
 * page is its owner's, and an administrator is not told about it (#2313).
 */
import type { ActorContext } from '../context/ActorContext.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import { UPGRADE_LIST_PAGE_SIZE, type UpgradeCheck } from '../managers/UpgradeCheckManager.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type PageManager from '../managers/PageManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import type PolicyValidator from '../managers/PolicyValidator.js';
import type { Policy } from '../types/Policy.js';
import { categoryStored } from '../managers/ValidationManager.js';
import { pageUrl } from '../utils/pageUrl.js';
import { POLICIES_KEY } from '../security/PolicyDecisionPoint.js';

/** Where the item's "See the pages" goes. */
export const LIST_URL = '/admin/upgrade/pages/pages-nobody-can-edit';
const POLICY_ID = 'admins-edit-pages-no-one-could';
/** How long the page names read from the site are reused, so each look at Admin does not walk every page. */
const NAMES_FRESH_MS = 60_000;

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function uneditablePagesCheck(engine: WikiEngine): UpgradeCheck {
  const config = (): ConfigurationManager => engine.getManager<ConfigurationManager>('ConfigurationManager') as ConfigurationManager;
  const pages = (): PageManager => engine.getManager<PageManager>('PageManager') as PageManager;
  const pdp = (): PolicyDecisionPoint => engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint') as PolicyDecisionPoint;

  /**
   * The public pages in each category by name, A–Z. The count on Admin reuses what was read
   * for up to a minute; the list page reads afresh (`fresh`), so it never names a page that has gone.
   */
  const known = new Map<string, { at: number; names: string[] }>();
  const pagesIn = async (category: string, fresh = false): Promise<string[]> => {
    const cached = known.get(category);
    if (cached && !fresh && Date.now() - cached.at < NAMES_FRESH_MS) return cached.names;
    const names = [...(await pages().listCategoryPages(category))].sort(byName);
    known.set(category, { at: Date.now(), names });
    return names;
  };

  /** Stored categories (labels, lower case) that no policy lets anyone change. */
  const uncovered = (): string[] => {
    const catalogue = config().getProperty('ngdpbase.system-category', {}) as Record<string, { label?: string; storageLocation?: unknown; owner?: unknown }> | null;
    const writable = new Set([...pdp().categoriesGranting('page-edit'), ...pdp().categoriesGranting('pushed-pages-edit')]);
    // An installed add-on's category is declared while the add-on is off (#1559), and its policies are not: that is the add-on being off, not a gap.
    const addonOff = (owner: unknown): boolean => typeof owner === 'string' && owner !== 'admin'
      && config().getProperty(`ngdpbase.addons.${owner}.enabled`, false) !== true;
    return Object.entries(catalogue ?? {})
      .filter(([, entry]) => categoryStored(entry) !== 'none' && !addonOff(entry?.owner))
      .map(([key, entry]) => (typeof entry?.label === 'string' && entry.label ? entry.label : key).toLowerCase())
      .filter((category) => !writable.has(category));
  };

  return {
    id: 'pages-nobody-can-edit',
    since: '5.43.0',

    async detect() {
      const found: Array<{ category: string; count: number }> = [];
      known.clear();
      for (const category of uncovered()) found.push({ category, count: (await pagesIn(category)).length });
      const withPages = found.filter((f) => f.count > 0);
      const detail = found.map((f) => `${f.category} (${plural(f.count, 'page', 'pages')})`).join(', ');
      return {
        affected: withPages.map((f) => f.category),
        log: found.length === 0
          ? 'every stored system-category has a policy granting page-edit or pushed-pages-edit'
          : `no policy grants page-edit or pushed-pages-edit on system-category ${detail}; ${withPages.length > 0 ? 'nobody can change those pages, admin included' : 'it has no pages, so nothing to show in Admin'}`
      };
    },

    async item(affected: string[], version: string) {
      // Still uncovered now: an administrator who fixed it another way has nothing left to decide.
      const open = uncovered().filter((category) => affected.includes(category));
      const count = (await Promise.all(open.map((c) => pagesIn(c)))).reduce((n, names) => n + names.length, 0);
      if (count === 0) return null;
      return {
        text: `${plural(count, 'page', 'pages')} can't be edited after the update${version ? ` to ${version}` : ''}.`,
        link: { label: 'See the pages', href: LIST_URL }
      };
    },

    async list(affected: string[], viewer: ActorContext, page: number) {
      const open = uncovered().filter((category) => affected.includes(category));
      const names = [...new Set((await Promise.all(open.map((c) => pagesIn(c, true)))).flat())].sort(byName);
      // Only pages this viewer may see are named, whatever the count on Admin says.
      const shown: string[] = [];
      for (let i = 0; i < names.length; i += UPGRADE_LIST_PAGE_SIZE) {
        const chunk = names.slice(i, i + UPGRADE_LIST_PAGE_SIZE);
        const may = await Promise.all(chunk.map((name) => pages().mayShowPage(name, viewer)));
        shown.push(...chunk.filter((_, j) => may[j]));
      }
      if (shown.length === 0) return null;
      const pageCount = Math.ceil(shown.length / UPGRADE_LIST_PAGE_SIZE);
      const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
      const one = shown.length === 1;
      return {
        total: shown.length,
        pages: shown.slice((current - 1) * UPGRADE_LIST_PAGE_SIZE, current * UPGRADE_LIST_PAGE_SIZE).map((name) => ({ title: name, href: pageUrl(name) })),
        page: current,
        pageCount,
        note: `The button lets everyone who signs in as an administrator edit ${one ? 'it' : 'them'}. Nothing in the ${one ? 'page' : 'pages'} changes, and no one else gets access.`,
        button: one ? 'Let administrators edit this page' : 'Let administrators edit these pages'
      };
    },

    async fix(affected: string[], ctx: ActorContext) {
      const categories = uncovered().filter((category) => affected.includes(category));
      if (categories.length === 0) return;
      const own = (config().getCustomProperty(POLICIES_KEY) as Policy[] | undefined) ?? [];
      const before = own.find((p) => p.id === POLICY_ID);
      const patterns = [...new Set([...(before?.resources ?? []).map((r) => r.pattern), ...categories])];
      const policy: Policy = {
        id: POLICY_ID,
        name: 'Administrators change pages no one could',
        description: 'Added by the upgrade check: pages in these system categories had no policy granting a page edit',
        effect: 'allow',
        subjects: [{ type: 'role', value: 'admin' }],
        resources: patterns.map((pattern) => ({ type: 'system-category', pattern })),
        actions: ['page-edit']
      };
      const value = [...own.filter((p) => p.id !== POLICY_ID), policy];
      // The checks the configuration screen makes before it saves policies.
      const refused = engine.getManager<PolicyValidator>('PolicyValidator')?.policyProblems(value) ?? [];
      if (refused.length > 0) throw new Error(`Policies not saved: ${refused.join('; ')}`);
      await config().setProperty(POLICIES_KEY, value, ctx);
    }
  };
}
