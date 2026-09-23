/**
 * Private-store paths (#1383, epic #1382).
 *
 * On-disk join (law): resolved pages `storagedir` + `privateroot` + userid + storeid + file.
 * That is `{pagesDirectory}/{privateroot}/{user}/{store}/…` — a segment under the
 * existing pages directory (SLOW), not `${SLOW_STORAGE}/private` and not FAST_STORAGE.
 * User catalogs (`user-index.json` and siblings) live in that same user dir.
 *
 * Helpers take an optional layout override so unit tests need no live engine.
 * Defaults match `config/app-default-config.json`.
 */

import path from 'path';

export type PrivateStoreLayoutFiles = {
  userkeys: string;
  userindex: string;
  userversions: string;
  usertrash: string;
  storemeta: string;
  /** A store's own file index, beside `store.json` (#1400). */
  storefiles: string;
  /** A store's own page index, beside `store.json` (#1456). */
  storepages: string;
};

export type PrivateStoreLayout = {
  privateRoot: string;
  defaultStoreId: string;
  versionsDir: string;
  deletedDir: string;
  /** Non-page files inside a store: `{store}/{attachmentsDir}/{uuid}.ext` (#1400) */
  attachmentsDir: string;
  files: PrivateStoreLayoutFiles;
};

export type PrivateStoreLayoutOverrides = Partial<Omit<PrivateStoreLayout, 'files'>> & {
  files?: Partial<PrivateStoreLayoutFiles>;
};

export const DEFAULT_PRIVATE_STORE_LAYOUT: PrivateStoreLayout = {
  privateRoot: 'private',
  defaultStoreId: 'default',
  versionsDir: 'versions',
  deletedDir: 'deleted',
  attachmentsDir: 'attachments',
  files: {
    userkeys: 'user-keys.json',
    userindex: 'user-index.json',
    userversions: 'user-versions.json',
    usertrash: 'user-trash.json',
    storemeta: 'store.json',
    storefiles: 'files-index.json',
    storepages: 'pages-index.json'
  }
};

export const DEFAULT_PRIVATE_STORE = DEFAULT_PRIVATE_STORE_LAYOUT.defaultStoreId;
export const STORE_META_FILENAME = DEFAULT_PRIVATE_STORE_LAYOUT.files.storemeta;

export function resolvePrivateStoreLayout(
  overrides?: PrivateStoreLayoutOverrides
): PrivateStoreLayout {
  if (!overrides) return DEFAULT_PRIVATE_STORE_LAYOUT;
  return {
    privateRoot: overrides.privateRoot ?? DEFAULT_PRIVATE_STORE_LAYOUT.privateRoot,
    defaultStoreId: overrides.defaultStoreId ?? DEFAULT_PRIVATE_STORE_LAYOUT.defaultStoreId,
    versionsDir: overrides.versionsDir ?? DEFAULT_PRIVATE_STORE_LAYOUT.versionsDir,
    deletedDir: overrides.deletedDir ?? DEFAULT_PRIVATE_STORE_LAYOUT.deletedDir,
    attachmentsDir: overrides.attachmentsDir ?? DEFAULT_PRIVATE_STORE_LAYOUT.attachmentsDir,
    files: {
      ...DEFAULT_PRIVATE_STORE_LAYOUT.files,
      ...overrides.files
    }
  };
}

/** The four user-level catalog filenames from layout (not a second hardcoded list). */
export function privateUserCatalogFiles(layout?: PrivateStoreLayoutOverrides): Set<string> {
  const files = resolvePrivateStoreLayout(layout).files;
  return new Set([files.userkeys, files.userindex, files.userversions, files.usertrash]);
}

export const PRIVATE_USER_CATALOG_FILES = privateUserCatalogFiles();

