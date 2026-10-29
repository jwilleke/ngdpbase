/**
 * A shared folder's page name is its URL (#2125): `shared/{folder}/{title}`,
 * the container `shared-folders`' vault. No account can take that name, and
 * the vault form of it is not a name at all.
 */
import { formatPrivatePageName, parsePrivatePageName, SHARED_FOLDER_OWNER } from '../privateStorePath';
import { pageUrl } from '../pageUrl';
import { isReservedUsername } from '../username';
import { mayActInPrivateContainer } from '../privateStoreAccess';
import { sharedFolderPermissionFor } from '../sharedFolderAccess';

describe('shared folder names (#2125)', () => {
  test('format and parse round-trip as shared/{folder}/{title}', () => {
    const name = formatPrivatePageName(SHARED_FOLDER_OWNER, 'default', 'Minutes');
    expect(name).toBe('shared/default/Minutes');
    expect(parsePrivatePageName(name)).toEqual({ owner: SHARED_FOLDER_OWNER, store: 'default', title: 'Minutes' });
  });

  test('the vault form, a deeper path and a bad folder are not names', () => {
    expect(parsePrivatePageName('vaults/shared-folders/default/Minutes')).toBeNull();
    expect(parsePrivatePageName('shared/default/a/b')).toBeNull();
    expect(parsePrivatePageName('shared/Bad Folder/Minutes')).toBeNull();
    expect(parsePrivatePageName('shared/default/ ')).toBeNull();
  });

  test('the URL is the name', () => {
    expect(pageUrl('shared/default/Board minutes')).toBe('/shared/default/Board%20minutes');
    expect(pageUrl('shared/default/Minutes', 'edit')).toBe('/shared/default/Minutes/edit');
  });

  test('no account may be called shared-folders, and the owner rule admits nobody to the container', () => {
    expect(isReservedUsername('shared-folders')).toBe(true);
    expect(isReservedUsername('Shared-Folders')).toBe(true);
    const named = { username: 'shared-folders', roles: [], isAuthenticated: true } as never;
    expect(mayActInPrivateContainer(named, SHARED_FOLDER_OWNER, { vault: 'default' })).toBe(false);
  });

  test('reads ask shared-folder-read, writes shared-folder-file, and nothing else is allowed', () => {
    for (const a of ['view', 'page-read', 'asset-read', 'history', 'diff']) expect(sharedFolderPermissionFor(a)).toBe('shared-folder-read');
    for (const a of ['edit', 'save', 'delete', 'create', 'rename', 'asset-upload', 'asset-delete']) expect(sharedFolderPermissionFor(a)).toBe('shared-folder-file');
    for (const a of ['share-create', 'share-extend', 'page-export', 'page-raw-edit', 'admin-system']) expect(sharedFolderPermissionFor(a)).toBeNull();
  });
});
