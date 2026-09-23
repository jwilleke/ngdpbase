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
  assertStoreId,
  isPrivateStoreAttachmentsRel,
  isSafePathSegment,
  isUnderPrivateRoot,
  isValidStoreId,
  mayContainPrivateLink,
  parsePrivateLinkTarget,
  pathContainsPrivateRoot,
  privateStoreAttachmentsDir,
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
    expect(shipped['ngdpbase.page.provider.filesystem.attachmentsdir']).toBe('attachments');
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
    expect(DEFAULT_PRIVATE_STORE_LAYOUT.attachmentsDir).toBe(
      shipped['ngdpbase.page.provider.filesystem.attachmentsdir']
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

  test('store files live in private/{user}/{store}/attachments/, not the store root (#1386)', () => {
    expect(privateStoreAttachmentsDir(pages, 'molly')).toBe(
      path.join(pages, 'private', 'molly', 'default', 'attachments')
    );
    expect(privateStoreFilePath(pages, 'molly', 'aabb.pdf')).toBe(
      path.join(pages, 'private', 'molly', 'default', 'attachments', 'aabb.pdf')
    );
    expect(privateStoreFilePath(pages, 'molly', 'aabb.pdf', 'yourphr')).toBe(
      path.join(pages, 'private', 'molly', 'yourphr', 'attachments', 'aabb.pdf')
    );
    // An uploaded markdown file in the store is an attachment, never a page path.
    const mdRel = path.relative(pages, privateStoreFilePath(pages, 'molly', 'aabb.md')).split(path.sep);
    expect(parsePrivatePageRel(mdRel)).toBeNull();
  });

  test('isPrivateStoreAttachmentsRel matches only the store-level attachments folder', () => {
    expect(isPrivateStoreAttachmentsRel(['private', 'molly', 'default', 'attachments'])).toBe(true);
    expect(isPrivateStoreAttachmentsRel(['private', 'molly', 'yourphr', 'attachments'])).toBe(true);
    // A user or store literally named "attachments" is not the files folder.
    expect(isPrivateStoreAttachmentsRel(['private', 'attachments'])).toBe(false);
    expect(isPrivateStoreAttachmentsRel(['private', 'molly', 'attachments'])).toBe(false);
    expect(isPrivateStoreAttachmentsRel(['attachments'])).toBe(false);
    expect(isPrivateStoreAttachmentsRel(['vault', 'molly', 'home', 'files'], {
      privateRoot: 'vault',
      attachmentsDir: 'files'
    })).toBe(true);
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
      attachmentsDir: 'files',
      files: { storemeta: 'meta.json', userkeys: 'keys.json' }
    };
    expect(privatePageFilePath(pages, 'jim', 'x.md', undefined, layout)).toBe(
      path.join(pages, 'vault', 'jim', 'home', 'x.md')
    );
    expect(privateStoreFilePath(pages, 'molly', 'aabb.pdf', undefined, layout)).toBe(
      path.join(pages, 'vault', 'molly', 'home', 'files', 'aabb.pdf')
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
    expect(seen).toContain('ngdpbase.page.provider.filesystem.attachmentsdir');
    expect(layout.attachmentsDir).toBe('attachments');
    expect(seen).not.toContain('ngdpbase.page.provider.filesystem.storagedir');
    expect(privatePageFilePath(pages, 'jim', 'u.md', undefined, layout)).toBe(
      path.join(pages, 'sealed', 'jim', 'default', 'u.md')
    );
  });
});

