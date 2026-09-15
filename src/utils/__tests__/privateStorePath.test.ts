import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PRIVATE_STORE,
  DEFAULT_PRIVATE_STORE_LAYOUT,
  PRIVATE_USER_CATALOG_FILES,
  legacyPrivatePageFilePath,
  legacyPrivateVersionsRoot,
  parsePrivatePageRel,
  privateDeletedDirectory,
  privatePageFilePath,
  privateStoreFilePath,
  privateStoreLayoutFromConfig,
  privateStoreRoot,
  privateUserCatalogFiles,
  privateUserDir,
  privateUserKeysPath,
  privateVersionDirectory,
  storeMetaPath
} from '../privateStorePath';

const shipped = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')
) as Record<string, unknown>;

describe('private-store filesystem config keys', () => {
  test('app-default-config ships the approved keys with those defaults', () => {
    expect(shipped['_comment_page_private_store']).toEqual(expect.any(String));
    expect(shipped['ngdpbase.page.provider.filesystem.privateroot']).toBe('private');
    expect(shipped['ngdpbase.page.provider.filesystem.defaultstoreid']).toBe('default');
    expect(shipped['ngdpbase.page.provider.filesystem.versionsdir']).toBe('versions');
    expect(shipped['ngdpbase.page.provider.filesystem.deleteddir']).toBe('deleted');
    expect(shipped['ngdpbase.page.provider.filesystem.private.files.userkeys']).toBe('user-keys.json');
    expect(shipped['ngdpbase.page.provider.filesystem.private.files.userindex']).toBe('user-index.json');
    expect(shipped['ngdpbase.page.provider.filesystem.private.files.userversions']).toBe(
      'user-versions.json'
    );
    expect(shipped['ngdpbase.page.provider.filesystem.private.files.usertrash']).toBe('user-trash.json');
    expect(shipped['ngdpbase.page.provider.filesystem.private.files.storemeta']).toBe('store.json');
    // privateroot is a folder name under existing storagedir, not a second data root.
    expect(String(shipped['ngdpbase.page.provider.filesystem.privateroot'])).not.toMatch(
      /SLOW_STORAGE|FAST_STORAGE|[\\/]/
    );
    expect(shipped['ngdpbase.page.provider.filesystem.storagedir']).toBe('${SLOW_STORAGE}/pages');
  });

  test('helper defaults match the shipped JSON so tests without config compose the same paths', () => {
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.privateRoot).toBe(
      shipped['ngdpbase.page.provider.filesystem.privateroot']
    );
    expect(DEFAULT_PRIVATE_STORE).toBe(shipped['ngdpbase.page.provider.filesystem.defaultstoreid']);
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.versionsDir).toBe(
      shipped['ngdpbase.page.provider.filesystem.versionsdir']
    );
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.deletedDir).toBe(
      shipped['ngdpbase.page.provider.filesystem.deleteddir']
    );
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.files.userkeys).toBe(
      shipped['ngdpbase.page.provider.filesystem.private.files.userkeys']
    );
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.files.userindex).toBe(
      shipped['ngdpbase.page.provider.filesystem.private.files.userindex']
    );
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.files.userversions).toBe(
      shipped['ngdpbase.page.provider.filesystem.private.files.userversions']
    );
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.files.usertrash).toBe(
      shipped['ngdpbase.page.provider.filesystem.private.files.usertrash']
    );
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.files.storemeta).toBe(
      shipped['ngdpbase.page.provider.filesystem.private.files.storemeta']
    );
  });
});

