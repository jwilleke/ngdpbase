/**
 * Tests for BasicAttachmentProvider.getAttachment() disk-scan fallback.
 *
 * When an attachment file exists on disk but has no metadata record (orphaned
 * file), getAttachment() should scan the storage directory, serve the file,
 * and infer the MIME type from the extension.
 */

// Unmock BasicAttachmentProvider — the global vi.setup.js mocks it, but
// these tests need the real implementation.
vi.unmock('../BasicAttachmentProvider');

import path from 'path';
import fs from 'fs-extra';
import os from 'os';

import BasicAttachmentProvider from '../BasicAttachmentProvider';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(storageDir, pagesDir) {
  const configManager = {
    getProperty: vi.fn().mockImplementation((key, defaultValue) => {
      if (key === 'ngdpbase.attachment.maxsize') return 10485760;
      if (key === 'ngdpbase.attachment.allowedtypes') return '';
      if (key === 'ngdpbase.attachment.provider.basic.hashmethod') return 'sha256';
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn().mockImplementation((key, defaultValue) => {
      if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
      if (key === 'ngdpbase.attachment.metadatafile') return path.join(storageDir, 'attachment-metadata.json');
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir ?? defaultValue;
      return defaultValue;
    })
  };

  return {
    getManager: vi.fn().mockImplementation((name) => {
      if (name === 'ConfigurationManager') return configManager;
      return null;
    })
  };
}

describe('BasicAttachmentProvider — getAttachment() disk-scan fallback', () => {
  let tmp;
  let storageDir;
  let pagesDir;
  let provider;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'attach-test-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    provider = new BasicAttachmentProvider(makeEngine(storageDir, pagesDir));
    await provider.initialize();
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  it('file {id}.webp exists, no metadata → returns buffer and image/webp', async () => {
    const attachmentId = 'c92808abcdef1234'.padEnd(64, '0');
    const filePath = path.join(storageDir, `${attachmentId}.webp`);
    await fs.writeFile(filePath, Buffer.from('fake-webp-data'));

    const result = await provider.getAttachment(attachmentId);

    expect(result).not.toBeNull();
    expect(result.buffer.toString()).toBe('fake-webp-data');
    expect(result.metadata.mimeType).toBe('image/webp');
    expect(result.metadata.encodingFormat).toBe('image/webp'); // route uses this for Content-Type
    expect(result.metadata.id).toBe(attachmentId);
    expect(result.metadata.name).toBe(`${attachmentId}.webp`); // route uses this for Content-Disposition
    expect(result.metadata.filename).toBe(`${attachmentId}.webp`);
    expect(result.metadata.contentSize).toBe(14);             // route uses this for Content-Length
  });

  it('file {id}.png exists, no metadata → returns buffer and image/png', async () => {
    const attachmentId = 'deadbeef1234abcd'.padEnd(64, '0');
    const filePath = path.join(storageDir, `${attachmentId}.png`);
    await fs.writeFile(filePath, Buffer.from('fake-png-data'));

    const result = await provider.getAttachment(attachmentId);

    expect(result).not.toBeNull();
    expect(result.metadata.mimeType).toBe('image/png');
  });

  it('file {id}.pdf exists, no metadata → returns buffer and application/pdf', async () => {
    const attachmentId = 'abcdef1234567890'.padEnd(64, '0');
    const filePath = path.join(storageDir, `${attachmentId}.pdf`);
    await fs.writeFile(filePath, Buffer.from('fake-pdf-data'));

    const result = await provider.getAttachment(attachmentId);

    expect(result).not.toBeNull();
    expect(result.metadata.mimeType).toBe('application/pdf');
  });

  it('unknown extension → returns application/octet-stream', async () => {
    const attachmentId = 'ffff1234abcd5678'.padEnd(64, '0');
    const filePath = path.join(storageDir, `${attachmentId}.xyz`);
    await fs.writeFile(filePath, Buffer.from('some-data'));

    const result = await provider.getAttachment(attachmentId);

    expect(result).not.toBeNull();
    expect(result.metadata.mimeType).toBe('application/octet-stream');
  });

  it('neither metadata nor file → returns null', async () => {
    const result = await provider.getAttachment('nonexistent' + '0'.repeat(53));

    expect(result).toBeNull();
  });

  it('logs warning when serving orphaned file', async () => {
    const attachmentId = 'orphan1234abcdef'.padEnd(64, '0');
    await fs.writeFile(path.join(storageDir, `${attachmentId}.webp`), Buffer.from('data'));

    // logger is globally mocked in vitest.setup.ts
    const loggerMod = await import('../../utils/logger');
    const logger = (loggerMod).default ?? loggerMod;
    logger.warn.mockClear();

    await provider.getAttachment(attachmentId);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('orphaned')
    );
  });
});

describe('BasicAttachmentProvider — getAttachment() stale storageLocation fallback', () => {
  let tmp;
  let storageDir;
  let pagesDir;
  let provider;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'attach-stale-test-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    provider = new BasicAttachmentProvider(makeEngine(storageDir, pagesDir));
    await provider.initialize();
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  it('metadata exists with stale NAS storageLocation → file served from configured storageDirectory', async () => {
    const attachmentId = 'aabbccdd11223344'.padEnd(64, '0');
    const filename = `${attachmentId}.png`;
    const localFilePath = path.join(storageDir, filename);
    await fs.writeFile(localFilePath, Buffer.from('png-content'));

    // Inject metadata with a stale storageLocation pointing to an inaccessible path
    provider['attachmentMetadata'].set(attachmentId, {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      identifier: attachmentId,
      name: 'iran-provinces.png',
      description: 'iran-provinces.png',
      author: { '@type': 'Person', name: 'Unknown' },
      editor: { '@type': 'Person', name: 'Unknown' },
      dateCreated: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      encodingFormat: 'image/png',
      contentSize: 11,
      url: `/attachments/${attachmentId}`,
      storageLocation: `/Volumes/jims/old-nas/attachments/${filename}`, // stale path
      isFamilyFriendly: true,
      mentions: [],
      isPrivate: false
    });

    const result = await provider.getAttachment(attachmentId);

    expect(result).not.toBeNull();
    expect(result.buffer.toString()).toBe('png-content');
    expect(result.metadata.name).toBe('iran-provinces.png');
    expect(result.metadata.mimeType).toBe('image/png');
    expect(result.metadata.filePath).toBe(localFilePath);
  });

  it('private attachment with stale storageLocation → file served from the page store', async () => {
    const attachmentId = 'priv1234deadbeef'.padEnd(64, '0');
    const creator = 'alice';
    const filename = `${attachmentId}.pdf`;
    const storeDir = path.join(pagesDir, 'private', creator, 'default', 'attachments');
    await fs.ensureDir(storeDir);
    const localFilePath = path.join(storeDir, filename);
    await fs.writeFile(localFilePath, Buffer.from('pdf-content'));

    provider['attachmentMetadata'].set(attachmentId, {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      identifier: attachmentId,
      name: 'secret.pdf',
      description: '',
      author: { '@type': 'Person', name: creator },
      editor: { '@type': 'Person', name: creator },
      dateCreated: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      encodingFormat: 'application/pdf',
      contentSize: 11,
      url: `/attachments/${attachmentId}`,
      storageLocation: `/Volumes/jims/old-nas/attachments/private/${creator}/${filename}`,
      isFamilyFriendly: true,
      mentions: [],
      isPrivate: true,
      creator
    });

    const result = await provider.getAttachment(attachmentId);

    expect(result).not.toBeNull();
    expect(result.buffer.toString()).toBe('pdf-content');
    expect(result.metadata.filePath).toBe(localFilePath);
  });

  it('unmigrated leftover under attachments/private is still served', async () => {
    const attachmentId = 'left1234deadbeef'.padEnd(64, '0');
    const creator = 'alice';
    const filename = `${attachmentId}.pdf`;
    const leftover = path.join(storageDir, 'private', creator, filename);
    await fs.ensureDir(path.dirname(leftover));
    await fs.writeFile(leftover, Buffer.from('legacy-pdf'));

    provider['attachmentMetadata'].set(attachmentId, {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      identifier: attachmentId,
      name: 'old.pdf',
      description: '',
      author: { '@type': 'Person', name: creator },
      editor: { '@type': 'Person', name: creator },
      dateCreated: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      encodingFormat: 'application/pdf',
      contentSize: 10,
      url: `/attachments/${attachmentId}`,
      storageLocation: leftover,
      isFamilyFriendly: true,
      mentions: [],
      isPrivate: true,
      creator
    });

    const result = await provider.getAttachment(attachmentId);
    expect(result).not.toBeNull();
    expect(result.buffer.toString()).toBe('legacy-pdf');
    expect(result.metadata.filePath).toBe(leftover);
  });
});
