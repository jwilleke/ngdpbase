/**
 * A store's own page index — #1456 (epic #1454, #1382).
 *
 * A store is self-contained: its pages are listed in `{store}/pages-index.json`,
 * written through the store's I/O — sealed when the store is encrypted — and
 * read when needed. Exercised through FileSystemProvider, the concrete
 * provider that inherits it from BasePageProvider.
 */

vi.unmock('../FileSystemProvider');

import { randomBytes } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import FileSystemProvider from '../FileSystemProvider';
import { PLAIN_FILE_IO, type StoreFileIO } from '../../utils/privateStoreFiles';
import { isSealedBytes, openBytes, sealBytes } from '../../utils/privateStoreCrypto';
import { storePageIndexPath } from '../../utils/privateStorePath';
import type { StoreFileLocation } from '../../types/Provider';
import { writeFileAtomic } from '../../utils/atomicWrite';

type StorePageEntry = ReturnType<typeof entry>;

type StorePages = {
  readStorePages(dir: string, loc: StoreFileLocation): Promise<Record<string, StorePageEntry>>;
  putStorePage(dir: string, loc: StoreFileLocation, entry: StorePageEntry): Promise<void>;
  dropStorePage(dir: string, loc: StoreFileLocation, uuid: string): Promise<boolean>;
  findStorePage(dir: string, loc: StoreFileLocation, key: string): Promise<StorePageEntry | null>;
};

function sealedIO(dek: Buffer): StoreFileIO {
  return {
    sealed: true,
    readText: async (f) => openBytes(dek, await fs.readFile(f)).toString('utf8'),
    writeText: (f, t) => writeFileAtomic(f, sealBytes(dek, Buffer.from(t, 'utf8'))),
    readBytes: async (f) => openBytes(dek, await fs.readFile(f)),
    writeBytes: (f, b) => writeFileAtomic(f, sealBytes(dek, b))
  };
}

const entry = (uuid: string, title: string, slug?: string) => ({
  title, uuid, ...(slug ? { slug } : {}), currentVersion: 1, location: 'private' as const, creator: 'molly',
  store: 'default', lastModified: '2026-09-22T00:00:00.000Z', editor: 'molly', hasVersions: false, isPrivate: true as const
});

describe('a store\'s own page index (#1456)', () => {
  let tmp: string;
  let provider: StorePages;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'store-pages-'));
    provider = new FileSystemProvider({ getManager: () => null });
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  const plain: StoreFileLocation = { owner: 'molly', store: 'default', io: PLAIN_FILE_IO };

  test('an unencrypted store lists its pages in its own folder, as plain JSON', async () => {
    await provider.putStorePage(tmp, plain, entry('u-1', 'Diary', 'diary'));
    const file = storePageIndexPath(tmp, 'molly', 'default');
    expect(file).toBe(path.join(tmp, 'private', 'molly', 'default', 'pages-index.json'));
    expect(JSON.parse(await fs.readFile(file, 'utf8')).pages['u-1'].title).toBe('Diary');
  });

  test('found by uuid, title or slug — case-insensitive; unknown is null', async () => {
    await provider.putStorePage(tmp, plain, entry('u-1', 'Diary', 'my-diary'));
    expect((await provider.findStorePage(tmp, plain, 'u-1'))?.title).toBe('Diary');
    expect((await provider.findStorePage(tmp, plain, 'diary'))?.uuid).toBe('u-1');
    expect((await provider.findStorePage(tmp, plain, 'MY-DIARY'))?.uuid).toBe('u-1');
    expect(await provider.findStorePage(tmp, plain, 'Nope')).toBeNull();
  });

  test('an encrypted store\'s index is sealed at rest and reads back with the key', async () => {
    const dek = randomBytes(32);
    const sealed: StoreFileLocation = { owner: 'molly', store: 'vault', io: sealedIO(dek) };
    await provider.putStorePage(tmp, sealed, { ...entry('u-2', 'Merger notes'), store: 'vault' });
    const raw = await fs.readFile(storePageIndexPath(tmp, 'molly', 'vault'));
    expect(isSealedBytes(raw)).toBe(true);
    expect(raw.includes(Buffer.from('Merger notes'))).toBe(false);
    expect((await provider.findStorePage(tmp, sealed, 'merger notes'))?.uuid).toBe('u-2');
  });

  test('drop removes one page and says whether it was there', async () => {
    await provider.putStorePage(tmp, plain, entry('u-1', 'Diary'));
    await provider.putStorePage(tmp, plain, entry('u-3', 'Recipes'));
    expect(await provider.dropStorePage(tmp, plain, 'u-1')).toBe(true);
    expect(await provider.dropStorePage(tmp, plain, 'u-1')).toBe(false);
    expect(Object.keys(await provider.readStorePages(tmp, plain))).toEqual(['u-3']);
  });

  test('a store with no index yet has no pages', async () => {
    expect(await provider.readStorePages(tmp, plain)).toEqual({});
  });
});