describe('privateStorePath (#1383)', () => {
  const pages = '/data/pages';

  test('live file is private/{user}/{store}/{uuid}.md', () => {
    expect(privatePageFilePath(pages, 'jim', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(
      path.join(pages, 'private', 'jim', 'default', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.md')
    );
    expect(privatePageFilePath(pages, 'jim', 'x.md', 'yourphr')).toBe(
      path.join(pages, 'private', 'jim', 'yourphr', 'x.md')
    );
  });

  test('parsePrivatePageRel reads store layout and treats legacy three-segment paths as default', () => {
    expect(parsePrivatePageRel(['private', 'molly', 'default', 'u.md'])).toEqual({
      creator: 'molly',
      store: 'default'
    });
    expect(parsePrivatePageRel(['private', 'molly', 'u.md'])).toEqual({
      creator: 'molly',
      store: DEFAULT_PRIVATE_STORE
    });
    expect(parsePrivatePageRel(['private', 'molly', 'default'])).toBeNull();
    expect(parsePrivatePageRel(['pages', 'u.md'])).toBeNull();
  });

  test('does not treat the store directory name as a page file', () => {
    expect(parsePrivatePageRel(['private', 'molly', 'default'])).toBeNull();
    expect(privateStoreRoot(pages, 'molly')).toBe(path.join(pages, 'private', 'molly', 'default'));
  });

  test('store files sit beside pages in private/{user}/{store}/ (#1386)', () => {
    expect(privateStoreFilePath(pages, 'molly', 'aabb.pdf')).toBe(
      path.join(pages, 'private', 'molly', 'default', 'aabb.pdf')
    );
    expect(privateStoreFilePath(pages, 'molly', 'aabb.pdf', 'yourphr')).toBe(
      path.join(pages, 'private', 'molly', 'yourphr', 'aabb.pdf')
    );
  });

  test('version and deleted dirs sit inside the store (walkDir already skips those names)', () => {
    expect(privateVersionDirectory(pages, 'jim', 'uuid-1')).toBe(
      path.join(pages, 'private', 'jim', 'default', 'versions', 'uuid-1')
    );
    expect(privateDeletedDirectory(pages, 'jim')).toBe(
      path.join(pages, 'private', 'jim', 'default', 'deleted')
    );
  });

  test('PRIVATE_USER_CATALOG_FILES is the four private.files.* catalog names', () => {
    expect([...PRIVATE_USER_CATALOG_FILES].sort()).toEqual(
      [
        DEFAULT_PRIVATE_STORE_LAYOUT.files.userindex,
        DEFAULT_PRIVATE_STORE_LAYOUT.files.userkeys,
        DEFAULT_PRIVATE_STORE_LAYOUT.files.usertrash,
        DEFAULT_PRIVATE_STORE_LAYOUT.files.userversions
      ].sort()
    );
    expect(
      [...privateUserCatalogFiles({ files: { userkeys: 'keys.json' } })].sort()
    ).toEqual(['keys.json', 'user-index.json', 'user-trash.json', 'user-versions.json'].sort());
  });

  test('helpers compose using injected layout segments', () => {
    const layout = {
      privateRoot: 'vault',
      defaultStoreId: 'home',
      versionsDir: 'history',
      deletedDir: 'trash',
      files: { storemeta: 'meta.json', userkeys: 'keys.json' }
    };
    expect(privatePageFilePath(pages, 'jim', 'x.md', undefined, layout)).toBe(
      path.join(pages, 'vault', 'jim', 'home', 'x.md')
    );
    expect(privateStoreFilePath(pages, 'molly', 'aabb.pdf', undefined, layout)).toBe(
      path.join(pages, 'vault', 'molly', 'home', 'aabb.pdf')
    );
    expect(privateStoreRoot(pages, 'molly', 'yourphr', layout)).toBe(
      path.join(pages, 'vault', 'molly', 'yourphr')
    );
    expect(privateUserDir(pages, 'molly', layout)).toBe(path.join(pages, 'vault', 'molly'));
    expect(privateUserKeysPath(pages, 'molly', layout)).toBe(
      path.join(pages, 'vault', 'molly', 'keys.json')
    );
    expect(storeMetaPath(pages, 'molly', 'home', layout)).toBe(
      path.join(pages, 'vault', 'molly', 'home', 'meta.json')
    );
    expect(privateVersionDirectory(pages, 'jim', 'uuid-1', undefined, layout)).toBe(
      path.join(pages, 'vault', 'jim', 'home', 'history', 'uuid-1')
    );
    expect(privateDeletedDirectory(pages, 'jim', undefined, layout)).toBe(
      path.join(pages, 'vault', 'jim', 'home', 'trash')
    );
    expect(legacyPrivateVersionsRoot(pages, layout)).toBe(path.join(pages, 'history', 'vault'));
    expect(legacyPrivatePageFilePath(pages, 'molly', 'u.md', layout)).toBe(
      path.join(pages, 'vault', 'molly', 'u.md')
    );
    expect(parsePrivatePageRel(['vault', 'molly', 'home', 'u.md'], layout)).toEqual({
      creator: 'molly',
      store: 'home'
    });
    expect(parsePrivatePageRel(['private', 'molly', 'default', 'u.md'], layout)).toBeNull();
  });

  test('a non-default privateroot (sealed) changes joined paths', () => {
    const layout = { privateRoot: 'sealed' };
    expect(privatePageFilePath(pages, 'jim', 'u.md', 'default', layout)).toBe(
      path.join(pages, 'sealed', 'jim', 'default', 'u.md')
    );
    expect(privateStoreRoot(pages, 'molly', undefined, layout)).toBe(
      path.join(pages, 'sealed', 'molly', 'default')
    );
    expect(legacyPrivateVersionsRoot(pages, layout)).toBe(
      path.join(pages, 'versions', 'sealed')
    );
    expect(parsePrivatePageRel(['sealed', 'molly', 'u.md'], layout)).toEqual({
      creator: 'molly',
      store: DEFAULT_PRIVATE_STORE
    });
  });

  test('privateStoreLayoutFromConfig uses getProperty fallbacks, not a live engine', () => {
    const seen: string[] = [];
    const layout = privateStoreLayoutFromConfig((key, fallback) => {
      seen.push(key);
      if (key === 'ngdpbase.page.provider.filesystem.privateroot') return 'sealed';
      return fallback;
    });
    expect(layout.privateRoot).toBe('sealed');
    expect(layout.defaultStoreId).toBe('default');
    expect(layout.files.userkeys).toBe('user-keys.json');
    expect(seen).toContain('ngdpbase.page.provider.filesystem.privateroot');
    expect(seen).toContain('ngdpbase.page.provider.filesystem.defaultstoreid');
    expect(seen).not.toContain('ngdpbase.page.provider.filesystem.storagedir');
    expect(privatePageFilePath(pages, 'jim', 'u.md', undefined, layout)).toBe(
      path.join(pages, 'sealed', 'jim', 'default', 'u.md')
    );
  });
});
