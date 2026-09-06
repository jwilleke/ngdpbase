/**
 * #1239 — eslint refuses a bare fetch and the HTTP client libraries outside
 * src/http/, in src/ and addons/ alike.
 *
 * The editor-time half of check-http-boundary. Its scope is asserted here the
 * way the scripts' is — but in memory. The first version wrote probe files
 * into the tree and linted them in place; under coverage's parallel workers
 * the http-boundary "real tree" test scanned the probe and went red. A test
 * that mutates the tree races every other test that reads it.
 *
 * So: the rule block is taken from the repo's own eslint.config.mjs (the
 * block that carries no-restricted-globals), and the probe source is linted
 * through ESLint's lintText with a virtual path — the files / ignores
 * patterns apply to that path exactly as they would on disk. Type-aware
 * parsing is not needed for these two rules, so the parser runs without a
 * project. Sabotage: remove the block from the config and the two positive
 * cases go red.
 */
import path from 'path';
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import repoConfig from '../../../eslint.config.mjs';

const REPO = path.resolve(__dirname, '..', '..', '..');
const CODE = [
  "import axios from 'axios';",
  "import type { Client } from '@elastic/elasticsearch';",
  "export const r = fetch('https://example.com');",
  'export const a = axios; export type C = Client;',
  ''
].join('\n');

/** The repo's outbound-HTTP block(s), and nothing else from the config. */
const ruleBlocks = (repoConfig as Linter.Config[]).filter((b) => b.rules && 'no-restricted-globals' in b.rules);

async function lint(virtualPath: string): Promise<string[]> {
  const eslint = new ESLint({
    cwd: REPO,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        plugins: { '@typescript-eslint': tseslint.plugin },
        languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: 'module' }
      },
      ...ruleBlocks
    ]
  });
  const [result] = await eslint.lintText(CODE, { filePath: path.join(REPO, virtualPath) });
  return result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'parse-error');
}

describe('#1239 — the outbound-HTTP rules', () => {
  test('the config carries exactly one such block', () => {
    expect(ruleBlocks).toHaveLength(1);
  });

  test('an addon source file with a bare fetch and a client-library import is refused; the type-only import is not', async () => {
    const rules = await lint('addons/demo/src/probe.ts');
    expect(rules).toContain('no-restricted-globals');
    expect(rules).toContain('@typescript-eslint/no-restricted-imports');
    expect(rules.filter((r) => r === '@typescript-eslint/no-restricted-imports')).toHaveLength(1);
  });

  test('the same file under src/ is refused the same way', async () => {
    const rules = await lint('src/utils/probe.ts');
    expect(rules).toContain('no-restricted-globals');
    expect(rules).toContain('@typescript-eslint/no-restricted-imports');
  });

  test('src/http/ is the door, and tests are exempt: the same file there trips neither rule', async () => {
    expect(await lint('src/http/probe.ts')).toEqual([]);
    expect(await lint('addons/demo/__tests__/probe.test.ts')).toEqual([]);
  });
});
