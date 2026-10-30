/**
 * #1926: an upload records the uploader's USERNAME, from the context it was
 * given, and an upload with no signed-in username is refused before anything
 * is written — public and vault alike. Never `Unknown`, never an email
 * (operator, 2026-10-20, on #1852: "No one can upload anonymously — username
 * must be present").
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import { withFilesDoor } from '../../test-support/filesDoor';
import { ANONYMOUS_SUBJECT } from '../UserManager';
import { jobContextFromRequest } from '../../context/JobContext';
import type { ActorContext } from '../../context/ActorContext';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';
import { vaultCategories } from '../../test-support/vaults';
import { fakeIdentityManager } from '../../test-support/identities';

const FILE = { originalName: 'notes.txt', mimeType: 'text/plain', size: 1 };

function makeManager(pagesDir: string, identities: unknown = null) {
  const stored: unknown[][] = [];
  const storeStored: unknown[][] = [];
  const engine = {
    getManager: (name: string) => {
      if (name === 'PolicyDecisionPoint') {
        // Policy allows everything here: the refusal under test is not policy's.
        return { permits: () => Promise.resolve(true), decide: () => Promise.resolve({ permit: true }) };
      }
      if (name === 'AuditManager') {
        return { logAuditEvent: vi.fn().mockResolvedValue('id'), flushAuditQueue: () => Promise.resolve() };
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (key: string, fallback: unknown) =>
            key === 'ngdpbase.system-category' ? vaultCategories('vault') : fallback,
          getResolvedDataPath: (k: string, d: string) =>
            k === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : d
        };
      }
      if (name === 'PageManager') return { getPrivatePageOwner: vi.fn().mockResolvedValue(null) };
      if (name === 'IdentityManager') return identities;
      return null;
    }
  } as never;
  const m = withFilesDoor(new AttachmentManager(engine));
  (m as unknown as { attachmentProvider: unknown }).attachmentProvider = {
    storeAttachment: (...args: unknown[]) => {
      stored.push(args);
      return Promise.resolve({ identifier: 'att-1', name: FILE.originalName });
    },
    updateAttachmentMetadata: (...args: unknown[]) => {
      stored.push(args);
      return Promise.resolve(true);
    },
    storeFileInStore: (...args: unknown[]) => {
      storeStored.push(args);
      return Promise.resolve({
        id: 'in-store-1', fileName: 'in-store-1.txt', name: FILE.originalName, encodingFormat: FILE.mimeType,
        contentSize: 1, fingerprint: 'f', description: '', dateCreated: '', dateModified: '', mentions: []
      });
    }
  };
  return { m, stored, storeStored };
}

describe('AttachmentManager.uploadAttachment records the uploader by username (#1926)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-uploader-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  // A request subject built from a session can carry the account's email.
  const signedIn = { username: 'jim', email: 'jim@example.test', isAuthenticated: true, roles: ['editor'] } as unknown as ActorContext;

  test('a public upload hands the provider the username, and no email', async () => {
    const { m, stored } = makeManager(pagesDir);
    await m.uploadAttachment(Buffer.from('x'), FILE, signedIn, { pageName: 'Main' });
    expect(stored).toHaveLength(1);
    const user = stored[0][3] as Record<string, unknown>;
    expect(user).toEqual({ username: 'jim' });
    expect(JSON.stringify(user)).not.toContain('jim@example.test');
  });

  test('a vault upload records the username as its author', async () => {
    const { m, stored, storeStored } = makeManager(pagesDir);
    await m.uploadAttachment(Buffer.from('x'), FILE, signedIn, { private: true });
    expect(stored).toHaveLength(0);
    expect(storeStored).toHaveLength(1);
    expect((storeStored[0][2] as { author?: string }).author).toBe('jim');
  });

  test('an anonymous public upload is refused and nothing is written', async () => {
    const { m, stored, storeStored } = makeManager(pagesDir);
    await expect(m.uploadAttachment(Buffer.from('x'), FILE, ANONYMOUS_SUBJECT, { pageName: 'Main' }))
      .rejects.toThrow(/Permission denied: .*signed in/);
    expect(stored).toHaveLength(0);
    expect(storeStored).toHaveLength(0);
  });

  test('a share visitor (the anonymous subject bearing a share) is refused', async () => {
    const { m, stored } = makeManager(pagesDir);
    const visitor = { ...ANONYMOUS_SUBJECT, viaShare: { id: 's', issuer: 'jim', actions: ['upload'], resources: [], expiresAt: null } } as unknown as ActorContext;
    await expect(m.uploadAttachment(Buffer.from('x'), FILE, visitor, {})).rejects.toThrow(/signed in/);
    expect(stored).toHaveLength(0);
  });

  test('a job with no person behind it is refused', async () => {
    const { m, stored } = makeManager(pagesDir);
    await expect(m.uploadAttachment(Buffer.from('x'), FILE, jobContextFromRequest(null), {})).rejects.toThrow(/signed in/);
    expect(stored).toHaveLength(0);
  });

  test('a context with an empty username is refused', async () => {
    const { m, stored } = makeManager(pagesDir);
    const nameless = { username: '', isAuthenticated: true, roles: [] } as unknown as ActorContext;
    await expect(m.uploadAttachment(Buffer.from('x'), FILE, nameless, {})).rejects.toThrow(/signed in/);
    expect(stored).toHaveLength(0);
  });

  test('an anonymous vault upload is refused and nothing is written to the vault', async () => {
    const { m, storeStored } = makeManager(pagesDir);
    // The vault's container rule already refuses nobody; either refusal is before any write.
    await expect(m.uploadAttachment(Buffer.from('x'), FILE, ANONYMOUS_SUBJECT, { private: true }))
      .rejects.toThrow(/Permission denied/);
    expect(storeStored).toHaveLength(0);
    // No vault folder was created for "Anonymous".
    expect(await fs.readdir(pagesDir)).toEqual([]);
  });

  // #2097: with an identity record, the uploader and editor are stored by identity @id.
  // Sabotage: each userReference call replaced by the bare username went red.
  const JIM = 'urn:uuid:11111111-1111-4111-8111-111111111111';

  test('#2097 a public upload records the uploader identity @id', async () => {
    const { m, stored } = makeManager(pagesDir, fakeIdentityManager({ jim: JIM }));
    await m.uploadAttachment(Buffer.from('x'), FILE, signedIn, { pageName: 'Main' });
    expect(stored[0][3]).toEqual({ username: JIM });
  });

  test('#2097 a vault upload records the uploader identity @id', async () => {
    const { m, storeStored } = makeManager(pagesDir, fakeIdentityManager({ jim: JIM }));
    await m.uploadAttachment(Buffer.from('x'), FILE, signedIn, { private: true });
    expect((storeStored[0][2] as { author?: string }).author).toBe(JIM);
  });

  test('#2097 a metadata edit records the editor identity @id', async () => {
    const { m, stored } = makeManager(pagesDir, fakeIdentityManager({ jim: JIM }));
    await m.updateAttachmentMetadata('att-1', { description: 'd' }, signedIn);
    expect((stored[0][1] as { editor?: { name?: string } }).editor?.name).toBe(JIM);
  });

  test('#2097 the identity store down: the username is recorded and the upload works', async () => {
    const { m, stored } = makeManager(pagesDir, fakeIdentityManager({ jim: JIM }, { failLookups: true }));
    await m.uploadAttachment(Buffer.from('x'), FILE, signedIn, { pageName: 'Main' });
    expect(stored[0][3]).toEqual({ username: 'jim' });
  });
});
