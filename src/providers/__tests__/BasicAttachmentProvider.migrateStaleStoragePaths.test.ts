/**
 * Tests for BasicAttachmentProvider.migrateStaleStoragePaths().
 *
 * Background — #259 / commit 9a8a0918: after a data migration (e.g. local SSD →
 * NAS, or NAS replacement), every attachment's `storageLocation` in
 * `attachment-metadata.json` still points at the old volume. Without correction,
 * `getAttachment()` would 404 every request despite the files existing on disk
 * under the new `storageDirectory`. `migrateStaleStoragePaths()` runs at the end
 * of `initialize()` and rewrites stale paths in place, preserving the basename
 * (hash filename) and routing private entries into their per-creator subdir.
 *
 * These tests cover the function in isolation — they construct a provider,
 * initialize it (so `storageDirectory` is set), inject metadata directly via the
 * private map, then call `migrateStaleStoragePaths()` and assert on the result.
 */

vi.unmock('../BasicAttachmentProvider');

import path from 'path';
import fs from 'fs-extra';
import os from 'os';

import BasicAttachmentProvider from '../BasicAttachmentProvider';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(storageDir: string) {
  const configManager = {
    getProperty: vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'ngdpbase.attachment.maxsize') return 10485760;
      if (key === 'ngdpbase.attachment.allowedtypes') return '';
      if (key === 'ngdpbase.attachment.provider.basic.hashmethod') return 'sha256';
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
      if (key === 'ngdpbase.attachment.metadatafile') return path.join(storageDir, 'attachment-metadata.json');
      return defaultValue;
    })
  };

  return {
    getManager: vi.fn().mockImplementation((name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      return null;
    })
  };
}

function makeSchema(id: string, storageLocation: string, extra: Record<string, unknown> = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    identifier: id,
    name: `${id.slice(0, 8)}.png`,
    description: '',
    author: { '@type': 'Person', name: 'Unknown' },
    editor: { '@type': 'Person', name: 'Unknown' },
    dateCreated: new Date().toISOString(),
    dateModified: new Date().toISOString(),
    encodingFormat: 'image/png',
    contentSize: 100,
    url: `/attachments/${id}`,
    storageLocation,
    isFamilyFriendly: true,
    mentions: [],
    isPrivate: false,
    ...extra
  };
}

