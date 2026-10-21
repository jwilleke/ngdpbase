/**
 * Tests for builder routes and FormsDataManager CRUD methods
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import FormsDataManager from '../managers/FormsDataManager';
import type { FormDefinition } from '../managers/FormsDataManager';

/** The admin saving in the form builder: the request subject the route forwards (P1). */
const ADMIN = { username: 'admin', roles: ['admin'], isAuthenticated: true };

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forms-builder-test-'));
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const validForm: FormDefinition = {
  id: 'test-form',
  title: 'Test Form',
  proxySubmission: false,
  notifyRole: 'admin',
  fields: [
    { name: 'name', type: 'text', label: 'Full Name', required: true }
  ]
};

// ── FormsDataManager.saveDefinition ──────────────────────────────────────────

describe('FormsDataManager.saveDefinition', () => {
  let dir: string;
  let mgr: FormsDataManager;

  beforeEach(async () => {
    dir = makeTmpDir();
    mgr = new FormsDataManager(null, dir);
    await mgr.initialize();
  });

  afterEach(() => cleanDir(dir));

  test('writes file to definitions directory and updates in-memory map', async () => {
    await mgr.saveDefinition(validForm, ADMIN);

    const filePath = path.join(dir, 'definitions', 'test-form.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as FormDefinition;
    expect(parsed.id).toBe('test-form');
    expect(parsed.title).toBe('Test Form');

    expect(mgr.getDefinition('test-form')).toBeDefined();
    expect(mgr.getDefinition('test-form')?.title).toBe('Test Form');
  });

  test('overwrites existing file on second save', async () => {
    await mgr.saveDefinition(validForm, ADMIN);
    await mgr.saveDefinition({ ...validForm, title: 'Updated Title' }, ADMIN);

    expect(mgr.getDefinition('test-form')?.title).toBe('Updated Title');

    const raw = fs.readFileSync(path.join(dir, 'definitions', 'test-form.json'), 'utf8');
    expect(JSON.parse(raw).title).toBe('Updated Title');
  });

  test('saves multiple forms independently', async () => {
    const form2: FormDefinition = { ...validForm, id: 'second-form', title: 'Second' };
    await mgr.saveDefinition(validForm, ADMIN);
    await mgr.saveDefinition(form2, ADMIN);

    expect(mgr.getAllDefinitions()).toHaveLength(2);
    expect(mgr.getDefinition('test-form')).toBeDefined();
    expect(mgr.getDefinition('second-form')).toBeDefined();
  });
});

// ── FormsDataManager.deleteDefinition ────────────────────────────────────────

describe('FormsDataManager.deleteDefinition', () => {
  let dir: string;
  let mgr: FormsDataManager;

  beforeEach(async () => {
    dir = makeTmpDir();
    mgr = new FormsDataManager(null, dir);
    await mgr.initialize();
    await mgr.saveDefinition(validForm, ADMIN);
  });

  afterEach(() => cleanDir(dir));

  test('removes file and in-memory entry', async () => {
    const ok = await mgr.deleteDefinition('test-form', ADMIN);
    expect(ok).toBe(true);
    expect(mgr.getDefinition('test-form')).toBeUndefined();
    expect(fs.existsSync(path.join(dir, 'definitions', 'test-form.json'))).toBe(false);
  });

  test('returns false for non-existent form', async () => {
    const ok = await mgr.deleteDefinition('no-such-form', ADMIN);
    expect(ok).toBe(false);
  });

  test('does not affect other forms', async () => {
    const form2: FormDefinition = { ...validForm, id: 'keep-me', title: 'Keep' };
    await mgr.saveDefinition(form2, ADMIN);

    await mgr.deleteDefinition('test-form', ADMIN);

    expect(mgr.getDefinition('keep-me')).toBeDefined();
    expect(mgr.getDefinition('test-form')).toBeUndefined();
  });
});

// ── FormsDataManager.reloadDefinition ────────────────────────────────────────

describe('FormsDataManager.reloadDefinition', () => {
  let dir: string;
  let mgr: FormsDataManager;

  beforeEach(async () => {
    dir = makeTmpDir();
    mgr = new FormsDataManager(null, dir);
    await mgr.initialize();
    await mgr.saveDefinition(validForm, ADMIN);
  });

  afterEach(() => cleanDir(dir));

  test('returns current in-memory definition when file unchanged', async () => {
    const result = await mgr.reloadDefinition('test-form');
    expect(result?.id).toBe('test-form');
  });

  test('picks up on-disk changes made outside the manager', async () => {
    const filePath = path.join(dir, 'definitions', 'test-form.json');
    const updated = { ...validForm, title: 'Changed On Disk' };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');

    const result = await mgr.reloadDefinition('test-form');
    expect(result?.title).toBe('Changed On Disk');
    expect(mgr.getDefinition('test-form')?.title).toBe('Changed On Disk');
  });

  test('returns undefined and logs warning for invalid JSON on disk', async () => {
    const filePath = path.join(dir, 'definitions', 'test-form.json');
    fs.writeFileSync(filePath, '{ invalid json }', 'utf8');

    const result = await mgr.reloadDefinition('test-form');
    expect(result).toBeUndefined();
  });

  test('returns undefined for non-existent form ID', async () => {
    const result = await mgr.reloadDefinition('no-such-form');
    expect(result).toBeUndefined();
  });
});

// ── Builder route guard: delete blocked when submissions exist ────────────────

describe('FormsDataManager.getSubmissionCount gates delete', () => {
  let dir: string;
  let mgr: FormsDataManager;

  beforeEach(async () => {
    dir = makeTmpDir();
    mgr = new FormsDataManager(null, dir);
    await mgr.initialize();
    await mgr.saveDefinition(validForm, ADMIN);
  });

  afterEach(() => cleanDir(dir));

  test('count is 0 when no submissions exist', async () => {
    expect(await mgr.getSubmissionCount('test-form')).toBe(0);
  });

  test('count reflects saved submissions', async () => {
    await mgr.saveSubmission({
      formId: 'test-form',
      submittedAt: new Date().toISOString(),
      submittedBy: 'user1',
      data: { name: 'Alice' },
      status: 'pending'
    });
    expect(await mgr.getSubmissionCount('test-form')).toBe(1);
  });
});
