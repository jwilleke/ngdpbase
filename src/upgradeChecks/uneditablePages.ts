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
import type { UpgradeCheck } from '../managers/UpgradeCheckManager.js';
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

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function uneditablePagesCheck(engine: WikiEngine): UpgradeCheck {
  const config = (): ConfigurationManager => engine.getManager<ConfigurationManager>('ConfigurationManager') as ConfigurationManager;
  const pages = (): PageManager => engine.getManager<PageManager>('PageManager') as PageManager;
  const pdp = (): PolicyDecisionPoint => engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint') as PolicyDecisionPoint;

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
      for (const category of uncovered()) found.push({ category, count: (await pages().listCategoryPages(category)).length });
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
      const names = (await Promise.all(open.map((category) => pages().listCategoryPages(category)))).flat();
      if (names.length === 0) return null;
      const seen: string[] = [];
      for (const name of names) {
        if (await pages().mayShowPage(name, viewer)) seen.push(parsePrivatePageName(name)?.title ?? name);
      }
      const shown = seen.slice(0, MOST_TITLES);
      const rest = names.length - shown.length;
      const tail = rest === 0 ? '' : shown.length === 0
        ? ''
        : ` and ${rest} ${seen.length > shown.length ? 'more' : 'private'} ${rest === 1 ? 'page' : 'pages'}`;
      const who = names.length === 1 ? 'This page can\'t' : `These ${names.length} pages can't`;
      return {
        text: `${who} be edited by anyone, including you${shown.length > 0 ? `: ${shown.join(', ')}${tail}` : ''}.`,
        button: names.length === 1 ? 'Let admins edit it' : 'Let admins edit them'
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