describe('BasicAttachmentProvider.migrateStaleStoragePaths()', () => {
  let storageDir: string;
  let provider: BasicAttachmentProvider;
  let saveMetadataSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attach-migrate-test-'));
    provider = new BasicAttachmentProvider(makeEngine(storageDir));
    await provider.initialize();
    // Initialize ran migrate once over an empty map — reset metadata for each test.
    (provider as any).attachmentMetadata.clear();
    saveMetadataSpy = vi.spyOn(provider as any, 'saveMetadata').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    saveMetadataSpy.mockRestore();
    await fs.remove(storageDir);
  });

  it('rewrites stale absolute paths preserving the hash filename', async () => {
    const id = 'aabbccdd11223344'.padEnd(64, '0');
    const stale = `/Volumes/old-nas/attachments/${id}.png`;
    (provider as any).attachmentMetadata.set(id, makeSchema(id, stale));

    await (provider as any).migrateStaleStoragePaths();

    const entry = (provider as any).attachmentMetadata.get(id);
    expect(entry.storageLocation).toBe(path.join(storageDir, `${id}.png`));
    expect(path.basename(entry.storageLocation)).toBe(`${id}.png`);
    expect(saveMetadataSpy).toHaveBeenCalledTimes(1);
  });

  it('routes private attachments to <storageDirectory>/private/<creator>/', async () => {
    const id = 'priv1234deadbeef'.padEnd(64, '0');
    const creator = 'alice';
    const stale = `/Volumes/old-nas/attachments/private/${creator}/${id}.pdf`;
    (provider as any).attachmentMetadata.set(id, makeSchema(id, stale, {
      isPrivate: true,
      creator,
      encodingFormat: 'application/pdf'
    }));

    await (provider as any).migrateStaleStoragePaths();

    const entry = (provider as any).attachmentMetadata.get(id);
    expect(entry.storageLocation).toBe(
      path.join(storageDir, 'private', creator, `${id}.pdf`)
    );
    expect(saveMetadataSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves fresh paths untouched and does not call saveMetadata', async () => {
    const id = 'fresh1234abcdef0'.padEnd(64, '0');
    const fresh = path.join(storageDir, `${id}.webp`);
    (provider as any).attachmentMetadata.set(id, makeSchema(id, fresh, {
      encodingFormat: 'image/webp'
    }));

    await (provider as any).migrateStaleStoragePaths();

    const entry = (provider as any).attachmentMetadata.get(id);
    expect(entry.storageLocation).toBe(fresh);
    expect(saveMetadataSpy).not.toHaveBeenCalled();
  });

  it('handles a missing creator on a private entry (falls back to storageDirectory)', async () => {
    // Private + isPrivate=true but no creator — the ternary in migrateStaleStoragePaths
    // requires entry.creator to be truthy; absent it, expectedDir falls back to
    // the public storageDirectory rather than throwing or pathing into private/undefined/.
    const id = 'orph1234nocreator'.padEnd(64, '0');
    const stale = `/Volumes/old-nas/attachments/${id}.png`;
    (provider as any).attachmentMetadata.set(id, makeSchema(id, stale, {
      isPrivate: true
      // intentionally omitting creator
    }));

    await (provider as any).migrateStaleStoragePaths();

    const entry = (provider as any).attachmentMetadata.get(id);
    expect(entry.storageLocation).toBe(path.join(storageDir, `${id}.png`));
    expect(entry.storageLocation).not.toMatch(/undefined/);
  });

  it('rewrites every stale entry in a mixed fresh+stale batch with a single save', async () => {
    const stale1 = 'stale1111aaaa0000'.padEnd(64, '0');
    const stale2 = 'stale2222bbbb0000'.padEnd(64, '0');
    const fresh = 'freshcccc33330000'.padEnd(64, '0');

    (provider as any).attachmentMetadata.set(stale1, makeSchema(stale1,
      `/Volumes/old-nas/${stale1}.png`));
    (provider as any).attachmentMetadata.set(stale2, makeSchema(stale2,
      `/Volumes/older-nas/sub/${stale2}.pdf`, { encodingFormat: 'application/pdf' }));
    (provider as any).attachmentMetadata.set(fresh, makeSchema(fresh,
      path.join(storageDir, `${fresh}.jpg`), { encodingFormat: 'image/jpeg' }));

    await (provider as any).migrateStaleStoragePaths();

    expect((provider as any).attachmentMetadata.get(stale1).storageLocation)
      .toBe(path.join(storageDir, `${stale1}.png`));
    expect((provider as any).attachmentMetadata.get(stale2).storageLocation)
      .toBe(path.join(storageDir, `${stale2}.pdf`));
    expect((provider as any).attachmentMetadata.get(fresh).storageLocation)
      .toBe(path.join(storageDir, `${fresh}.jpg`));
    // Two entries migrated, one save call.
    expect(saveMetadataSpy).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second run is a no-op (no save, no further changes)', async () => {
    const id = 'idem1234abcdef00'.padEnd(64, '0');
    (provider as any).attachmentMetadata.set(id, makeSchema(id,
      `/Volumes/old-nas/${id}.png`));

    await (provider as any).migrateStaleStoragePaths();
    expect(saveMetadataSpy).toHaveBeenCalledTimes(1);

    saveMetadataSpy.mockClear();
    await (provider as any).migrateStaleStoragePaths();
    expect(saveMetadataSpy).not.toHaveBeenCalled();

    const entry = (provider as any).attachmentMetadata.get(id);
    expect(entry.storageLocation).toBe(path.join(storageDir, `${id}.png`));
  });

  it('skips silently when storageDirectory is not yet set', async () => {
    const orphanProvider = new BasicAttachmentProvider(
      makeEngine(storageDir)
    );
    // Don't initialize — storageDirectory stays null per the constructor.
    const orphanSave = vi.spyOn(orphanProvider as any, 'saveMetadata').mockResolvedValue(undefined);
    (orphanProvider as any).attachmentMetadata.set('x'.repeat(64),
      makeSchema('x'.repeat(64), '/Volumes/old/x.png'));

    await expect((orphanProvider as any).migrateStaleStoragePaths()).resolves.toBeUndefined();
    expect(orphanSave).not.toHaveBeenCalled();
    orphanSave.mockRestore();
  });
});
