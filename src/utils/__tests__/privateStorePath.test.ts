import path from 'path';
import {
  DEFAULT_PRIVATE_STORE,
  parsePrivatePageRel,
  privateDeletedDirectory,
  privatePageFilePath,
  privateStoreRoot,
  privateVersionDirectory
} from '../privateStorePath';

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

  test('version and deleted dirs sit inside the store (walkDir already skips those names)', () => {
    expect(privateVersionDirectory(pages, 'jim', 'uuid-1')).toBe(
      path.join(pages, 'private', 'jim', 'default', 'versions', 'uuid-1')
    );
    expect(privateDeletedDirectory(pages, 'jim')).toBe(
      path.join(pages, 'private', 'jim', 'default', 'deleted')
    );
  });
});
