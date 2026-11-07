/**
 * Upgrade check: pages nobody can edit (#2299, first check of #2301).
 *
 * Since #2255 a page is changed by whoever the policies on its system-category
 * allow. A stored category with no policy granting a page edit leaves its
 * pages unchangeable, administrators included. With no pages in it that is
 * only a log line; with pages, the administrator is told which pages and
 * offered one button.
 */
import type { ActorContext } from '../context/ActorContext.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { UpgradeCheck, UpgradePageLink } from '../managers/UpgradeCheckManager.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type PageManager from '../managers/PageManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import type PolicyValidator from '../managers/PolicyValidator.js';
import type { Policy } from '../types/Policy.js';
import { categoryStored } from '../managers/ValidationManager.js';
import { parsePrivatePageName } from '../utils/privateStorePath.js';
import { POLICIES_KEY } from '../security/PolicyDecisionPoint.js';

const POLICY_ID = 'admins-edit-pages-no-one-could';
/** Titles named in an item before the rest are counted. */
const MOST_TITLES = 10;

/** "A", "A and B", "A, B and C". */
const list = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

const titleOf = (name: string): string => parsePrivatePageName(name)?.title ?? name;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function uneditablePagesCheck(engine: WikiEngine): UpgradeCheck {
  const config = (): ConfigurationManager => engine.getManager<ConfigurationManager>('ConfigurationManager') as ConfigurationManager;
  const pages = (): PageManager => engine.getManager<PageManager>('PageManager') as PageManager;
  const pdp = (): PolicyDecisionPoint => engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint') as PolicyDecisionPoint;

  /**
   * Every page in each category, by title A–Z, read when the check ran (or the first time it is
   * asked after a restart). A page cannot be added to or taken from a category nobody can edit,
   * so what Admin shows does not walk the site on each load; who may see which is still asked per viewer.
   */
  const known = new Map<string, string[]>();
  const pagesIn = async (category: string): Promise<string[]> => {
    const cached = known.get(category);
    if (cached) return cached;
    const names = [...(await pages().listCategoryPages(category))].sort((a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' }));
    known.set(category, names);
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

    async item(affected: string[], viewer: ActorContext) {
      // Still uncovered now: an administrator who fixed it another way has nothing left to decide.
      const open = uncovered().filter((category) => affected.includes(category));
      const names = (await Promise.all(open.map(pagesIn))).flat();
      if (names.length === 0) return null;
      names.sort((a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' }));
      // Stop asking once enough titles are found; the pages not asked about are counted as "more".
      const shown: UpgradePageLink[] = [];
      let asked = 0;
      for (const name of names) {
        if (shown.length === MOST_TITLES) break;
        asked += 1;
        if (await pages().mayShowPage(name, viewer)) shown.push({ title: titleOf(name), href: `/view/${encodeURIComponent(name)}` });
      }
      const rest = names.length - shown.length;
      const more = rest === 0 || shown.length === 0
        ? ''
        : ` and ${rest} ${asked < names.length ? 'more' : 'private'} ${rest === 1 ? 'page' : 'pages'}`;
      const one = names.length === 1;
      const who = one ? 'This page can\'t' : `These ${names.length} pages can't`;
      return {
        headline: `${plural(names.length, 'page', 'pages')} can't be edited`,
        text: `${who} be edited by anyone, including you${shown.length > 0 ? ': ' : ''}`,
        pages: shown,
        more,
        note: `The button lets everyone who signs in as an administrator edit ${one ? 'it' : 'them'}. Nothing in the ${one ? 'page' : 'pages'} changes, and no one else gets access.`,
        button: one ? 'Let administrators edit this page' : 'Let administrators edit these pages',
        done: `Administrators can now edit ${shown.length > 0 ? list([...shown.map((p) => p.title), ...(more ? [more.slice(5)] : [])]) : (one ? 'that page' : 'those pages')}.`
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
        priority: 100,
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