export function privateStoreLayoutFromConfig(
  getProperty: (key: string, defaultValue: string) => unknown
): PrivateStoreLayout {
  const str = (key: string, fallback: string): string => {
    const value = getProperty(key, fallback);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  const d = DEFAULT_PRIVATE_STORE_LAYOUT;
  return {
    privateRoot: str('ngdpbase.page.provider.filesystem.privateroot', d.privateRoot),
    defaultStoreId: str('ngdpbase.page.provider.filesystem.defaultstoreid', d.defaultStoreId),
    versionsDir: str('ngdpbase.page.provider.filesystem.versionsdir', d.versionsDir),
    deletedDir: str('ngdpbase.page.provider.filesystem.deleteddir', d.deletedDir),
    attachmentsDir: str('ngdpbase.page.provider.filesystem.attachmentsdir', d.attachmentsDir),
    files: {
      userkeys: str('ngdpbase.page.provider.filesystem.private.files.userkeys', d.files.userkeys),
      userindex: str('ngdpbase.page.provider.filesystem.private.files.userindex', d.files.userindex),
      userversions: str(
        'ngdpbase.page.provider.filesystem.private.files.userversions',
        d.files.userversions
      ),
      usertrash: str('ngdpbase.page.provider.filesystem.private.files.usertrash', d.files.usertrash),
      storemeta: str('ngdpbase.page.provider.filesystem.private.files.storemeta', d.files.storemeta),
      storefiles: str('ngdpbase.page.provider.filesystem.private.files.storefiles', d.files.storefiles),
      storepages: str('ngdpbase.page.provider.filesystem.private.files.storepages', d.files.storepages)
    }
  };
}

/** A store id is a plain slug — an addon slug or `default` — never a path (#1383). */
const STORE_ID_SOURCE = '[a-z0-9]+(?:-[a-z0-9]+)*';
const STORE_ID_PATTERN = new RegExp(`^${STORE_ID_SOURCE}$`);

export function isValidStoreId(store: string): boolean {
  return STORE_ID_PATTERN.test(store);
}

/**
 * A private page's name (#1456, operator 2026-09-22): `private/{owner}/{store}/{title}` —
 * the same string as its URL without the leading slash. Wherever the system
 * passes a page name, a private page is named this way; a plain title always
 * means a public page. Titles never contain `/` (#1455), so the parts are
 * unambiguous.
 */
export const PRIVATE_PAGE_NAME_PREFIX = 'private/';

export interface PrivatePageName {
  owner: string;
  store: string;
  title: string;
}

export function formatPrivatePageName(owner: string, store: string, title: string): string {
  return `${PRIVATE_PAGE_NAME_PREFIX}${owner}/${store}/${title}`;
}

/** The parts of a private page name, or null when `name` is not one. */
export function parsePrivatePageName(name: unknown): PrivatePageName | null {
  if (typeof name !== 'string' || !name.startsWith(PRIVATE_PAGE_NAME_PREFIX)) return null;
  const parts = name.slice(PRIVATE_PAGE_NAME_PREFIX.length).split('/');
  if (parts.length !== 3) return null;
  const [owner, store, title] = parts;
  if (!owner || !isSafePathSegment(owner) || !isValidStoreId(store) || !title.trim()) return null;
  return { owner, store, title };
}

/**
 * A private page's LINK target, written inside brackets as `{store}/{Title}`
 * (#1457). The store belongs to the owner of the page the link sits in, so the
 * target names no user — {@link formatPrivatePageName} supplies the owner.
 *
 * `null` for anything else, including a target whose first segment is not a
 * store id (`Docs/Setup`) and one with a second `/`: titles never contain one
 * (#1455), so a deeper path is not a private page.
 */
export function parsePrivateLinkTarget(target: string): { store: string; title: string } | null {
  const slash = target.indexOf('/');
  if (slash <= 0) return null;
  const store = target.slice(0, slash);
  const title = target.slice(slash + 1);
  if (!isValidStoreId(store) || !title.trim() || title.includes('/')) return null;
  return { store, title };
}

/**
 * Could this content hold a `[store/Title]` link? A cheap pre-test so only a
 * page that may carry one pays for the owner lookup a render needs (#1457).
 * Non-global, so it is stateless and safe to share.
 */
const PRIVATE_LINK_CANDIDATE = new RegExp(`\\[(?:[^|\\]\\n]*\\|)?${STORE_ID_SOURCE}/[^\\]\\n]+\\]`);

export function mayContainPrivateLink(content: string): boolean {
  return PRIVATE_LINK_CANDIDATE.test(content);
}

/** Refuse a store id that is not a plain slug. Every join below runs it. */
export function assertStoreId(store: string): string {
  if (!isValidStoreId(store)) {
    throw new Error(`Invalid private store id ${JSON.stringify(store)}: must be a lowercase slug`);
  }
  return store;
}

/**
 * A user folder or file name is exactly one path segment. Usernames have no
 * enforced shape, so this refuses only what could leave the folder: empty,
 * `.`, `..`, a separator, or NUL.
 */
export function isSafePathSegment(segment: string): boolean {
  return segment.length > 0 && segment !== '.' && segment !== '..' && !/[/\\\0]/.test(segment);
}

export function assertPathSegment(segment: string, what: string): string {
  if (!isSafePathSegment(segment)) {
    throw new Error(`Invalid private store ${what} ${JSON.stringify(segment)}: must be one path segment`);
  }
  return segment;
}

function pageBasename(uuidOrBasename: string): string {
  return assertPathSegment(
    uuidOrBasename.endsWith('.md') ? uuidOrBasename : `${uuidOrBasename}.md`,
    'file name'
  );
}

export function privatePageFilePath(
  pagesDirectory: string,
  creator: string,
  uuidOrBasename: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  const storeId = store ?? L.defaultStoreId;
  return path.join(
    pagesDirectory,
    L.privateRoot,
    assertPathSegment(creator, 'user'),
    assertStoreId(storeId),
    pageBasename(uuidOrBasename)
  );
}

export function privateUserDir(
  pagesDirectory: string,
  username: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  return path.join(
    pagesDirectory,
    resolvePrivateStoreLayout(layout).privateRoot,
    assertPathSegment(username, 'user')
  );
}

export function privateUserKeysPath(
  pagesDirectory: string,
  username: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateUserDir(pagesDirectory, username, L), L.files.userkeys);
}

