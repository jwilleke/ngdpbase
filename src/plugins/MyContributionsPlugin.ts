/**
 * MyContributionsPlugin — renders the "My Contributions" card from /profile
 * inside any wiki page (#688).
 *
 * Usage:
 *   [{MyContributions}]                             // viewing user (default)
 *   [{MyContributions username='alice'}]            // explicit target user
 *   [{MyContributions username='$currentUser'}]     // same as the default
 *
 * Authorization model:
 *   - When the target equals the viewing user, render the full six-count card
 *     (Private, Authored, Journal, My Links, Edited, Shared) — matches /profile.
 *   - When the target is a different user, render a reduced three-count card
 *     (Authored, Journal, Edited). Private/Shared/Links are viewer-specific or
 *     potentially sensitive and require viewer roles or that user's prefs.
 *   - Anonymous visitor with no explicit username → empty output.
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml, formatAsCount, resolveUserParam } from '../utils/pluginFormatters.js';

interface UserContext {
  username?: string;
  authenticated?: boolean;
  preferences?: Record<string, unknown>;
  roles?: string[];
  [key: string]: unknown;
}

interface ExtendedPluginContext extends PluginContext {
  userContext?: UserContext;
  currentUser?: UserContext;
  userName?: string;
}

interface PageManagerLike {
  getPagesByCreator?: (u: string, o?: { onlyPrivate?: boolean }) => Promise<unknown[]>;
  getPagesByEditor?: (u: string) => Promise<unknown[]>;
  getPagesSharedWith?: (principals: string[]) => Promise<unknown[]>;
}

interface JournalManagerLike {
  countByAuthor?: (u: string) => number;
}

interface ContributionCounts {
  pages?: number;
  private?: number;
  journal?: number;
  links?: number;
  edits?: number;
  shared?: number;
}

const MyContributionsPlugin: SimplePlugin = {
  name: 'MyContributionsPlugin',
  description: 'Renders the My Contributions card from /profile on any wiki page',
  author: 'ngdpbase',
  version: '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const ctx = context as ExtendedPluginContext;
    const viewer = ctx.userContext ?? ctx.currentUser;
    const viewerName = viewer?.username;
    const viewerAuth = Boolean(viewer?.authenticated && viewerName && viewerName !== 'anonymous');

    // Resolve username param. resolveUserParam handles the $currentUser token
    // and returns undefined when the token is used but the visitor is anonymous.
    const rawParam = typeof params.username === 'string' ? params.username : undefined;
    let target: string | undefined;
    if (rawParam) {
      target = resolveUserParam(rawParam, ctx);
      // resolveUserParam returns undefined only when $currentUser was used and
      // the viewer is anonymous. A literal username comes back unchanged.
      if (!target && rawParam.toLowerCase() === '$currentuser') {
        return '';
      }
    } else if (viewerAuth) {
      target = viewerName;
    }

    if (!target) return '';

    const isSelfView = viewerAuth && target === viewerName;

    const counts = await getContributionCounts(ctx, target, isSelfView ? viewer : undefined);

    return renderCard(target, counts, isSelfView);
  },

  initialize(_engine: unknown): void {
    // no-op
  }
};

/**
 * Fetch the contribution counts for a user. Viewer-specific counts (`shared`,
 * `links`) are only populated when the viewer is looking at their own profile,
 * since they require the viewer's roles and preferences.
 *
 * Mirrors WikiRoutes.getMyContributionsCounts (which serves /profile). The
 * duplication is intentional for v1 — a future refactor can extract both
 * call sites to a shared UserContributionService.
 */
