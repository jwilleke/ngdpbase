/**
 * Private-store paths (#1383, epic #1382).
 *
 * Live private pages: `{pagesDirectory}/private/{user}/{store}/{uuid}.md`.
 * `default` is the store for today's private wiki pages.
 */

import path from 'path';

export const DEFAULT_PRIVATE_STORE = 'default';

/** User-level catalogs — files, not store directories. */
export const PRIVATE_USER_CATALOG_FILES = new Set([
  'user-index.json',
  'user-versions.json',
  'user-trash.json'
]);

export function privatePageFilePath(
  pagesDirectory: string,
  creator: string,
  uuidOrBasename: string,
  store: string = DEFAULT_PRIVATE_STORE
): string {
  const basename = uuidOrBasename.endsWith('.md') ? uuidOrBasename : `${uuidOrBasename}.md`;
  return path.join(pagesDirectory, 'private', creator, store, basename);
}

export function privateStoreRoot(
  pagesDirectory: string,
  creator: string,
  store: string = DEFAULT_PRIVATE_STORE
): string {
  return path.join(pagesDirectory, 'private', creator, store);
}

export function privateVersionDirectory(
  pagesDirectory: string,
  creator: string,
  uuid: string,
  store: string = DEFAULT_PRIVATE_STORE
): string {
  return path.join(pagesDirectory, 'private', creator, store, 'versions', uuid);
}

export function privateDeletedDirectory(
  pagesDirectory: string,
  creator: string,
  store: string = DEFAULT_PRIVATE_STORE
): string {
  return path.join(pagesDirectory, 'private', creator, store, 'deleted');
}

/**
 * Relative path from the pages directory, split on the platform separator.
 * `private/{user}/{store}/{file}.md` → store layout.
 * `private/{user}/{file}.md` → legacy layout (pre-#1383).
 */
export function parsePrivatePageRel(
  relParts: string[]
): { creator: string; store: string } | null {
  if (relParts[0] !== 'private') return null;
  const last = relParts[relParts.length - 1];
  if (!last || !last.toLowerCase().endsWith('.md')) return null;
  if (relParts.length === 4) {
    return { creator: relParts[1], store: relParts[2] };
  }
  if (relParts.length === 3) {
    return { creator: relParts[1], store: DEFAULT_PRIVATE_STORE };
  }
  return null;
}
