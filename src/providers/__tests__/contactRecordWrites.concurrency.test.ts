/**
 * Concurrent writes to one role, person or organization record (#2015).
 *
 * The three file providers named their temp file `<target>.tmp-<pid>-<ms>`.
 * Two writes to one record in the same millisecond shared that name: the
 * second write replaced the first one's temp file, the first rename moved it,
 * and the second rename failed with ENOENT (jimstest, 2026-10-23, a role
 * added during user creation). Each update also read the record, merged the
 * patch and wrote it back with nothing in between kept out, so two patches
 * could each drop the other.
 *
 * Date.now is frozen so every write lands in the same millisecond.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import FileRoleProvider from '../FileRoleProvider';
import FilePersonProvider from '../FilePersonProvider';
import FileOrganizationProvider from '../FileOrganizationProvider';
import type { WikiEngine } from '../../types/WikiEngine';

const WRITES = 25;
const ORG_ID = 'https://example.com/';

describe('concurrent record writes in one millisecond (#2015)', () => {
  let tmpDir: string;
  let engine: WikiEngine;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-writes-'));
    const configManager = {
      getProperty: (_k: string, d: unknown) => d,
      getResolvedDataPath: (key: string) => path.join(tmpDir, key.split('.').slice(-2, -1)[0])
    };
    engine = { getManager: (n: string) => (n === 'ConfigurationManager' ? configManager : null) };
    vi.spyOn(Date, 'now').mockReturnValue(1792753824698);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Only this test's temp directory — never a live data tree.
    await fs.remove(tmpDir);
  });

  /** Fire `WRITES` patches at once, each setting its own field; every one must succeed and land. */
  async function everyPatchLands(
    update: (field: string) => Promise<unknown>,
    read: () => Promise<Record<string, unknown> | null>
  ): Promise<void> {
    const fields = Array.from({ length: WRITES }, (_, i) => `note${i}`);
    const results = await Promise.allSettled(fields.map((f) => update(f)));
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    const record = await read();
    for (const f of fields) expect(record?.[f]).toBe(f);
  }

  test('role: every concurrent update lands, none fails on rename', async () => {
    const provider = new FileRoleProvider(engine);
    await provider.initialize();
    const id = `${ORG_ID}roles/reader#role`;
    await provider.create({
      '@context': 'https://schema.org',
      '@type': 'OrganizationRole',
      '@id': id,
      namedPosition: 'reader',
      organization: { '@id': ORG_ID },
      member: []
    });
    await everyPatchLands(
      (f) => provider.update(id, { [f]: f }),
      async () => await provider.getById(id)
    );
  });

  test('person: every concurrent update lands, none fails on rename', async () => {
    const provider = new FilePersonProvider(engine);
    await provider.initialize();
    const id = 'urn:uuid:11111111-1111-1111-1111-111111111111';
    await provider.create({ '@context': 'https://schema.org', '@type': 'Person', '@id': id, identifier: 'alice', name: 'Alice' });
    await everyPatchLands(
      (f) => provider.update(id, { [f]: f }),
      async () => await provider.getById(id)
    );
  });

  test('organization: every concurrent update lands, none fails on rename', async () => {
    const provider = new FileOrganizationProvider(engine);
    await provider.initialize();
    await provider.create({ '@context': 'https://schema.org', '@type': 'Organization', '@id': ORG_ID, name: 'Example', url: ORG_ID }, 'example.json');
    await everyPatchLands(
      (f) => provider.update(ORG_ID, { [f]: f }),
      async () => await provider.getById(ORG_ID)
    );
  });

  test('no temp file is left beside the records', async () => {
    const provider = new FileRoleProvider(engine);
    await provider.initialize();
    const id = `${ORG_ID}roles/editor#role`;
    await provider.create({
      '@context': 'https://schema.org',
      '@type': 'OrganizationRole',
      '@id': id,
      namedPosition: 'editor',
      organization: { '@id': ORG_ID },
      member: []
    });
    await Promise.all(Array.from({ length: WRITES }, (_, i) => provider.update(id, { member: [{ '@id': `p${i}` }] })));
    expect(await fs.readdir(path.join(tmpDir, 'roles'))).toEqual(['editor.json']);
  });
});
