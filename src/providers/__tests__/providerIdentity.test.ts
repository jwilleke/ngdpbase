/**
 * #1151 — one `ProviderInfo`, and every provider still says who it is.
 *
 * `ProviderInfo` was declared nine times: once canonically in
 * `src/types/Provider.ts` and eight times locally. The issue described those as
 * structural copies of one type; they were not, and that is the finding that
 * made the consolidation worth doing rather than cosmetic. They had already
 * drifted into __three__ different shapes:
 *
 * - canonical — `description?` and `features?` optional
 * - six provider-local copies — both REQUIRED
 * - two manager-local copies — no `description`, `version?`, plus an index
 *   signature `[key: string]: unknown`
 *
 * A type declared nine times where three of the copies disagree is not a
 * tidiness problem. It means a provider could satisfy its own local shape and
 * not the one its manager reads, with nothing to catch it.
 */
vi.unmock('../BaseProvider');
vi.unmock('../FileAuditProvider');

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import BaseProvider from '../BaseProvider';
import type { ProviderInfo } from '../../types/Provider';

const REPO = process.cwd();

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('#1151 — ProviderInfo is declared once', () => {
  test('exactly one declaration survives in src/', () => {
    // The durable half of this issue. Consolidating nine into one is a single
    // commit; keeping it at one is what this assertion is for, and it is the
    // only thing standing between here and the same drift returning.
    const declarations = walk(path.join(REPO, 'src'))
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => /(?:^|\n)\s*(?:export\s+)?interface ProviderInfo\b/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(REPO, f));

    expect(declarations).toEqual(['src/types/Provider.ts']);
  });
});

describe('#1151 — BaseProvider can identify a provider on its own', () => {
  class Minimal extends BaseProvider {}

  class Declared extends BaseProvider {
    constructor() {
      super();
      this.providerName = 'DeclaredProvider';
      this.providerVersion = '2.1.0';
      this.providerDescription = 'states its own identity';
      this.providerFeatures = ['alpha', 'beta'];
    }
  }

  test('a provider that sets the fields reports them', () => {
    const info: ProviderInfo = new Declared().getProviderInfo();
    expect(info).toEqual({
      name: 'DeclaredProvider',
      version: '2.1.0',
      description: 'states its own identity',
      features: ['alpha', 'beta']
    });
  });

  test('a provider that sets nothing reports its class name, not a placeholder', () => {
    // The answer is either what the author chose or what the runtime knows.
    // A hardcoded 'UnknownProvider' would be a third thing: a lie that reads
    // like a value.
    const info = new Minimal().getProviderInfo();
    expect(info.name).toBe('Minimal');
    expect(info.version).toBe('1.0.0');
    expect(info.description).toBeUndefined();
    expect(info.features).toEqual([]);
  });
});

/**
 * The real gate the issue names: 36 provider files, no behaviour change
 * intended, so a provider reporting anything different is a regression.
 */
describe('#1151 — every provider still reports its own identity', () => {
  const cases: Array<[string, () => { getProviderInfo(): ProviderInfo }]> = [];

  beforeAll(async () => {
    const engine = { getManager: () => null } as never;
    const load = async (mod: string, ctor = true): Promise<void> => {
      const m = (await import(mod)) as { default: new (e?: unknown) => never };
      cases.push([mod, () => (ctor ? new m.default(engine) : new m.default())]);
    };
    await load('../BasePageProvider');
    await load('../BaseUserProvider');
    await load('../BaseAuditProvider');
    await load('../BaseCacheProvider');
    await load('../BaseSearchProvider');
    await load('../BaseAttachmentProvider');
    await load('../BaseBackupProvider');
  });

  test('each base class names itself, with a version', () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const [mod, make] of cases) {
      const info = make().getProviderInfo();
      const expected = mod.replace('../', '');
      expect(info.name, `${mod} lost its name`).toBe(expected);
      expect(info.version, `${mod} lost its version`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test('a concrete provider keeps the identity it declares', async () => {
    // Concrete providers still override getProviderInfo(): their name, version
    // and feature list are their own data, not duplication. Only the SHAPE
    // moved up, so this must be unchanged by #1151.
    const { default: FileAuditProvider } = await import('../FileAuditProvider');
    const info = new FileAuditProvider({ getManager: () => null }).getProviderInfo();
    expect(info.name).toBe('FileAuditProvider');
    expect(info.features).toContain('search');
  });
});
