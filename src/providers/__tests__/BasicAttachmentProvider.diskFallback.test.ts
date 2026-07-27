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

function makeEngine(storageDir) {
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
  let storageDir;
  let provider;

  beforeEach(async () => {
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attach-test-'));
    provider = new BasicAttachmentProvider(makeEngine(storageDir));
    await provider.initialize();
  });

  afterEach(async () => {
    await fs.remove(storageDir);
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
  let storageDir;
  let provider;

  beforeEach(async () => {
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attach-stale-test-'));
    provider = new BasicAttachmentProvider(makeEngine(storageDir));
    await provider.initialize();
  });

  afterEach(async () => {
    await fs.remove(storageDir);
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

  it('private attachment with stale storageLocation → file served from private subdirectory', async () => {
    const attachmentId = 'priv1234deadbeef'.padEnd(64, '0');
    const creator = 'alice';
    const filename = `${attachmentId}.pdf`;
    const privateDir = path.join(storageDir, 'private', creator);
    await fs.ensureDir(privateDir);
    const localFilePath = path.join(privateDir, filename);
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
});