export function privateUserIndexPath(
  pagesDirectory: string,
  username: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateUserDir(pagesDirectory, username, L), L.files.userindex);
}

export function privateUserVersionsPath(
  pagesDirectory: string,
  username: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateUserDir(pagesDirectory, username, L), L.files.userversions);
}

export function privateUserTrashPath(
  pagesDirectory: string,
  username: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateUserDir(pagesDirectory, username, L), L.files.usertrash);
}

export type UserCatalogKind = 'index' | 'versions' | 'trash';

export function privateUserCatalogPath(
  pagesDirectory: string,
  username: string,
  kind: UserCatalogKind,
  layout?: PrivateStoreLayoutOverrides
): string {
  if (kind === 'versions') return privateUserVersionsPath(pagesDirectory, username, layout);
  if (kind === 'trash') return privateUserTrashPath(pagesDirectory, username, layout);
  return privateUserIndexPath(pagesDirectory, username, layout);
}

export function privateStoreRoot(
  pagesDirectory: string,
  creator: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateUserDir(pagesDirectory, creator, L), assertStoreId(store ?? L.defaultStoreId));
}

/**
 * Folder for a store's non-page files: `{privateroot}/{user}/{store}/{attachmentsdir}` (#1386).
 * Never the store root — an uploaded `.md` there would scan as a page.
 */
export function privateStoreAttachmentsDir(
  pagesDirectory: string,
  creator: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateStoreRoot(pagesDirectory, creator, store, L), L.attachmentsDir);
}

/** Non-page file in `{privateroot}/{user}/{store}/{attachmentsdir}/{file}` (#1386). */
export function privateStoreFilePath(
  pagesDirectory: string,
  creator: string,
  fileName: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  return path.join(
    privateStoreAttachmentsDir(pagesDirectory, creator, store, layout),
    assertPathSegment(fileName, 'file name')
  );
}

/**
 * True when `relParts` (path relative to the pages directory, split) names a
 * store's attachments folder: `{privateroot}/{user}/{store}/{attachmentsdir}`.
 * Depth-checked so a user or store that happens to be called `attachments` is not skipped.
 */
export function isPrivateStoreAttachmentsRel(
  relParts: string[],
  layout?: PrivateStoreLayoutOverrides
): boolean {
  const L = resolvePrivateStoreLayout(layout);
  return relParts.length === 4 && relParts[0] === L.privateRoot && relParts[3] === L.attachmentsDir;
}

export function storeMetaPath(
  pagesDirectory: string,
  creator: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateStoreRoot(pagesDirectory, creator, store, L), L.files.storemeta);
}

