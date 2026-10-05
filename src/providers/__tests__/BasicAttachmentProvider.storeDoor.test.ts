/**
 * #1629: AssetProvider.store() goes through the asset-upload door, and image
 * details are extracted for every upload through that door.
 */
vi.unmock('../BasicAttachmentProvider');

import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import sharp from 'sharp';

import BasicAttachmentProvider from '../BasicAttachmentProvider';

function makeEngine(storageDir: string, pagesDir: string, attachmentManager: unknown) {
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
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
      return defaultValue;
    })
  };
  return {
    getManager: vi.fn().mockImplementation((name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'AttachmentManager') return attachmentManager;
      return null;
    })
  };
}

describe('#1629 store() and the upload door', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'attach-door-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  it('store() calls AttachmentManager.uploadAttachment with the acting context', async () => {

    const attachmentManager = {
      uploadAttachment: vi.fn(async (buffer: Buffer, fileInfo: { originalName: string; mimeType: string; size: number }) =>
        provider.storeAttachment(buffer, fileInfo, {}, { username: 'alice' }))
    };
    const provider = new BasicAttachmentProvider(makeEngine(storageDir, pagesDir, attachmentManager));
    await provider.initialize();

    const ctx = { username: 'alice', roles: ['contributor'], isAuthenticated: true };
    const bytes = Buffer.from('hello');
    const record = await provider.store(bytes, { originalName: 'a.txt', mimeType: 'text/plain', size: bytes.length, pageName: 'Notes' }, ctx);

    expect(attachmentManager.uploadAttachment).toHaveBeenCalledTimes(1);
    const [, fileInfo, passedCtx, options] = attachmentManager.uploadAttachment.mock.calls[0] as unknown as [Buffer, unknown, unknown, unknown];
    expect(fileInfo).toEqual({ originalName: 'a.txt', mimeType: 'text/plain', size: 5 });
    expect(passedCtx).toBe(ctx);
    expect(options).toEqual({ pageName: 'Notes', description: undefined });
    expect(record.filename).toBe('a.txt');
  });

  it('store() refuses when the door is unavailable', async () => {
    const provider = new BasicAttachmentProvider(makeEngine(storageDir, pagesDir, null));
    await provider.initialize();
    await expect(provider.store(Buffer.from('x'), { originalName: 'x.txt', mimeType: 'text/plain', size: 1 }, { username: 'a' }))
      .rejects.toThrow(/AttachmentManager is not available/);
  });

  it('storeAttachment records image dimensions for an image upload', async () => {
    const provider = new BasicAttachmentProvider(makeEngine(storageDir, pagesDir, null));
    await provider.initialize();
    const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const meta = await provider.storeAttachment(png, { originalName: 'r.png', mimeType: 'image/png', size: png.length }, {}, { username: 'alice' });
    const record = await provider.getById(String(meta.id));
    expect(record?.dimensions).toMatchObject({ width: 3, height: 2 });
    expect(record?.metadata).toMatchObject({ colorSpace: 'srgb' });
  });
});