async function getContributionCounts(
  ctx: ExtendedPluginContext,
  target: string,
  viewerForSelfView: UserContext | undefined
): Promise<ContributionCounts> {
  const counts: ContributionCounts = {};
  const engine = ctx.engine;

  try {
    const pageManager = engine?.getManager('PageManager') as PageManagerLike | undefined;
    if (pageManager?.getPagesByCreator) {
      const all = await pageManager.getPagesByCreator(target);
      counts.pages = all.length;
      if (viewerForSelfView) {
        const privateOnly = await pageManager.getPagesByCreator(target, { onlyPrivate: true });
        counts.private = privateOnly.length;
      }
    }
    if (pageManager?.getPagesByEditor) {
      const edits = await pageManager.getPagesByEditor(target);
      counts.edits = edits.length;
    }
    if (pageManager?.getPagesSharedWith && viewerForSelfView) {
      const principals = [...(viewerForSelfView.roles ?? []), target];
      const shared = await pageManager.getPagesSharedWith(principals);
      counts.shared = shared.length;
    }
  } catch (err) {
    engine?.logger?.error?.('[MyContributionsPlugin] page counts failed:', err);
  }

  try {
    const journalManager = engine?.getManager('JournalDataManager') as JournalManagerLike | undefined;
    if (journalManager?.countByAuthor) {
      counts.journal = journalManager.countByAuthor(target);
    }
  } catch (err) {
    engine?.logger?.error?.('[MyContributionsPlugin] journal count failed:', err);
  }

  if (viewerForSelfView) {
    const pinned = viewerForSelfView.preferences?.['nav.pinnedPages'];
    counts.links = Array.isArray(pinned) ? pinned.length : 0;
  }

  return counts;
}

interface CountRow {
  href: string | null;   // null → render label as plain text (no anchor)
  icon: string;
  label: string;
  value: number | undefined;
}

function renderCard(target: string, counts: ContributionCounts, isSelfView: boolean): string {
  const rows: CountRow[] = isSelfView
    ? [
      { href: '/my/private', icon: 'fa-eye-slash', label: 'Private Pages',       value: counts.private },
      { href: '/my/pages',   icon: 'fa-file-alt',  label: "Pages I've Authored", value: counts.pages   },
      { href: '/my/journal', icon: 'fa-book',      label: 'Journal Entries',     value: counts.journal },
      { href: '/my/links',   icon: 'fa-link',      label: 'My Links',            value: counts.links   },
      { href: '/my/edits',   icon: 'fa-history',   label: "Pages I've Edited",   value: counts.edits   },
      { href: '/my/shared',  icon: 'fa-share-alt', label: 'Pages Shared With Me', value: counts.shared  }
    ]
    : [
      { href: null, icon: 'fa-file-alt', label: 'Pages Authored',  value: counts.pages   },
      { href: null, icon: 'fa-book',     label: 'Journal Entries', value: counts.journal },
      { href: null, icon: 'fa-history',  label: 'Pages Edited',    value: counts.edits   }
    ];

  // headerLabel holds plain text; escapeHtml is applied at insertion time below.
  const headerLabel = isSelfView ? 'My Contributions' : `Contributions — ${target}`;

  const items = rows.map(row => {
    const valueHtml = row.value !== undefined ? formatAsCount(row.value) : '&ndash;';
    const labelHtml = `<i class="fas ${row.icon}"></i> ${escapeHtml(row.label)}`;
    const labelCell = row.href
      ? `<a href="${row.href}" class="text-decoration-none">${labelHtml}</a>`
      : `<span>${labelHtml}</span>`;
    return [
      '        <li class="list-group-item d-flex align-items-center justify-content-between">',
      `          ${labelCell}`,
      `          <span class="badge bg-secondary">${valueHtml}</span>`,
      '        </li>'
    ].join('\n');
  }).join('\n');

  return [
    '<div class="card my-contributions-plugin">',
    '  <div class="card-header">',
    `    <h6><i class="fas fa-star"></i> ${escapeHtml(headerLabel)}</h6>`,
    '  </div>',
    '  <div class="card-body p-0">',
    '    <ul class="list-group list-group-flush">',
    items,
    '    </ul>',
    '  </div>',
    '</div>'
  ].join('\n');
}

export default MyContributionsPlugin;