describe('store ids and path segments are validated inside every join (#1383)', () => {
  const pages = path.join('/data', 'pages');

  test('a store id is a plain lowercase slug', () => {
    for (const ok of ['default', 'yourphr', 'my-store', 'store2']) {
      expect(isValidStoreId(ok)).toBe(true);
    }
    for (const bad of ['', '..', '../x', 'a/b', 'Your', 'your phr', '-x', 'x-', 'a--b', 'a_b']) {
      expect(isValidStoreId(bad)).toBe(false);
      expect(() => assertStoreId(bad)).toThrow(/Invalid private store id/);
    }
  });

  test('a user or file segment may be any single segment, never a way out', () => {
    for (const ok of ['jim', 'jim.willeke', 'a@b.com', 'Molly']) {
      expect(isSafePathSegment(ok)).toBe(true);
    }
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'a\0b']) {
      expect(isSafePathSegment(bad)).toBe(false);
    }
  });

  test('every helper refuses a bad store, user or file name before joining', () => {
    expect(() => privatePageFilePath(pages, 'molly', 'u.md', '../../etc')).toThrow(/store id/);
    expect(() => privatePageFilePath(pages, '..', 'u.md')).toThrow(/user/);
    expect(() => privatePageFilePath(pages, 'molly', '../u.md')).toThrow(/file name/);
    expect(() => privateStoreRoot(pages, 'molly', 'A')).toThrow(/store id/);
    expect(() => privateStoreFilePath(pages, 'molly', '../x.pdf')).toThrow(/file name/);
    expect(() => privateVersionDirectory(pages, 'molly', '../u')).toThrow(/page id/);
    expect(() => privateDeletedDirectory(pages, 'molly', 'x/y')).toThrow(/store id/);
    expect(() => storeMetaPath(pages, '../molly')).toThrow(/user/);
    expect(() => privateUserDir(pages, '')).toThrow(/user/);
  });

  test('parsePrivatePageRel rejects a store folder that is not a store id; isUnderPrivateRoot still sees it', () => {
    const rel = ['private', 'molly', 'Not A Store', 'u.md'];
    expect(parsePrivatePageRel(rel)).toBeNull();
    expect(isUnderPrivateRoot(rel)).toBe(true);
    expect(parsePrivatePageRel(['private', '..', 'default', 'u.md'])).toBeNull();
    expect(isUnderPrivateRoot(['u.md'])).toBe(false);
  });
});

describe('pathContainsPrivateRoot is measured from the pages directory', () => {
  test('a host path that itself contains /private/ does not make every page private (macOS /private/var)', () => {
    const pages = path.join(path.sep, 'private', 'var', 'data', 'pages');
    expect(pathContainsPrivateRoot(pages, path.join(pages, 'u.md'))).toBe(false);
    expect(pathContainsPrivateRoot(pages, path.join(pages, 'private', 'jim', 'default', 'u.md'))).toBe(true);
    expect(pathContainsPrivateRoot(pages, path.join(path.sep, 'elsewhere', 'private', 'x.md'))).toBe(false);
  });
});

describe('the private link target `[store/Title]` (#1457)', () => {
  test('a valid store id and a title', () => {
    expect(parsePrivateLinkTarget('vault/Diary')).toEqual({ store: 'vault', title: 'Diary' });
    expect(parsePrivateLinkTarget('default/Diary Notes')).toEqual({ store: 'default', title: 'Diary Notes' });
    expect(parsePrivateLinkTarget('my-store/Diary')).toEqual({ store: 'my-store', title: 'Diary' });
  });

  test('anything that is not one keeps today\'s meaning', () => {
    expect(parsePrivateLinkTarget('Diary')).toBeNull();
    expect(parsePrivateLinkTarget('Docs/Setup')).toBeNull();
    expect(parsePrivateLinkTarget('/Diary')).toBeNull();
    expect(parsePrivateLinkTarget('vault/')).toBeNull();
    // Titles never contain `/` (#1455), so a deeper path is not a page.
    expect(parsePrivateLinkTarget('vault/sub/Diary')).toBeNull();
  });

  test('mayContainPrivateLink spends the owner lookup only on a candidate', () => {
    expect(mayContainPrivateLink('See [vault/Diary].')).toBe(true);
    expect(mayContainPrivateLink('See [My diary|vault/Diary].')).toBe(true);
    expect(mayContainPrivateLink('See [Diary] and [Home].')).toBe(false);
    expect(mayContainPrivateLink('See [Google|https://example.com/a].')).toBe(false);
  });
});
