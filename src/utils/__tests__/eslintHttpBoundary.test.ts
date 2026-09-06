/**
 * #1239 — eslint refuses a bare fetch and the HTTP client libraries outside
 * src/http/, in src/ and addons/ alike.
 *
 * The editor-time half of check-http-boundary. Its scope is asserted here the
 * way the scripts' is: a probe file is written where the rule must fire (an
 * addon's source, inside that addon's tsconfig so the type-aware parser
 * accepts it) and where it must not (src/http/, the door), linted with the
 * repo's real config, and removed. If either probe is ever left behind by a
 * crash, lint:code goes red on it — which is the right failure.
 */
import fs from 'fs-extra';
import path from 'path';
import { ESLint } from 'eslint';

const REPO = path.resolve(__dirname, '..', '..', '..');
const PROBE_ADDON = path.join(REPO, 'addons', 'demo', 'src', '__lint_probe_1239__.ts');
const PROBE_DOOR = path.join(REPO, 'src', 'http', '__lint_probe_1239__.ts');
const PROBE_SRC = path.join(REPO, 'src', 'utils', '__lint_probe_1239__.ts');
const CODE = [
  "import axios from 'axios';",
  "import type { Client } from '@elastic/elasticsearch';",
  "export const r = fetch('https://example.com');",
  'export const a = axios; export type C = Client;',
  ''
].join('\n');

async function lint(file: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: REPO });
  const [result] = await eslint.lintFiles([file]);
  return result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'parse-error');
}

describe('#1239 — the outbound-HTTP rules', () => {
  afterEach(async () => {
    for (const f of [PROBE_ADDON, PROBE_DOOR, PROBE_SRC]) await fs.remove(f);
  });

  test('an addon source file with a bare fetch and a client-library import is refused; the type-only import is not', async () => {
    await fs.outputFile(PROBE_ADDON, CODE);
    const rules = await lint(PROBE_ADDON);
    expect(rules).toContain('no-restricted-globals');
    expect(rules).toContain('@typescript-eslint/no-restricted-imports');
    expect(rules.filter((r) => r === '@typescript-eslint/no-restricted-imports')).toHaveLength(1);
  }, 60_000);

  test('the same file under src/ is refused the same way', async () => {
    await fs.outputFile(PROBE_SRC, CODE);
    const rules = await lint(PROBE_SRC);
    expect(rules).toContain('no-restricted-globals');
    expect(rules).toContain('@typescript-eslint/no-restricted-imports');
  }, 60_000);

  test('src/http/ is the door: the same file there trips neither rule', async () => {
    await fs.outputFile(PROBE_DOOR, CODE);
    const rules = await lint(PROBE_DOOR);
    expect(rules).not.toContain('no-restricted-globals');
    expect(rules).not.toContain('@typescript-eslint/no-restricted-imports');
  }, 60_000);
});
