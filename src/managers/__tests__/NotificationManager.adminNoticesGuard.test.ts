/**
 * #2040 guard: a `system` notification created with no targetUsers reaches every
 * user. Notices for administrators go through NotificationManager.notifyAdmins,
 * the one place that resolves who holds admin-system. This scan fails when any
 * source file builds a `type: 'system'` notification object without
 * `targetUsers` inside that object, unless it is on the allowlist.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

/** file -> why a `type: 'system'` object with no targetUsers is allowed there. Keep this to a minimum. */
const ALLOWED: Record<string, string> = {};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__' || name === 'temp') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.(test|spec|d)\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** The text of the `{ ... }` object literal around `index`, by brace matching. */
function enclosingObject(src: string, index: number): string {
  let depth = 0;
  let start = index;
  for (; start >= 0; start--) {
    if (src[start] === '}') depth++;
    else if (src[start] === '{') { if (depth === 0) break; depth--; }
  }
  depth = 0;
  let end = start;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, end + 1);
}

function untargetedSystemNotices(src: string): number[] {
  const lines: number[] = [];
  const re = /type:\s*'system'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const obj = enclosingObject(src, m.index);
    // A type annotation (`{ type: 'system'; level: ... }`) is not an object being created.
    if (/type:\s*'system'\s*;/.test(obj)) continue;
    if (!obj.includes('targetUsers')) lines.push(src.slice(0, m.index).split('\n').length);
  }
  return lines;
}

describe('admin notices are targeted (#2040)', () => {
  test('the scan sees an untargeted system notice, and a targeted one passes', () => {
    expect(untargetedSystemNotices("nm.add({ type: 'system', level: 'error', title: 't', message: 'm' });")).toEqual([1]);
    expect(untargetedSystemNotices("nm.add({ type: 'system', level: 'error', targetUsers: admins });")).toEqual([]);
  });

  test('no source file creates a type: system notification without targetUsers', () => {
    const files = [...walk(path.join(ROOT, 'src'), []), ...walk(path.join(ROOT, 'addons'), [])];
    expect(files.length).toBeGreaterThan(300);
    const found: string[] = [];
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel in ALLOWED) continue;
      for (const line of untargetedSystemNotices(readFileSync(file, 'utf8'))) found.push(`${rel}:${line}`);
    }
    expect(found, 'tell admins with NotificationManager.notifyAdmins, which sets targetUsers').toEqual([]);
  });
});
