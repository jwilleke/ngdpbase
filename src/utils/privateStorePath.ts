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
};

export type PrivateStoreLayout = {
  privateRoot: string;
  defaultStoreId: string;
  versionsDir: string;
  deletedDir: string;
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
  files: {
    userkeys: 'user-keys.json',
    userindex: 'user-index.json',
    userversions: 'user-versions.json',
    usertrash: 'user-trash.json',
    storemeta: 'store.json'
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
    files: {
      userkeys: str('ngdpbase.page.provider.filesystem.private.files.userkeys', d.files.userkeys),
      userindex: str('ngdpbase.page.provider.filesystem.private.files.userindex', d.files.userindex),
      userversions: str(
        'ngdpbase.page.provider.filesystem.private.files.userversions',
        d.files.userversions
      ),
      usertrash: str('ngdpbase.page.provider.filesystem.private.files.usertrash', d.files.usertrash),
      storemeta: str('ngdpbase.page.provider.filesystem.private.files.storemeta', d.files.storemeta)
    }
  };
}

function pageBasename(uuidOrBasename: string): string {
  return uuidOrBasename.endsWith('.md') ? uuidOrBasename : `${uuidOrBasename}.md`;
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
  return path.join(pagesDirectory, L.privateRoot, creator, storeId, pageBasename(uuidOrBasename));
}

export function privateUserDir(
  pagesDirectory: string,
  username: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  return path.join(pagesDirectory, resolvePrivateStoreLayout(layout).privateRoot, username);
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
  return path.join(pagesDirectory, L.privateRoot, creator, store ?? L.defaultStoreId);
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

export function privateVersionDirectory(
  pagesDirectory: string,
  creator: string,
  uuid: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(
    pagesDirectory,
    L.privateRoot,
    creator,
    store ?? L.defaultStoreId,
    L.versionsDir,
    uuid
  );
}

export function privateDeletedDirectory(
  pagesDirectory: string,
  creator: string,
  store?: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const L = resolvePrivateStoreLayout(layout);
  return path.join(
    pagesDirectory,
    L.privateRoot,
    creator,
    store ?? L.defaultStoreId,
    L.deletedDir
  );
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

export function pathContainsPrivateRoot(
  filePath: string,
  layout?: PrivateStoreLayoutOverrides
): boolean {
  const root = resolvePrivateStoreLayout(layout).privateRoot;
  return filePath.includes(`${path.sep}${root}${path.sep}`);
}

/**
 * Relative path from the pages directory, split on the platform separator.
 * `{privateroot}/{user}/{store}/{file}.md` → store layout.
 * `{privateroot}/{user}/{file}.md` → legacy layout (pre-#1383).
 */
export function parsePrivatePageRel(
  relParts: string[],
  layout?: PrivateStoreLayoutOverrides
): { creator: string; store: string } | null {
  const L = resolvePrivateStoreLayout(layout);
  if (relParts[0] !== L.privateRoot) return null;
  const last = relParts[relParts.length - 1];
  if (!last || !last.toLowerCase().endsWith('.md')) return null;
  if (relParts.length === 4) {
    return { creator: relParts[1], store: relParts[2] };
  }
  if (relParts.length === 3) {
    return { creator: relParts[1], store: L.defaultStoreId };
  }
  return null;
}
