/**
 * Tests for ContactSubmissionLog (#670 Phase C, v3.12.0).
 *
 * Verifies the append-only JSONL writer:
 *  - creates the parent directory if missing
 *  - appends one JSON line per call (no rewrites, no truncation)
 *  - does not throw when the underlying fs op fails (best-effort)
 *  - emits valid JSON for every entry shape (recipient null vs string, etc.)
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ContactSubmissionLog, type SubmissionEntry } from '../ContactSubmissionLog';

const baseEntry: SubmissionEntry = {
  ts: '2026-05-10T12:34:56.789Z',
  ip: '198.51.100.7',
  userAgent: 'Mozilla/5.0 (test)',
  referer: '/view/contact-us',
  name: 'Alice',
  email: 'alice@example.com',
  subject: 'Hello',
  message: 'Hi there.',
  recipient: 'ops@example.com',
  mailResult: 'sent'
};

describe('ContactSubmissionLog', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contact-log-'));
    logPath = path.join(tmpDir, 'subdir', 'contact-submissions.log');
  });

  afterEach(async () => {
    // Remove only the per-test tmp tree; never touch a real ./data/ tree.
    if (tmpDir.startsWith(os.tmpdir())) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('creates parent directory and writes one JSON line', async () => {
    const log = new ContactSubmissionLog(logPath);
    await log.append(baseEntry);

    const content = await fs.readFile(logPath, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(content.trim());
    expect(parsed).toEqual(baseEntry);
  });

  test('appends multiple entries on separate lines, preserving order', async () => {
    const log = new ContactSubmissionLog(logPath);
    await log.append({ ...baseEntry, name: 'first' });
    await log.append({ ...baseEntry, name: 'second' });
    await log.append({ ...baseEntry, name: 'third' });

    const content = await fs.readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[0]).name).toBe('first');
    expect(JSON.parse(lines[1]).name).toBe('second');
    expect(JSON.parse(lines[2]).name).toBe('third');
  });

  test('does not truncate or overwrite an existing file', async () => {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, '{"existing":"line"}\n', 'utf8');

    const log = new ContactSubmissionLog(logPath);
    await log.append({ ...baseEntry, name: 'after' });

    const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ existing: 'line' });
    expect(JSON.parse(lines[1]).name).toBe('after');
  });

  test('serializes all four mailResult shapes correctly', async () => {
    const log = new ContactSubmissionLog(logPath);
    const results: SubmissionEntry['mailResult'][] = [
      'sent',
      'mail-failed',
      'mail-disabled',
      'no-recipient'
    ];
    for (const r of results) {
      await log.append({ ...baseEntry, mailResult: r, recipient: r === 'sent' || r === 'mail-failed' ? baseEntry.recipient : null });
    }
    const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n');
    expect(lines.map(l => JSON.parse(l).mailResult)).toEqual(results);
    expect(JSON.parse(lines[2]).recipient).toBeNull(); // mail-disabled
    expect(JSON.parse(lines[3]).recipient).toBeNull(); // no-recipient
  });

  test('does not throw when the file path is unwritable', async () => {
    // Aim at a path inside a non-existent parent that we then make read-only;
    // simpler: aim at a clearly-invalid path on this platform.
    const badPath = '/dev/null/cannot-create-here/contact-submissions.log';
    const log = new ContactSubmissionLog(badPath);
    // Should not throw — any error is logged via the logger and swallowed.
    await expect(log.append(baseEntry)).resolves.toBeUndefined();
  });

  test('handles entry with null ip / userAgent / referer', async () => {
    const log = new ContactSubmissionLog(logPath);
    await log.append({
      ...baseEntry,
      ip: null,
      userAgent: null,
      referer: null
    });
    const content = await fs.readFile(logPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.ip).toBeNull();
    expect(parsed.userAgent).toBeNull();
    expect(parsed.referer).toBeNull();
  });
});
