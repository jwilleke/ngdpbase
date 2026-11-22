import fs from 'fs-extra';
import os from 'os';
import path from 'path';

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import ConfigurationManager from '../ConfigurationManager';
import logger from '../../utils/logger';

const POLICIES = 'ngdpbase.access.policies';

/** #2466: the no-op `priority` on a policy rule is removed at start, with a copy of the file first. */
describe('ConfigurationManager: removes the old priority from policy rules (#2466)', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  const customFile = (): string => path.join(tempDir, 'data', 'config', 'app-custom-config.json');
  const backupDir = (): string => path.join(tempDir, 'data', 'upgrade-backups');
  const backups = (): string[] => (fs.existsSync(backupDir()) ? fs.readdirSync(backupDir()) : []);
  const allLogs = (): string => ['info', 'warn'].flatMap((l) => (logger[l as 'info'] as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))).join('\n');

  const rules = (): Array<Record<string, unknown>> => [
    { id: 'staff-read', effect: 'allow', priority: 100, subjects: [{ type: 'role', value: 'editor' }], actions: ['page-read'] },
    { id: 'block-bob', effect: 'deny', priority: 0, subjects: [{ type: 'user', value: 'bob' }], actions: ['page-read'] },
    { id: 'plain', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], actions: ['page-read'] }
  ];

  async function boot(custom: Record<string, unknown>): Promise<ConfigurationManager> {
    await fs.ensureDir(path.join(tempDir, 'data', 'config'));
    await fs.writeJson(customFile(), custom, { spaces: 2 });
    const cm = new ConfigurationManager({ getManager: vi.fn() });
    await cm.initialize();
    return cm;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'priority-rules-2466-'));
    await fs.ensureDir(path.join(tempDir, 'config'));
    await fs.writeJson(path.join(tempDir, 'config', 'app-default-config.json'), { 'ngdpbase.application-name': 'TestWiki' });
    originalCwd = process.cwd();
    process.chdir(tempDir);
    delete process.env.INSTANCE_DATA_FOLDER;
    delete process.env.FAST_STORAGE;
    delete process.env.SLOW_STORAGE;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('R1: takes priority off each rule that has one, in the file and in what the site reads, and logs each rule', async () => {
    const cm = await boot({ 'ngdpbase.application-name': 'Mine', [POLICIES]: rules() });
    const expected = rules().map(({ priority: _p, ...rest }) => rest);
    expect((await fs.readJson(customFile()))[POLICIES]).toEqual(expected);
    expect(cm.getProperty(POLICIES, [])).toEqual(expected);
    expect((await fs.readJson(customFile()))['ngdpbase.application-name']).toBe('Mine');
    expect(allLogs()).toContain('staff-read');
    expect(allLogs()).toContain('block-bob');
    expect(allLogs()).not.toContain("'plain'");
  });

  test('R6: a copy of the file as it was is written first', async () => {
    const before = `${JSON.stringify({ [POLICIES]: rules() }, null, 2)}\n`;
    await boot({ [POLICIES]: rules() });
    expect(backups()).toHaveLength(1);
    expect(fs.readFileSync(path.join(backupDir(), backups()[0]), 'utf8')).toBe(before);
  });

  test('R6: only priority goes; no rule gains a subject, an action or an allow', async () => {
    await boot({ [POLICIES]: rules() });
    const after = (await fs.readJson(customFile()))[POLICIES] as Array<Record<string, unknown>>;
    expect(after.map((r) => r.id)).toEqual(['staff-read', 'block-bob', 'plain']);
    for (const [i, rule] of after.entries()) {
      const was = rules()[i];
      expect(Object.keys(rule).sort()).toEqual(Object.keys(was).filter((k) => k !== 'priority').sort());
      for (const k of Object.keys(rule)) expect(rule[k]).toEqual(was[k]);
    }
  });

  test('R6: with no copy possible the file is left as it is, and the next start tries again', async () => {
    await fs.ensureDir(path.join(tempDir, 'data'));
    await fs.writeFile(backupDir(), 'not a folder');
    const before = `${JSON.stringify({ [POLICIES]: rules() }, null, 2)}\n`;
    await boot({ [POLICIES]: rules() });
    expect(fs.readFileSync(customFile(), 'utf8')).toBe(before);
    expect(allLogs()).toMatch(/priority/);
  });

  test('R5: a second start changes nothing and makes no copy', async () => {
    await boot({ [POLICIES]: rules() });
    const after = fs.readFileSync(customFile(), 'utf8');
    const copies = backups();
    vi.clearAllMocks();
    const cm = new ConfigurationManager({ getManager: vi.fn() });
    await cm.initialize();
    expect(fs.readFileSync(customFile(), 'utf8')).toBe(after);
    expect(backups()).toEqual(copies);
    expect(allLogs()).not.toContain('staff-read');
    expect(cm.getAttentionItems()).toEqual([]);
  });

  test('R4: the banner says what changed in plain words, with the count and the rule names', async () => {
    const cm = await boot({ [POLICIES]: rules() });
    const [item] = cm.getAttentionItems();
    expect(item.state).toBe('degraded');
    expect(item.kind).toBe('attention');
    expect(item.reason).toMatch(/^The update cleaned up 2 access rules/);
    expect(item.details).toEqual(['staff-read: removed an old priority that had no effect', 'block-bob: removed an old priority that had no effect']);
    const text = [item.reason, ...(item.details ?? [])].join(' ');
    expect(text).not.toMatch(/#\d|docs\/|\.json|\/|see the log|github/i);
  });

  test('a site with no leftover priority sees no banner, no copy and no rewrite', async () => {
    const plain = rules().map(({ priority: _p, ...rest }) => rest);
    const cm = await boot({ [POLICIES]: plain });
    expect(cm.getAttentionItems()).toEqual([]);
    expect(backups()).toEqual([]);
    expect((await fs.readJson(customFile()))[POLICIES]).toEqual(plain);
  });
});
