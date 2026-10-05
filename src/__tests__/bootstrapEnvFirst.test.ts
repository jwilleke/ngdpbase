/**
 * #1608: bootstrap-env loads the instance .env into process.env. ES imports
 * are hoisted and evaluate in order, so in an entry point it must be the
 * FIRST import, or modules imported ahead of it read process.env before the
 * session secret, credentials key and system user exist.
 *
 * Entry points: src/app.ts and mcp-server.ts always; any script that imports
 * bootstrap-env statically. A script that loads it with a dynamic
 * `await import(...)` inside its main function is a different, valid pattern.
 *
 * #1609: a script that touches instance data — reads FAST_STORAGE or boots
 * WikiEngine / ConfigurationManager — must load bootstrap-env at all, or it
 * resolves the wrong instance and runs without the instance .env.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const ALWAYS = ['src/app.ts', 'mcp-server.ts'];
const TOUCHES_INSTANCE = /process\.env\.FAST_STORAGE|src\/WikiEngine(\.js)?['"]|ConfigurationManager/;
const ANY_BOOTSTRAP = /bootstrap-env/;
const STATIC_BOOTSTRAP = /^import\s+(?:[^'"]*\s+from\s+)?['"][^'"]*bootstrap-env(?:\.js)?['"];?\s*$/;

function scripts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') out.push(...scripts(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

function firstImport(file: string): string | undefined {
  return fs.readFileSync(file, 'utf8').split('\n').find((line) => /^import\s/.test(line));
}

describe('#1608 bootstrap-env is the first import of every entry point', () => {
  test.each(ALWAYS)('%s imports bootstrap-env first', (rel) => {
    expect(firstImport(path.join(ROOT, rel))).toMatch(STATIC_BOOTSTRAP);
  });

  test('every script that imports bootstrap-env statically imports it first', () => {
    const offenders = scripts(path.join(ROOT, 'scripts'))
      .filter((file) => fs.readFileSync(file, 'utf8').split('\n').some((line) => STATIC_BOOTSTRAP.test(line)))
      .filter((file) => !STATIC_BOOTSTRAP.test(firstImport(file) ?? ''))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  test('every script that touches instance data loads bootstrap-env (#1609)', () => {
    const missing = scripts(path.join(ROOT, 'scripts'))
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return TOUCHES_INSTANCE.test(source) && !ANY_BOOTSTRAP.test(source);
      })
      .map((file) => path.relative(ROOT, file));
    expect(missing).toEqual([]);
  });
});