/** A store's own file index: `{privateroot}/{user}/{store}/{storefiles}` (#1400). */
export function storeFileIndexPath(
  pagesDirectory: string,
  creator: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateStoreRoot(pagesDirectory, creator, store, L), L.files.storefiles);
}

/** A store's own page index: `{privateroot}/{user}/{store}/{storepages}` (#1456). */
export function storePageIndexPath(
  pagesDirectory: string,
  creator: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateStoreRoot(pagesDirectory, creator, store, L), L.files.storepages);
}

export function privateVersionDirectory(
  pagesDirectory: string,
  creator: string,
  uuid: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(
    privateStoreRoot(pagesDirectory, creator, store, L),
    L.versionsDir,
    assertPathSegment(uuid, 'page id')
  );
}

export function privateDeletedDirectory(
  pagesDirectory: string,
  creator: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(privateStoreRoot(pagesDirectory, creator, store, L), L.deletedDir);
}

/** Pre-#1383 live file: `{pages}/{privateroot}/{user}/{file}.md`. */
export function legacyPrivatePageFilePath(
  pagesDirectory: string,
  creator: string,
  uuidOrBasename: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  return path.join(
    privateUserDir(pagesDirectory, creator, layout),
    pageBasename(uuidOrBasename)
  );
}

/** Legacy `pages/versions/private` = join(versionsdir, privateroot). No extra key. */
export function legacyPrivateVersionsRoot(
  pagesDirectory: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(pagesDirectory, L.versionsDir, L.privateRoot);
}

/**
 * True when `filePath` is inside the private root of `pagesDirectory`. Measured
 * from the pages directory, not by searching the absolute path for `/private/`
 * — which matched every page on a host whose data sits under `/private/var`
 * or `/private/tmp` (macOS).
 */
export function pathContainsPrivateRoot(
  pagesDirectory: string,
  filePath: string,
  layout?: PrivateStoreLayoutOverrides
): boolean {
  return isUnderPrivateRoot(path.relative(pagesDirectory, filePath).split(path.sep), layout);
}

/**
 * Relative path from the pages directory, split on the platform separator.
 * `{privateroot}/{user}/{store}/{file}.md` → store layout.
 * `{privateroot}/{user}/{file}.md` → legacy layout (pre-#1383).
 *
 * `null` for anything else, including a store folder whose name is not a valid
 * store id. A caller that finds `null` for a path under the private root must
 * skip the file, never treat it as a public page ({@link isUnderPrivateRoot}).
 */
export function parsePrivatePageRel(
  relParts: string[],
  layout?: PrivateStoreLayoutOverrides
): { creator: string; store: string } | null {
  const L = resolvePrivateStoreLayout(layout);
  if (relParts[0] !== L.privateRoot) return null;
  const last = relParts[relParts.length - 1];
  if (!last || !last.toLowerCase().endsWith('.md')) return null;
  if (!isSafePathSegment(relParts[1] ?? '')) return null;
  if (relParts.length === 4) {
    return isValidStoreId(relParts[2]) ? { creator: relParts[1], store: relParts[2] } : null;
  }
  if (relParts.length === 3) {
    return { creator: relParts[1], store: L.defaultStoreId };
  }
  return null;
}

/**
 * The store that holds a file at any depth — the live page, a version blob,
 * a trash record or an attachment: `{privateroot}/{user}/{store}/…`. `null`
 * for a file that is not inside a store, including the user-level catalogues
 * beside the stores (#1415).
 */
export function parsePrivateStoreRel(
  relParts: string[],
  layout?: PrivateStoreLayoutOverrides
): { creator: string; store: string } | null {
  const L = resolvePrivateStoreLayout(layout);
  if (relParts.length < 4 || relParts[0] !== L.privateRoot) return null;
  if (!isSafePathSegment(relParts[1]) || !isValidStoreId(relParts[2])) return null;
  return { creator: relParts[1], store: relParts[2] };
}

/** True when a path relative to the pages directory is inside the private root. */
export function isUnderPrivateRoot(
  relParts: string[],
  layout?: PrivateStoreLayoutOverrides
): boolean {
  return relParts[0] === resolvePrivateStoreLayout(layout).privateRoot;
}
