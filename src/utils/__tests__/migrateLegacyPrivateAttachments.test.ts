/**
 * Move attachments/private/{user}/ files into private/{user}/default/attachments/ (#1386).
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { migrateLegacyPrivateAttachments } from '../migrateLegacyPrivateAttachments';
import { DEFAULT_PRIVATE_STORE, storeMetaPath } from '../privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys } from '../privateStoreCrypto';

const shipped = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')
) as Record<string, unknown>;

describe('migrateLegacyPrivateAttachments (#1386)', () => {
  let tmp: string;
  let pagesDir: string;
  let attachmentsPrivateDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-att-mig-'));
    pagesDir = path.join(tmp, 'pages');
    attachmentsPrivateDir = path.join(tmp, 'attachments', 'private');
    await fs.ensureDir(pagesDir);
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('moves attachments/private/{user}/hash.ext into default/ and leaves sealed stores alone', async () => {
    const hash = 'aa'.repeat(32);
    const legacy = path.join(attachmentsPrivateDir, 'jim', `${hash}.pdf`);
    await fs.ensureDir(path.dirname(legacy));
    await fs.writeFile(legacy, 'pdf-bytes');

    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'sealed-user', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'sealed-user', DEFAULT_PRIVATE_STORE), record);
    const sealedLegacy = path.join(attachmentsPrivateDir, 'sealed-user', `${hash}.png`);
    await fs.ensureDir(path.dirname(sealedLegacy));
    await fs.writeFile(sealedLegacy, 'png-bytes');

    const result = await migrateLegacyPrivateAttachments({
      attachmentsPrivateDir,
      pagesDirectory: pagesDir
    });

    expect(result.moved).toBe(1);
    expect(await fs.pathExists(legacy)).toBe(false);
    expect(await fs.pathExists(
      path.join(pagesDir, 'private', 'jim', DEFAULT_PRIVATE_STORE, 'attachments', `${hash}.pdf`)
    )).toBe(true);
    expect(await fs.pathExists(sealedLegacy)).toBe(true);
  });

  test('is a no-op when the file is already in default/', async () => {
    const hash = 'bb'.repeat(32);
    const dest = path.join(pagesDir, 'private', 'jim', DEFAULT_PRIVATE_STORE, 'attachments', `${hash}.pdf`);
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, 'x');
    const legacy = path.join(attachmentsPrivateDir, 'jim', `${hash}.pdf`);
    await fs.ensureDir(path.dirname(legacy));
    await fs.writeFile(legacy, 'old');

    expect(await migrateLegacyPrivateAttachments({
      attachmentsPrivateDir,
      pagesDirectory: pagesDir
    })).toEqual({ moved: 0 });
    expect(await fs.readFile(dest, 'utf8')).toBe('x');
    expect(await fs.pathExists(legacy)).toBe(true);
  });

  test('is a no-op when attachments/private is missing', async () => {
    expect(await migrateLegacyPrivateAttachments({
      attachmentsPrivateDir,
      pagesDirectory: pagesDir
    })).toEqual({ moved: 0 });
  });

  test('legacyprivateroot is a migrate-FROM segment under attachment storagedir, not a second root', () => {
    expect(shipped['ngdpbase.attachment.provider.basic.legacyprivateroot']).toBe('private');
    expect(String(shipped['ngdpbase.attachment.provider.basic.legacyprivateroot'])).not.toMatch(
      /SLOW_STORAGE|FAST_STORAGE|[\\/]/
    );
  });
});
