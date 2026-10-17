/**
 * create-addon scaffolder tests (#675).
 *
 * These assert the generated addon satisfies the contracts AddonsManager and
 * the page validator actually enforce — not merely that files were written.
 * A scaffolder whose output does not load is worse than no scaffolder: it
 * costs the author the time to find out.
 *
 * Everything generates into an os-tmpdir path created per test and removed in
 * afterEach. Nothing here touches ./data, ./addons or required-pages.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import matter from 'gray-matter';
import { validate as validateUuid, version as uuidVersion } from 'uuid';

import {
  scaffoldAddon,
  parseArgs,
  validateSlug,
  toPascalCase,
  toTitleCase,
  SLUG_PATTERN,
  ngdpbaseVersion,
  type ScaffoldOptions
} from '../create-addon';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-scaffold-'));
});

afterEach(async () => {
  // Only ever the per-test temp dir — never a repo path.
  if (tmp && tmp.startsWith(os.tmpdir())) await fs.remove(tmp);
});

function opts(over: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return {
    id: 'volcano-watch',
    type: 'additive',
    plugins: ['VolcanoMap'],
    managers: ['VolcanoData'],
    target: path.join(tmp, 'volcano-watch'),
    ...over
  };
}

describe('slug validation (#927 identity rules)', () => {
  test('accepts a conventional slug', () => {
    expect(validateSlug('volcano-watch')).toBeNull();
    expect(SLUG_PATTERN.test('volcano-watch')).toBe(true);
  });

  test.each([
    ['', 'an --id is required'],
    ['Volcano-Watch', 'uppercase'],
    ['volcano_watch', 'underscore'],
    ['volcano--watch', 'double dash'],
    ['-volcano', 'leading dash'],
    ['volcano-', 'trailing dash']
  ])('rejects %s', (id) => {
    expect(validateSlug(id)).not.toBeNull();
  });

  test('rejects a -addon suffix because AddonsManager strips it', () => {
    // Left in, the folder would be `foo-addon` while the config key is
    // `ngdpbase.addons.foo.enabled` — the mismatch #927 exists to prevent.
    const err = validateSlug('foo-addon');
    expect(err).toContain("use 'foo'");
  });
});

describe('name derivation', () => {
  test('toPascalCase / toTitleCase', () => {
    expect(toPascalCase('volcano-watch')).toBe('VolcanoWatch');
    expect(toTitleCase('volcano-watch')).toBe('Volcano Watch');
    expect(toPascalCase('feeds')).toBe('Feeds');
  });
});

describe('argument parsing', () => {
  test('defaults type, plugin and manager names from the id', () => {
    const { options, error } = parseArgs(['--id', 'volcano-watch']);
    expect(error).toBeUndefined();
    expect(options!.type).toBe('additive');
    expect(options!.plugins).toEqual(['VolcanoWatch']);
    expect(options!.managers).toEqual(['VolcanoWatch']);
    expect(options!.target).toBe(path.join('addons', 'volcano-watch'));
  });

  test('parses lists and an explicit target', () => {
    const { options } = parseArgs([
      '--id', 'volcano-watch', '--type', 'domain',
      '--plugins', 'A,B', '--managers', 'C', '--target', '/tmp/x', '--scope', '@acme'
    ]);
    expect(options!.type).toBe('domain');
    expect(options!.plugins).toEqual(['A', 'B']);
    expect(options!.managers).toEqual(['C']);
    expect(options!.target).toBe('/tmp/x');
  });

  test('rejects an unknown --type rather than silently defaulting', () => {
    const { error } = parseArgs(['--id', 'x', '--type', 'plugin']);
    expect(error).toContain('--type must be');
  });

  test('rejects identifiers that would not compile', () => {
    const { error } = parseArgs(['--id', 'x', '--plugins', '9Lives']);
    expect(error).toContain('not a valid identifier');
  });

  // #1676: the scope is asked for, never guessed, outside this checkout's addons/.
  test('requires --scope for an addon outside this checkout, and for --repo', () => {
    expect(parseArgs(['--id', 'volcano-watch', '--target', '/tmp/x']).error).toContain('--scope is required');
    expect(parseArgs(['--id', 'volcano-watch', '--repo']).error).toContain('--scope is required');
  });

  test('a bundled addon (this checkout\'s addons/) needs no scope', () => {
    const { options, error } = parseArgs(['--id', 'volcano-watch']);
    expect(error).toBeUndefined();
    expect(options!.scope).toBeUndefined();
  });

  test('rejects a malformed scope', () => {
    expect(parseArgs(['--id', 'x', '--target', '/tmp/x', '--scope', 'acme']).error).toContain('--scope must look like');
    expect(parseArgs(['--id', 'x', '--target', '/tmp/x', '--scope', '@Acme']).error).toContain('--scope must look like');
  });
});

describe('#1244 — the generated addon has the guarded defaults, and passes every boundary guard', () => {
  test('route, view, config and manager carry the three doors', async () => {
    await scaffoldAddon(opts());
    const dir = path.join(tmp, 'volcano-watch');
    const route = await fs.readFile(path.join(dir, 'routes', 'api.ts'), 'utf8');
    const view = await fs.readFile(path.join(dir, 'views', 'volcano-watch-status.ejs'), 'utf8');
    const index = await fs.readFile(path.join(dir, 'index.ts'), 'utf8');
    const config = await fs.readJson(path.join(dir, 'config', 'default-config.json'));
    const manager = await fs.readFile(path.join(dir, 'managers', 'VolcanoDataManager.ts'), 'utf8');

    expect(route).toContain("requirePermission('volcano-watch-manage')");
    // Code only — the route's header comment names the things it must never do.
    const routeCode = route.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l)).join('\n');
    expect(routeCode).not.toMatch(/isAuthenticated|hasRole|roles\s*:/);
    expect(view).toContain('(window.csrfFetch || fetch)');
    expect(index).toContain('guardedFetch(');
    expect(index).toContain('resolveEgressPolicy(');
    expect(manager).toContain('fetchJson');
    expect(manager).not.toMatch(/\bfetch\(/);
    expect(config['ngdpbase.permissions.definitions']['volcano-watch-manage']).toBeDefined();
    expect(config['ngdpbase.access.policies'][0].actions).toEqual(['volcano-watch-manage']);
  });

  // #1861: an installed addon has no express of its own; core hands out the router.
  test('routes come from engine.createRouter(), and express is imported for types only', async () => {
    await scaffoldAddon(opts());
    const dir = path.join(tmp, 'volcano-watch');
    const route = await fs.readFile(path.join(dir, 'routes', 'api.ts'), 'utf8');
    const index = await fs.readFile(path.join(dir, 'index.ts'), 'utf8');

    expect(route).toContain('engine.createRouter()');
    expect(route).not.toMatch(/(?<![.\w])Router\(\)/);
    for (const source of [route, index]) {
      const expressImports = source.split('\n').filter((l) => /^\s*import\b.*from\s+['"]express['"]/.test(l));
      for (const line of expressImports) expect(line).toMatch(/^\s*import\s+type\s/);
      expect(source).not.toMatch(/\bexpress\.static\(/);
    }
  });

  test('the host guards report nothing over a freshly generated addon', async () => {
    // Scaffold into <repo>/addons/<id> so each guard sees it where an addon lives.
    const repo = path.join(tmp, 'repo');
    await scaffoldAddon(opts({ target: path.join(repo, 'addons', 'volcano-watch') }));
    const csrf = await import('../check-csrf-fetch');
    const http = await import('../check-http-boundary');
    const subject = await import('../check-permission-subject');
    expect(csrf.findViolations(repo)).toEqual([]);
    expect(http.run(repo)).toEqual([]);
    expect(subject.run(repo)).toEqual([]);
    // And the view IS in the csrf guard's scope — a tokenless POST there would be reported.
    expect(csrf.collectFiles(repo)).toContain(path.join('addons', 'volcano-watch', 'views', 'volcano-watch-status.ejs'));
  });
});

describe('generated addon', () => {
  test('package.json carries the authoritative ngdpbase manifest block', async () => {
    await scaffoldAddon(opts());
    const pkg = await fs.readJson(path.join(tmp, 'volcano-watch', 'package.json'));
    // #1757: generated against this core, so this core is the oldest it is known to run on.
    expect(pkg.ngdpbase).toEqual({ slug: 'volcano-watch', type: 'additive', minVersion: ngdpbaseVersion() });
    expect(pkg.type).toBe('module');
    expect(pkg.name).toBe('@ngdpbase/volcano-watch');
  });

  // #1676
  test('a scoped addon is named <scope>/<id>-addon, at 0.1.0, Apache-2.0, with index.ts on the same version', async () => {
    await scaffoldAddon({ ...opts(), scope: '@acme' });
    const dir = path.join(tmp, 'volcano-watch');
    const pkg = await fs.readJson(path.join(dir, 'package.json'));
    expect(pkg.name).toBe('@acme/volcano-watch-addon');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.license).toBe('Apache-2.0');
    const index = await fs.readFile(path.join(dir, 'index.ts'), 'utf8');
    expect(index).toContain("version: '0.1.0'");
    expect(index).not.toContain("version: '1.0.0'");
  });

  test('declares the types its generated code actually needs', async () => {
    // index.ts imports node builtins, so without @types/node the addon cannot
    // be typechecked standalone — it only appears to work inside a checkout
    // that already has them. The template repo's CI caught this.
    await scaffoldAddon(opts());
    const dir = path.join(tmp, 'volcano-watch');
    const pkg = await fs.readJson(path.join(dir, 'package.json'));
    const index = await fs.readFile(path.join(dir, 'index.ts'), 'utf8');

    expect(index).toMatch(/from 'path'|from "path"/);
    expect(pkg.devDependencies['@types/node']).toBeDefined();
    expect(pkg.devDependencies.typescript).toBeDefined();
  });

  test('the exported name equals the manifest slug', async () => {
    // AddonsManager warns loudly when these disagree, because the config key
    // follows the slug. The scaffolder must never emit that mismatch.
    await scaffoldAddon(opts());
    const dir = path.join(tmp, 'volcano-watch');
    const pkg = await fs.readJson(path.join(dir, 'package.json'));
    const index = await fs.readFile(path.join(dir, 'index.ts'), 'utf8');
    expect(index).toContain(`name: '${pkg.ngdpbase.slug}'`);
  });

  test('seed page has a real v4 uuid, not a placeholder', async () => {
    const result = await scaffoldAddon(opts());
    expect(validateUuid(result.pageUuid)).toBe(true);
    expect(uuidVersion(result.pageUuid)).toBe(4);

    const pagePath = path.join(tmp, 'volcano-watch', 'pages', `${result.pageUuid}.md`);
    const parsed = matter(await fs.readFile(pagePath, 'utf8'));
    // The filename must equal the frontmatter uuid — AddonsManager skips a
    // page whose uuid is missing or invalid, silently losing it.
    expect(parsed.data.uuid).toBe(result.pageUuid);
    expect(validateUuid(parsed.data.uuid as string)).toBe(true);
  });

  test('two runs never produce the same page uuid', async () => {
    const a = await scaffoldAddon(opts({ target: path.join(tmp, 'a') }));
    const b = await scaffoldAddon(opts({ target: path.join(tmp, 'b') }));
    expect(a.pageUuid).not.toBe(b.pageUuid);
  });

  test('seed page frontmatter satisfies the required fields', async () => {
    const result = await scaffoldAddon(opts());
    const pagePath = path.join(tmp, 'volcano-watch', 'pages', `${result.pageUuid}.md`);
    const { data } = matter(await fs.readFile(pagePath, 'utf8'));
    expect(data.title).toBe('Using Volcano Watch');
    expect(data.slug).toBe('using-volcano-watch');
    // Every addon page is category addon and names its addon (addons.md §9, #1378).
    expect(data['system-category']).toBe('addon');
    expect(data.addon).toBe('volcano-watch');
    expect(data.author).toBe('system');
    expect(String(data.lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('generates one file per requested plugin and manager', async () => {
    await scaffoldAddon(opts({ plugins: ['Alpha', 'Beta'], managers: ['Gamma'] }));
    const dir = path.join(tmp, 'volcano-watch');
    expect(await fs.pathExists(path.join(dir, 'plugins', 'AlphaPlugin.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'plugins', 'BetaPlugin.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'managers', 'GammaManager.ts'))).toBe(true);

    const index = await fs.readFile(path.join(dir, 'index.ts'), 'utf8');
    // Every generated artifact must actually be wired in register() — an
    // unreferenced stub is the kind of thing that looks scaffolded and isn't.
    expect(index).toContain("registerPlugin('Alpha', AlphaPlugin)");
    expect(index).toContain("registerPlugin('Beta', BetaPlugin)");
    expect(index).toContain("registerManager('GammaManager', gamma)");
  });

  test('config default-config.json ships the enable key, defaulting off', async () => {
    await scaffoldAddon(opts());
    const cfg = await fs.readJson(path.join(tmp, 'volcano-watch', 'config', 'default-config.json'));
    expect(cfg['ngdpbase.addons.volcano-watch.enabled']).toBe(false);
    expect(cfg['ngdpbase.addons.volcano-watch.dataPath']).toBe('./data/volcano-watch');
  });

  test('domain type is carried into the manifest and README', async () => {
    await scaffoldAddon(opts({ type: 'domain' }));
    const dir = path.join(tmp, 'volcano-watch');
    const pkg = await fs.readJson(path.join(dir, 'package.json'));
    expect(pkg.ngdpbase.type).toBe('domain');
    expect(await fs.readFile(path.join(dir, 'README.md'), 'utf8'))
      .toContain('this addon IS the site identity');
  });

  test('plugin escapes its params', async () => {
    await scaffoldAddon(opts({ plugins: ['Alpha'] }));
    const src = await fs.readFile(path.join(tmp, 'volcano-watch', 'plugins', 'AlphaPlugin.ts'), 'utf8');
    expect(src).toContain('&amp;');
    expect(src).toContain('&lt;');
  });

  test('never says "wiki" in anything it writes (house rule)', async () => {
    const result = await scaffoldAddon(opts({ type: 'domain' }));
    for (const rel of result.files) {
      expect(await fs.readFile(path.join(tmp, 'volcano-watch', rel), 'utf8')).not.toMatch(/wiki/i);
    }
  });

  test('reports every file it wrote', async () => {
    const result = await scaffoldAddon(opts());
    for (const rel of result.files) {
      expect(await fs.pathExists(path.join(tmp, 'volcano-watch', rel))).toBe(true);
    }
    expect(result.files).toContain('index.ts');
    expect(result.files).toContain('package.json');
  });
});

describe('--repo (#1636) — a whole standalone repository', () => {
  const fixedUuid = (): string => '32e4b968-76e9-4a14-9b59-5eba4948285a';
  const repoRoot = (): string => path.join(tmp, 'repo');

  async function readTree(dir: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const walk = async (rel: string): Promise<void> => {
      for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
        const child = path.join(rel, entry.name);
        if (entry.isDirectory()) await walk(child);
        else out[child] = await fs.readFile(path.join(dir, child), 'utf8');
      }
    };
    await walk('');
    return out;
  }

  test('parseArgs sets repo, and defaults the target to a sibling of this checkout', () => {
    const { options } = parseArgs(['--id', 'volcano-watch', '--repo', '--scope', '@acme']);
    expect(options!.repo).toBe(true);
    expect(options!.target).toBe(path.join('..', 'volcano-watch'));
    expect(parseArgs(['--id', 'volcano-watch']).options!.repo).toBe(false);
  });

  test('writes the repository files at the root and the addon under addons/<id>/', async () => {
    const result = await scaffoldAddon(opts({ repo: true, target: repoRoot() }));
    for (const rel of ['renovate.json', '.github/workflows/ci.yml', '.gitignore', 'LICENSE', 'README.md']) {
      expect(result.files).toContain(rel);
      expect(await fs.pathExists(path.join(repoRoot(), rel))).toBe(true);
    }
    expect(await fs.pathExists(path.join(repoRoot(), 'addons', 'volcano-watch', 'index.ts'))).toBe(true);
    // No rename machinery: the generator names everything correctly from the start.
    expect(await fs.pathExists(path.join(repoRoot(), 'CONTRIBUTING.md'))).toBe(false);
    // #1829: nothing deployment-specific — the Dockerfile lives in the site repo.
    expect(await fs.pathExists(path.join(repoRoot(), 'Dockerfile'))).toBe(false);
    expect(await fs.pathExists(path.join(repoRoot(), '.dockerignore'))).toBe(false);
    expect(result.files).not.toContain('Dockerfile');
    expect(await fs.pathExists(path.join(repoRoot(), '.github', 'workflows', 'addon-rename-detector.yml'))).toBe(false);
  });

  test('the addon inside is byte-identical to the non-repo output', async () => {
    await scaffoldAddon(opts({ uuid: fixedUuid, target: path.join(tmp, 'plain') }));
    await scaffoldAddon(opts({ uuid: fixedUuid, repo: true, target: repoRoot() }));
    const plain = await readTree(path.join(tmp, 'plain'));
    const inRepo = await readTree(path.join(repoRoot(), 'addons', 'volcano-watch'));
    expect(Object.keys(plain).length).toBeGreaterThan(0);
    expect(inRepo).toEqual(plain);
  });

  test('the slug and the current ngdpbase version are substituted', async () => {
    await scaffoldAddon(opts({ repo: true, target: repoRoot() }));
    const { version } = await fs.readJson(path.resolve('package.json'));
    expect(ngdpbaseVersion()).toBe(version);

    const ci = await fs.readFile(path.join(repoRoot(), '.github', 'workflows', 'ci.yml'), 'utf8');
    // CI reads the base version from the manifest's minVersion — one source, no drift.
    const manifest = await fs.readJson(path.join(repoRoot(), 'addons', 'volcano-watch', 'package.json'));
    expect(manifest.ngdpbase.minVersion).toBe(version);
    expect(ci).toContain('require(\'./addons/volcano-watch/package.json\').ngdpbase.minVersion');
    expect(ci).toContain('ngdpbase:${NGDPBASE_VERSION}-devtools');
    expect(ci).toContain('$PWD/addons/volcano-watch:/app/addons/volcano-watch:ro');
    expect(ci).toContain('addons/volcano-watch/index.ts');
    // #1829: no image build and no Dockerfile reference.
    expect(ci).not.toMatch(/docker build|Dockerfile/);

    // #1829: Renovate keeps the repo's own dependencies current, with no rule for the ngdpbase image.
    const renovate = await fs.readJson(path.join(repoRoot(), 'renovate.json'));
    expect(renovate.extends).toEqual(['config:recommended']);
    expect(JSON.stringify(renovate)).not.toMatch(/ngdpbase|docker|regexManagers|customManagers/);

    const readme = await fs.readFile(path.join(repoRoot(), 'README.md'), 'utf8');
    expect(readme).toContain('"ngdpbase.addons.volcano-watch.enabled": true');
    expect(readme).toContain('docs/guides/addons-developer-guide.md');
    expect(readme).toContain('addons-developer-guide.md#12-shipping-your-addon-as-a-container-image');
    expect(readme).not.toMatch(/docker build|\| `Dockerfile`/);

    expect(await fs.readFile(path.join(repoRoot(), 'LICENSE'), 'utf8')).toContain('Apache License');
  });

  test('never says "wiki" in any file of the repository', async () => {
    await scaffoldAddon(opts({ repo: true, target: repoRoot() }));
    const tree = await readTree(repoRoot());
    for (const [rel, content] of Object.entries(tree)) {
      expect({ rel, wiki: /wiki/i.test(content) }).toEqual({ rel, wiki: false });
    }
  });
});

describe('#1829 — the CLI runs in a clone with no .env and no run-as user', () => {
  test('scaffolds with PUID/PGID unset, from a cwd with no .env, and writes nothing else there', () => {
    const root = path.resolve(__dirname, '..', '..');
    const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
    const cwd = path.join(tmp, 'clone');
    fs.ensureDirSync(cwd);
    // A cleaned environment: no PUID, PGID, FAST_STORAGE or anything from this shell's .env.
    const env = { PATH: process.env.PATH ?? '', HOME: tmp };
    const run = spawnSync(tsx, [path.join(root, 'scripts', 'create-addon.ts'),
      '--id', 'volcano-watch', '--repo', '--target', 'vw', '--scope', '@acme'], { cwd, env, encoding: 'utf8' });

    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(run.stdout).toContain("Scaffolded 'volcano-watch'");
    expect(fs.pathExistsSync(path.join(cwd, 'vw', 'addons', 'volcano-watch', 'index.ts'))).toBe(true);
    // No instance bootstrap ran: no data folder, no backfilled secrets.
    expect(fs.readdirSync(cwd)).toEqual(['vw']);
  }, 60_000);
});
