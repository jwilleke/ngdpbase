import type { ShareRecord } from '../types/Share.js';

/**
 * The Shared links page's rows, slice 3 of #2247 (R1, R2, R3, R5, R9).
 *
 * One function, used by the page and by the Profile card, so the two cannot
 * disagree. It reads no page and holds no token: a row is built from the
 * record's scope, label and dates alone.
 */

export type SharedLinkKind = 'tag' | 'chosen-pages' | 'whole-area';
export type SharedLinkStatus = 'active' | 'expired' | 'revoked' | 'page not available';
export type SharedLinkAction = 'extend' | 'visits' | 'revoke';

export interface SharedLinkRow {
  /** The management id, the handle in every form. Never the token. */
  id: string;
  kind: SharedLinkKind;
  what: string;
  /** What the person typed when they made the link; empty when they typed nothing. */
  label: string;
  /** The one page a single-page link covers, so the page can show its title; null otherwise. */
  pageUuid: string | null;
  status: SharedLinkStatus;
  /** ISO date, or null for "until cancelled". */
  expiresAt: string | null;
  createdAt: string;
  /** Who made the link. Shown in the all-users view only. */
  madeBy: string;
  actions: SharedLinkAction[];
}

/** Which kinds the user may make now (Q3, answer E): links of another kind are hidden. */
export interface MakeableKinds {
  tag: boolean;
  vault: boolean;
}

function statusOf(record: ShareRecord, now: number): SharedLinkStatus {
  // Answer D: a link a manager revoked reads as a missing page to its owner,
  // with no name and no "revoked by" wording.
  if (record.revokedAt) return record.revokedByManager ? 'page not available' : 'revoked';
  if (record.expiresAt && now > Date.parse(record.expiresAt)) return 'expired';
  return 'active';
}

/**
 * The user's own links of the kinds they may make, newest first. With
 * `allUsers` (slice 4 of #2247, R13): every link whatever its kind, each
 * naming its maker. Another user's private-area link then shows the area name
 * and the page count and nothing else: no label, no page, no extend or visits.
 */
export function sharedLinkRows(
  records: readonly ShareRecord[],
  may: MakeableKinds,
  now: number,
  allUsers?: { viewer: string }
): SharedLinkRow[] {
  const rows: SharedLinkRow[] = [];
  for (const record of records) {
    const scope = record.scope;
    if (!allUsers && (scope.kind === 'keyword' ? !may.tag : !may.vault)) continue;
    const others = allUsers !== undefined && record.createdBy !== allUsers.viewer;
    const owner = others ? `${record.createdBy}'s` : 'your';
    let status = statusOf(record, now);
    // R14, answer D: the owner reads a manager's revoke as a missing page; a
    // manager reads it as revoked.
    if (allUsers && status === 'page not available') status = 'revoked';
    const live = status === 'active';
    let kind: SharedLinkKind;
    let what: string;
    let actions: SharedLinkAction[];
    let pageUuid: string | null = null;
    if (scope.kind === 'keyword') {
      kind = 'tag';
      what = `Everything tagged ${scope.keyword}`;
      actions = live ? ['revoke'] : [];
    } else if (scope.pages === null) {
      kind = 'whole-area';
      what = `All of ${owner} ${scope.vault} vault`;
      actions = live ? (others ? ['revoke'] : ['extend', 'visits', 'revoke']) : [];
    } else {
      kind = 'chosen-pages';
      what = `${scope.pages.length} ${scope.pages.length === 1 ? 'page' : 'pages'} in ${owner} ${scope.vault} vault`;
      actions = live ? (others ? ['revoke'] : ['extend', 'visits', 'revoke']) : [];
      if (scope.pages.length === 1 && !others) pageUuid = scope.pages[0];
    }
    rows.push({ id: record.id, kind, what, label: others ? '' : record.label ?? '', pageUuid, status, expiresAt: record.expiresAt ?? null, createdAt: record.createdAt, madeBy: record.createdBy, actions });
  }
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** The Profile card's numbers: the same rows, counted (R5). */
export function sharedLinkCounts(records: readonly ShareRecord[], may: MakeableKinds, now: number): { active: number; total: number } {
  const rows = sharedLinkRows(records, may, now);
  return { active: rows.filter((r) => r.status === 'active').length, total: rows.length };
}
