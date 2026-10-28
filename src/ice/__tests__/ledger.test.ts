/**
 * The ledger's scope binding (#2013): a scope names its receiver and its
 * user, and a ledger file written before the binding belongs to nobody.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { FileIceLedger, LEDGER_FORM } from '../ledger';
import { boundScope } from '../runImport';
import type { LedgerFileEntry } from '../types';

const ENTRY: LedgerFileEntry = { name: 'a.rec', sha256: 'f'.repeat(64), size: 3, status: 'imported', at: '2026-10-27T00:00:00.000Z', refs: ['rec-1'] };

describe('boundScope', () => {
  test('differs by receiver and by user', () => {
    const scopes = new Set([
      boundScope('core.pages', 'urn:uuid:a'), boundScope('core.pages', 'urn:uuid:b'),
      boundScope('core.files', 'urn:uuid:a'), boundScope('core.pages', 'urn:uuid:a', 'source-1')
    ]);
    expect(scopes.size).toBe(4);
  });

  test('a caller\'s sub-scope cannot reach another user\'s scope', () => {
    expect(boundScope('core.pages', 'alice', 'x')).not.toBe(boundScope('core.pages', 'alice/x'));
    expect(boundScope('core.pages', 'bob', '../alice')).not.toContain('/alice');
  });

  test('never equals a scope written before the binding', () => {
    expect(boundScope('core.pages', 'alice')).not.toBe('core.pages/alice');
  });
});

describe('FileIceLedger', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ice-ledger-')); });
  // Only this test's own temporary folder.
  afterEach(async () => { await fs.remove(dir); });

  const fileFor = (scope: string): string => path.join(dir, `${createHash('sha256').update(scope).digest('hex').slice(0, 32)}.json`);

  test('a file written before the binding is read as empty, so its files are imported once more', async () => {
    const scope = boundScope('core.pages', 'alice');
    await fs.writeJson(fileFor(scope), { scope, files: [ENTRY], items: ['Observation/1'] });
    const ledger = new FileIceLedger(dir, 100);
    expect(await ledger.lastFile(scope, ENTRY.sha256)).toBeNull();
    expect(await ledger.hasItem(scope, 'Observation/1')).toBe(false);
  });

  test('what it writes is bound, and read back', async () => {
    const scope = boundScope('core.pages', 'alice');
    const ledger = new FileIceLedger(dir, 100);
    await ledger.recordFile(scope, ENTRY);
    expect((await fs.readJson(fileFor(scope))).form).toBe(LEDGER_FORM);
    expect(await ledger.lastFile(scope, ENTRY.sha256)).toEqual(ENTRY);
  });

  test('a file holding another scope is not read as this one', async () => {
    const scope = boundScope('core.pages', 'alice');
    await fs.writeJson(fileFor(scope), { form: LEDGER_FORM, scope: boundScope('core.pages', 'bob'), files: [ENTRY], items: [] });
    expect(await new FileIceLedger(dir, 100).lastFile(scope, ENTRY.sha256)).toBeNull();
  });
});
