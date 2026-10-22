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
import crypto from 'crypto';
import path from 'path';
import { spawnSync } from 'child_process';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { validate as validateUuid, version as uuidVersion } from 'uuid';

import {
  scaffoldAddon,
  parseArgs,
  validateSlug,
  toPascalCase,
  toTitleCase,
  SLUG_PATTERN,
  ngdpbaseVersion,
  publishWorkflow,
  readPublishWorkflow,
  updatePublishWorkflow,
  PUBLISH_WORKFLOW_VERSION,
  type ScaffoldOptions
} from '../create-addon';
import { NONCE, scriptsWithoutNonce, inlineHandlers, javascriptUrls } from '../../src/__tests__/__fixtures__/viewCspContract';

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

  // #1706: the scaffold's views follow the CSP contract the host's own views are held to.
  test('every generated view carries the nonce, and has no inline handler or javascript: URL', async () => {
    await scaffoldAddon(opts());
    const viewsDir = path.join(tmp, 'volcano-watch', 'views');
    const views = (await fs.readdir(viewsDir)).filter((f) => f.endsWith('.ejs'));
    expect(views.length).toBeGreaterThan(0);
    for (const name of views) {
      const source = await fs.readFile(path.join(viewsDir, name), 'utf8');
      expect(source).toContain(NONCE);
      expect(scriptsWithoutNonce(source)).toEqual([]);
      expect(inlineHandlers(source)).toEqual([]);
      expect(javascriptUrls(source)).toEqual([]);
    }
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

  describe('publish.yml (#1863) — npm trusted publishing with provenance on a release tag', () => {
    interface Step { name?: string; id?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown>; env?: Record<string, string>; 'working-directory'?: string }
    interface Job { 'runs-on': string; needs?: string; permissions: Record<string, string>; outputs?: Record<string, string>; steps: Step[] }
    interface Workflow { on: { push: { tags: string[] } }; env: Record<string, string>; permissions: Record<string, string>; jobs: { publish: Job; release: Job } }

    const REPO = 'acme/volcano-repo';
    const workflowPath = (): string => path.join(repoRoot(), '.github', 'workflows', 'publish.yml');
    const load = async (over: Partial<ScaffoldOptions> = {}): Promise<{ text: string; wf: Workflow }> => {
      await scaffoldAddon(opts({ repo: true, target: repoRoot(), scope: '@acme', ...over }));
      const text = await fs.readFile(workflowPath(), 'utf8');
      return { text, wf: yaml.load(text) as Workflow };
    };
    const step = (wf: Workflow, name: string): Step => {
      const found = wf.jobs.publish.steps.find(s => s.name === name);
      if (!found) throw new Error(`no step '${name}'`);
      return found;
    };
    const releaseStep = (wf: Workflow, name: string): Step => {
      const found = wf.jobs.release.steps.find(s => s.name === name);
      if (!found) throw new Error(`no release step '${name}'`);
      return found;
    };

    /** A package.json that follows every publishing rule, for add-on `slug` in REPO. */
    const goodPkg = (slug = 'volcano-watch', over: Record<string, unknown> = {}): Record<string, unknown> => ({
      name: `@acme/${slug}-addon`,
      version: '0.1.0',
      license: 'Apache-2.0',
      engines: { node: '>=24.15.0' },
      files: ['index.js'],
      repository: { type: 'git', url: `https://github.com/${REPO}.git`, directory: `addons/${slug}` },
      ngdpbase: { slug, minVersion: '5.14.0' },
      ...over
    });

    /** An add-on repository holding `addons` (slug → package.json, plus extra files). */
    function makeRepo(addons: Record<string, { pkg?: Record<string, unknown>; files?: Record<string, string> }>): string {
      const root = path.join(tmp, `gh-${Math.random().toString(36).slice(2)}`);
      for (const [slug, a] of Object.entries(addons)) {
        const dir = path.join(root, 'addons', slug);
        fs.ensureDirSync(dir);
        if (a.pkg) fs.writeJsonSync(path.join(dir, 'package.json'), a.pkg);
        for (const [rel, content] of Object.entries(a.files ?? {})) {
          fs.ensureDirSync(path.dirname(path.join(dir, rel)));
          fs.writeFileSync(path.join(dir, rel), content);
        }
      }
      fs.ensureDirSync(root);
      return root;
    }

    /** Run one step's shell as the runner would: in `cwd`, with GITHUB_OUTPUT and RUNNER_TEMP, and the step's env given as values. */
    function runStep(s: Step, cwd: string, env: Record<string, string> = {}): { status: number | null; out: string; outputs: Record<string, string> } {
      const runnerTemp = fs.mkdtempSync(path.join(tmp, 'runner-'));
      const outputFile = path.join(runnerTemp, 'output');
      fs.writeFileSync(outputFile, '');
      const run = spawnSync('bash', ['-e', '-c', s.run!], {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '', HOME: tmp, RUNNER_TEMP: runnerTemp, GITHUB_OUTPUT: outputFile,
          GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: REPO, GITHUB_REF_NAME: 'volcano-watch-v0.1.0',
          NGDPBASE_PLAIN_TAGS: 'false', ...env
        }
      });
      const outputs = Object.fromEntries(fs.readFileSync(outputFile, 'utf8').split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
      return { status: run.status, out: run.stdout + run.stderr, outputs };
    }

    test('--repo writes it with a version marker; it parses; publish then release', async () => {
      const result = await scaffoldAddon(opts({ repo: true, target: repoRoot(), scope: '@acme' }));
      expect(result.files).toContain('.github/workflows/publish.yml');
      const { text, wf } = await load();
      expect(text.split('\n')[0]).toBe(`# ngdpbase-publish-workflow: ${PUBLISH_WORKFLOW_VERSION}`);
      expect(Object.keys(wf.jobs)).toEqual(['publish', 'release']);
      expect(wf.jobs.publish['runs-on']).toBe('ubuntu-latest');
      expect(wf.jobs.publish.steps.slice(0, 2).map(s => s.uses)).toEqual(['actions/checkout@v7', 'actions/setup-node@v7']);
      expect(wf.jobs.publish.steps[1].with).toEqual({ 'node-version': '24.x', 'registry-url': 'https://registry.npmjs.org' });
      // The order agreed on #1863: rules, core, install, build, test, pack check, publish.
      expect(wf.jobs.publish.steps.slice(2).map(s => s.name)).toEqual([
        'Node 24.15 or later, npm 11.5.1 or later',
        'Resolve the add-on from the tag',
        'package.json follows the publishing rules',
        'Does the add-on import ngdpbase core?',
        'Build ngdpbase core at ngdpbase.minVersion',
        'Install',
        'Build',
        'Test',
        'The package ships no .ts sources or tests',
        'Pack the tarball',
        'Publish with provenance',
        'Keep the published tarball for the release'
      ]);
      expect(wf.jobs.release.needs).toBe('publish');
    });

    test('by default only <slug>-v<version> tags trigger it', async () => {
      const { wf } = await load();
      expect(wf.on).toEqual({ push: { tags: ['*-v[0-9]*'] } });
      expect(wf.env).toEqual({ NGDPBASE_PLAIN_TAGS: 'false' });
    });

    test('--plain-tags opts in to v<version> tags, and needs --repo', async () => {
      expect(parseArgs(['--id', 'volcano-watch', '--repo', '--scope', '@acme', '--plain-tags']).options!.plainTags).toBe(true);
      expect(parseArgs(['--id', 'volcano-watch', '--repo', '--scope', '@acme']).options!.plainTags).toBeUndefined();
      expect(parseArgs(['--id', 'volcano-watch', '--scope', '@acme', '--plain-tags']).error).toContain('--plain-tags only applies with --repo');
      const { wf } = await load({ plainTags: true });
      expect(wf.on).toEqual({ push: { tags: ['*-v[0-9]*', 'v[0-9]*'] } });
      expect(wf.env).toEqual({ NGDPBASE_PLAIN_TAGS: 'true' });
      const readme = await fs.readFile(path.join(repoRoot(), 'README.md'), 'utf8');
      expect(readme).toContain('git tag v0.1.0\n');
    });

    test('OIDC publish with provenance and no stored token; only the release job writes', async () => {
      const { text, wf } = await load();
      expect(wf.permissions).toEqual({ contents: 'read' });
      expect(wf.jobs.publish.permissions).toEqual({ 'id-token': 'write', contents: 'read' });
      expect(wf.jobs.release.permissions).toEqual({ contents: 'write' });
      // It publishes the tarball it packed, the one the release attaches.
      const publish = step(wf, 'Publish with provenance');
      expect(publish.run!.trim()).toBe('npm publish "$TARBALL" --provenance --access public');
      expect(publish.env).toEqual({ TARBALL: '${{ steps.pack.outputs.tarball }}' });
      expect(text).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
      // Values reach scripts through env, never as an expression inside the script.
      for (const s of [...wf.jobs.publish.steps, ...wf.jobs.release.steps]) expect(s.run ?? '').not.toContain('${{');
    });

    test('the release job attaches the artifact the publish job uploaded, with no registry round-trip', async () => {
      const { wf } = await load();
      const upload = step(wf, 'Keep the published tarball for the release');
      expect(upload.uses).toBe('actions/upload-artifact@v7');
      expect(upload.with).toEqual({ name: 'tarball', path: '${{ runner.temp }}/release/', 'if-no-files-found': 'error' });
      expect(wf.jobs.release.steps.map(s => s.name ?? s.uses)).toEqual([
        'actions/setup-node@v7', 'Fetch the published tarball', 'npm serves the published tarball', 'GitHub release for the tag'
      ]);
      const fetch = releaseStep(wf, 'Fetch the published tarball');
      expect(fetch.uses).toBe('actions/download-artifact@v8');
      expect(fetch.with).toEqual({ name: 'tarball', path: 'release' });
      for (const s of wf.jobs.release.steps) expect(s.run ?? '').not.toMatch(/npm pack/);
      const release = releaseStep(wf, 'GitHub release for the tag');
      expect(release.env!.GH_TOKEN).toBe('${{ github.token }}');
      expect(release.run).toContain('gh release create "$GITHUB_REF_NAME" "$TARBALL" "$TARBALL.sha512"');
      expect(release.run).toContain('--verify-tag');
      expect(wf.jobs.publish.outputs).toEqual({ name: '${{ steps.tag.outputs.name }}', version: '${{ steps.tag.outputs.version }}' });
    });

    test('the pack step packs the add-on into RUNNER_TEMP/release with its sha512, and outputs its path', async () => {
      const { wf } = await load();
      const root = makeRepo({ 'volcano-watch': { pkg: goodPkg(), files: { 'index.js': 'module.exports = {};\n' } } });
      const r = runStep(step(wf, 'Pack the tarball'), path.join(root, 'addons', 'volcano-watch'));
      expect(r.status).toBe(0);
      const tarball = r.outputs.tarball;
      expect(path.basename(tarball)).toBe('acme-volcano-watch-addon-0.1.0.tgz');
      expect(path.basename(path.dirname(tarball))).toBe('release');
      const hex = crypto.createHash('sha512').update(fs.readFileSync(tarball)).digest('hex');
      expect(fs.readFileSync(`${tarball}.sha512`, 'utf8').trim().split(/\s+/)).toEqual([hex, path.basename(tarball)]);
    }, 30_000);

    describe('the release job checks that npm serves the published tarball', () => {
      const SPEC = '@acme/volcano-watch-addon@0.1.0';
      /**
       * Runs the check in a workspace holding the artifact, with a stub npm
       * whose `view` prints nothing for the first `misses` calls and then
       * `served` (the artifact's own integrity by default), and a stub sleep
       * that only records how long it was asked to wait.
       */
      function check(o: { misses: number; served?: string; wait?: string }): { status: number | null; out: string; views: number; sleeps: number[]; env: string } {
        const ws = fs.mkdtempSync(path.join(tmp, 'ws-'));
        const bin = fs.mkdtempSync(path.join(tmp, 'bin-'));
        const tgzName = 'acme-volcano-watch-addon-0.1.0.tgz';
        const content = Buffer.from('a tarball');
        fs.ensureDirSync(path.join(ws, 'release'));
        fs.writeFileSync(path.join(ws, 'release', tgzName), content);
        fs.writeFileSync(path.join(ws, 'release', `${tgzName}.sha512`), `${crypto.createHash('sha512').update(content).digest('hex')}  ${tgzName}\n`);
        const integrity = `sha512-${crypto.createHash('sha512').update(content).digest('base64')}`;
        const count = path.join(bin, 'views');
        const sleeps = path.join(bin, 'sleeps');
        fs.writeFileSync(count, '');
        fs.writeFileSync(sleeps, '');
        fs.writeFileSync(path.join(bin, 'npm'), [
          '#!/bin/sh',
          `[ "$1 $2 $3" = "view ${SPEC} dist.integrity" ] || { echo "unexpected npm $*" >&2; exit 2; }`,
          `echo x >> '${count}'`,
          `[ "$(wc -l < '${count}')" -gt ${o.misses} ] && echo '${o.served ?? integrity}'`,
          'exit 0', ''
        ].join('\n'), { mode: 0o755 });
        fs.writeFileSync(path.join(bin, 'sleep'), `#!/bin/sh\necho "$1" >> '${sleeps}'\n`, { mode: 0o755 });
        const githubEnv = path.join(bin, 'github-env');
        fs.writeFileSync(githubEnv, '');
        const s = releaseStep(yaml.load(publishWorkflow({})) as Workflow, 'npm serves the published tarball');
        expect(s.env!.NPM_WAIT_SECONDS).toBe('900');
        const r = runStep(s, ws, {
          ...s.env, SPEC, PATH: `${bin}:${process.env.PATH ?? ''}`, GITHUB_ENV: githubEnv,
          ...(o.wait ? { NPM_WAIT_SECONDS: o.wait } : {})
        });
        return {
          ...r,
          views: fs.readFileSync(count, 'utf8').split('\n').filter(Boolean).length,
          sleeps: fs.readFileSync(sleeps, 'utf8').split('\n').filter(Boolean).map(Number),
          env: fs.readFileSync(githubEnv, 'utf8')
        };
      }

      test('succeeds once npm serves the version, after misses, backing off', () => {
        const r = check({ misses: 4 });
        expect(r.status).toBe(0);
        expect(r.views).toBe(5);
        expect(r.sleeps).toEqual([5, 10, 20, 40]);
        expect(r.out).toContain(`npm serves ${SPEC} with integrity sha512-`);
        expect(r.env).toBe('TARBALL=release/acme-volcano-watch-addon-0.1.0.tgz\n');
      });

      test('times out with ::error:: and a nonzero exit, and never makes the release', () => {
        const r = check({ misses: 1000 });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain(`::error::npm did not serve ${SPEC} within 900 seconds, so the release was not made.`);
        expect(r.out).toContain(`The package is published; re-run the failed jobs once 'npm view ${SPEC}' shows it.`);
        // 5 + 10 + 20 + 40 + 14 × 60 = 915: the backoff caps at 60 and stops past the limit.
        expect(r.sleeps).toEqual([5, 10, 20, 40, ...Array<number>(14).fill(60)]);
        expect(r.env).toBe('');
      });

      test('the limit is the step\'s NPM_WAIT_SECONDS', () => {
        const r = check({ misses: 1000, wait: '30' });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('within 30 seconds');
        expect(r.sleeps).toEqual([5, 10, 20]);
      });

      test('a different integrity from npm fails with ::error::', () => {
        const r = check({ misses: 0, served: 'sha512-c29tZXRoaW5nIGVsc2U=' });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain(`::error::npm serves ${SPEC} with integrity sha512-c29tZXRoaW5nIGVsc2U=, but the published tarball is sha512-`);
        expect(r.env).toBe('');
      });
    });

    describe('the release is the repository\'s Latest only for a plain v<version> tag', () => {
      // Runs the release step with a stub gh that records its arguments.
      function releaseArgs(plainTags: boolean, tag: string): string[] {
        const bin = fs.mkdtempSync(path.join(tmp, 'bin-'));
        const log = path.join(bin, 'args');
        fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`, { mode: 0o755 });
        const wf = yaml.load(publishWorkflow({ plainTags })) as Workflow;
        const r = runStep(releaseStep(wf, 'GitHub release for the tag'), tmp, {
          PATH: `${bin}:${process.env.PATH ?? ''}`, GITHUB_REF_NAME: tag, TARBALL: 'x.tgz', SPEC: 'x@0.1.0', GH_TOKEN: 't',
          NGDPBASE_PLAIN_TAGS: String(plainTags)
        });
        expect(r.status).toBe(0);
        return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
      }

      test('a <slug>-v<version> release is not marked Latest, with or without --plain-tags', () => {
        for (const plain of [false, true]) {
          const args = releaseArgs(plain, 'volcano-watch-v0.1.0');
          expect(args.slice(0, 4)).toEqual(['release', 'create', 'volcano-watch-v0.1.0', 'x.tgz']);
          expect(args).toContain('--latest=false');
          expect(args).toContain('--verify-tag');
        }
      });

      test('a plain v<version> release (--plain-tags) leaves Latest to GitHub', () => {
        const args = releaseArgs(true, 'v0.1.0');
        expect(args.slice(0, 3)).toEqual(['release', 'create', 'v0.1.0']);
        expect(args.some(a => a.startsWith('--latest'))).toBe(false);
        expect(args).toContain('--verify-tag');
      });
    });

    test('the Node/npm check runs and passes on this repository\'s engines (>=24.15)', async () => {
      const { wf } = await load();
      const s = step(wf, 'Node 24.15 or later, npm 11.5.1 or later');
      expect(s.run).toContain('below(process.versions.node, "24.15.0")');
      expect(s.run).toContain('below(npm, "11.5.1")');
      expect(runStep(s, tmp)).toMatchObject({ status: 0, out: '' });
    });

    describe('the tag names the add-on folder', () => {
      let resolve: Step;
      beforeEach(async () => { resolve = step((await load()).wf, 'Resolve the add-on from the tag'); });

      test('<slug>-v<version> resolves addons/<slug>, with the package name from its package.json', () => {
        // A multi-add-on repository: the slug and the package name differ.
        const root = makeRepo({
          accounting: { pkg: goodPkg('accounting', { name: '@jwilleke/accounting-addon', version: '0.2.0' }) },
          'volcano-watch': { pkg: goodPkg() }
        });
        const r = runStep(resolve, root, { GITHUB_REF_NAME: 'accounting-v0.2.0' });
        expect(r.status).toBe(0);
        expect(r.outputs).toEqual({ slug: 'accounting', dir: 'addons/accounting', name: '@jwilleke/accounting-addon', version: '0.2.0' });
        expect(runStep(resolve, root, { GITHUB_REF_NAME: 'volcano-watch-v0.1.0' }).outputs.dir).toBe('addons/volcano-watch');
      });

      test('refuses a slug with no addons/<slug>/package.json', () => {
        const r = runStep(resolve, makeRepo({ 'volcano-watch': { pkg: goodPkg() } }), { GITHUB_REF_NAME: 'ledger-v0.1.0' });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('names add-on ledger, but there is no addons/ledger/package.json');
      });

      test('refuses a folder whose ngdpbase.slug differs', () => {
        const root = makeRepo({ 'volcano-watch': { pkg: goodPkg('volcano-watch', { ngdpbase: { slug: 'volcano', minVersion: '5.14.0' } }) } });
        const r = runStep(resolve, root);
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('addons/volcano-watch/package.json has ngdpbase.slug "volcano", not volcano-watch');
      });

      test('refuses a tag version that is not package.json\'s', () => {
        const r = runStep(resolve, makeRepo({ 'volcano-watch': { pkg: goodPkg() } }), { GITHUB_REF_NAME: 'volcano-watch-v0.2.0' });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('tag volcano-watch-v0.2.0 is version 0.2.0, but addons/volcano-watch/package.json is 0.1.0');
      });

      test('refuses a tag that is neither form', () => {
        const r = runStep(resolve, makeRepo({ 'volcano-watch': { pkg: goodPkg() } }), { GITHUB_REF_NAME: 'release-1' });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('is not <slug>-v<version>');
      });

      test('a plain v<version> tag is refused unless the repository opted in, then names its one add-on', () => {
        const one = makeRepo({ 'volcano-watch': { pkg: goodPkg() } });
        const refused = runStep(resolve, one, { GITHUB_REF_NAME: 'v0.1.0' });
        expect(refused.status).not.toBe(0);
        expect(refused.out).toContain('--plain-tags');

        const ok = runStep(resolve, one, { GITHUB_REF_NAME: 'v0.1.0', NGDPBASE_PLAIN_TAGS: 'true' });
        expect(ok.status).toBe(0);
        expect(ok.outputs.dir).toBe('addons/volcano-watch');

        const two = makeRepo({ 'volcano-watch': { pkg: goodPkg() }, accounting: { pkg: goodPkg('accounting') } });
        const ambiguous = runStep(resolve, two, { GITHUB_REF_NAME: 'v0.1.0', NGDPBASE_PLAIN_TAGS: 'true' });
        expect(ambiguous.status).not.toBe(0);
        expect(ambiguous.out).toContain('addons/ holds 2');
      });
    });

    describe('package.json follows the publishing rules', () => {
      let rules: Step;
      beforeEach(async () => { rules = step((await load()).wf, 'package.json follows the publishing rules'); });
      const check = (pkg: Record<string, unknown>): { status: number | null; out: string } => {
        const root = makeRepo({ 'volcano-watch': { pkg } });
        return runStep(rules, path.join(root, 'addons', 'volcano-watch'), { DIR: 'addons/volcano-watch' });
      };

      test('a package that follows them passes, with the repository URL in any of npm\'s spellings', () => {
        expect(check(goodPkg())).toMatchObject({ status: 0 });
        for (const url of [`git+https://github.com/${REPO}.git`, `https://github.com/${REPO}`, 'https://github.com/Acme/Volcano-Repo.git']) {
          expect(check(goodPkg('volcano-watch', { repository: { type: 'git', url, directory: 'addons/volcano-watch' } }))).toMatchObject({ status: 0 });
        }
        expect(check(goodPkg('volcano-watch', { engines: { node: '>=25' } }))).toMatchObject({ status: 0 });
        expect(check(goodPkg('volcano-watch', { dependencies: { a: '1' }, bundleDependencies: ['a'] }))).toMatchObject({ status: 0 });
      });

      test.each([
        ['private', { private: true }, '"private": true'],
        ['another repository', { repository: { type: 'git', url: 'https://github.com/someone/else.git', directory: 'addons/volcano-watch' } }, `"url": "https://github.com/${REPO}.git"`],
        ['no directory', { repository: { type: 'git', url: `https://github.com/${REPO}.git` } }, '"directory": "addons/volcano-watch"'],
        ['a string repository', { repository: `github:${REPO}` }, 'repository must be'],
        ['no files', { files: undefined }, 'files must list'],
        ['an empty files', { files: [] }, 'files must list'],
        ['no minVersion', { ngdpbase: { slug: 'volcano-watch' } }, 'ngdpbase.minVersion'],
        ['an old engines.node', { engines: { node: '>=24' } }, 'engines.node must be ">=24.15.0"'],
        ['no engines', { engines: undefined }, 'engines.node'],
        ['no license', { license: undefined }, 'license must be set'],
        ['an unbundled dependency', { dependencies: { a: '1', b: '1' }, bundleDependencies: ['a'] }, 'not bundled: b.']
      ])('refuses %s', (_label, over, message) => {
        const r = check(goodPkg('volcano-watch', over));
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('::error::');
        expect(r.out).toContain(message);
      });
    });

    describe('building against core', () => {
      test('an add-on importing ../../dist/ builds ngdpbase at its minVersion; one that does not, skips it', async () => {
        const { wf } = await load();
        const detect = step(wf, 'Does the add-on import ngdpbase core?');
        const env = { DIR: 'addons/volcano-watch' };

        const importing = makeRepo({ 'volcano-watch': { pkg: goodPkg(), files: { 'routes/api.ts': "import { ApiContext } from '../../../dist/src/context/ApiContext.js';\n" } } });
        expect(runStep(detect, importing, env).outputs).toEqual({ needed: 'true', version: '5.14.0' });

        const standalone = makeRepo({ 'volcano-watch': { pkg: goodPkg(), files: { 'index.js': 'export default {};\n', 'node_modules/x/index.js': "import '../../dist/x.js';\n" } } });
        expect(runStep(detect, standalone, env).outputs).toEqual({ needed: 'false' });

        // The scaffold's own add-on imports core.
        expect(runStep(detect, repoRoot(), env).outputs.needed).toBe('true');

        const build = step(wf, 'Build ngdpbase core at ngdpbase.minVersion');
        expect(build.if).toBe("steps.core.outputs.needed == 'true'");
        expect(build.env).toEqual({ VERSION: '${{ steps.core.outputs.version }}' });
        expect(build.run).toContain('git clone --depth 1 --branch "v$VERSION" https://github.com/jwilleke/ngdpbase.git "$RUNNER_TEMP/ngdpbase"');
        expect(build.run).toContain('npm ci\n');
        expect(build.run).toContain('npm run build\n');
        expect(build.run).toContain('ln -s "$RUNNER_TEMP/ngdpbase/dist" "$GITHUB_WORKSPACE/dist"');
      });
    });

    describe('the package ships no .ts sources or tests', () => {
      let packCheck: Step;
      beforeEach(async () => { packCheck = step((await load()).wf, 'The package ships no .ts sources or tests'); });
      const pack = (files: string[], present: Record<string, string>): { status: number | null; out: string } => {
        const root = makeRepo({ 'volcano-watch': { pkg: goodPkg('volcano-watch', { files }), files: present } });
        return runStep(packCheck, path.join(root, 'addons', 'volcano-watch'));
      };

      test('compiled .js and .d.ts pass', () => {
        const r = pack(['index.js', 'index.d.ts', 'pages/'], { 'index.js': '', 'index.d.ts': '', 'index.ts': '', 'pages/a.md': '' });
        expect(r.status).toBe(0);
        expect(r.out).toContain('@acme/volcano-watch-addon@0.1.0:');
      }, 30_000);

      test('a .ts source in the tarball is refused', () => {
        const r = pack(['index.js', 'index.ts'], { 'index.js': '', 'index.ts': '' });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('the package would ship sources or tests: index.ts');
      }, 30_000);

      test('__tests__ in the tarball is refused', () => {
        const r = pack(['*.js', '__tests__/'], { 'index.js': '', '__tests__/a.test.js': '' });
        expect(r.status).not.toBe(0);
        expect(r.out).toContain('__tests__/a.test.js');
      }, 30_000);
    });

    test('the README gives the safe bootstrap, the slug tag, and the site\'s install entry', async () => {
      await load();
      const readme = await fs.readFile(path.join(repoRoot(), 'README.md'), 'utf8');
      expect(readme).toContain('## Release it');
      const order = [
        '{ "name": "@acme/volcano-watch-addon", "version": "0.0.0" }',
        'placeholder, not installable',
        'npm publish --access public',
        'It is not deprecated.',
        '`npm trust`, which needs npm 11.15.0',
        'no `"private": true`',
        '"url": "https://github.com/<owner>/<repo>.git", "directory": "addons/volcano-watch"',
        'commit `package.json`\n  and `package-lock.json`',
        'git tag volcano-watch-v0.1.0\ngit push origin volcano-watch-v0.1.0'
      ].map(t => readme.indexOf(t));
      expect(order.every(i => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(readme).toContain('`git push origin volcano-watch-v0.2.0`');
      expect(readme).toContain('--update-publish');
      expect(readme).not.toContain('npm deprecate');
      const entry = /```json\n(\{\n {2}"ngdpbase\.addons\.install"[\s\S]*?)```/.exec(readme);
      expect(entry).not.toBeNull();
      expect(JSON.parse(entry![1])).toEqual({
        'ngdpbase.addons.install': {
          'volcano-watch': { package: '@acme/volcano-watch-addon', version: '^0.1.0', repository: 'github.com/<owner>/<repo>' }
        },
        'ngdpbase.addons.volcano-watch.enabled': true
      });
    });

    describe('--update-publish', () => {
      const file = (): string => path.join(repoRoot(), '.github', 'workflows', 'publish.yml');

      test('rewrites an older marker to the current version, keeping its plain-tags choice', async () => {
        await fs.outputFile(file(), "# ngdpbase-publish-workflow: 0\nenv:\n  NGDPBASE_PLAIN_TAGS: 'true'\n");
        expect(readPublishWorkflow(await fs.readFile(file(), 'utf8'))).toEqual({ version: 0, plainTags: true });
        const r = await updatePublishWorkflow(repoRoot());
        expect(r).toMatchObject({ from: 0, to: PUBLISH_WORKFLOW_VERSION, plainTags: true });
        expect(await fs.readFile(file(), 'utf8')).toBe(publishWorkflow({ plainTags: true }));
      });

      test('rewrites a version-1 file, which let a <slug>-v* release become Latest, to the current version', async () => {
        const v1 = publishWorkflow({}).replace(/: \d+\n/, ': 1\n').replace(' "$@" \\', ' \\');
        expect(v1).not.toContain('"$@"');
        await fs.outputFile(file(), v1);
        expect(await updatePublishWorkflow(repoRoot())).toMatchObject({ from: 1, to: PUBLISH_WORKFLOW_VERSION, plainTags: false });
        const now = await fs.readFile(file(), 'utf8');
        expect(now).toBe(publishWorkflow({}));
        expect(now).toContain('set -- --latest=false');
      });

      test('rewrites a version-2 file, whose release fetched the tarball back from npm, to the current version', async () => {
        const v2 = publishWorkflow({}).replace(/: \d+\n/, ': 2\n');
        await fs.outputFile(file(), v2);
        expect(await updatePublishWorkflow(repoRoot())).toMatchObject({ from: 2, to: PUBLISH_WORKFLOW_VERSION, plainTags: false });
        const now = await fs.readFile(file(), 'utf8');
        expect(now.split('\n')[0]).toBe(`# ngdpbase-publish-workflow: ${PUBLISH_WORKFLOW_VERSION}`);
        expect(now).toBe(publishWorkflow({}));
        expect(now).toContain('actions/download-artifact@v8');
        expect(now).not.toContain('npm pack "$SPEC"');
      });

      test('rewrites a version-3 file, which waited only 300 s for npm, to version 4 (#1987)', async () => {
        expect(PUBLISH_WORKFLOW_VERSION).toBe(4);
        const v3 = publishWorkflow({}).replace(/: \d+\n/, ': 3\n').replace("NPM_WAIT_SECONDS: '900'", "NPM_WAIT_SECONDS: '300'");
        await fs.outputFile(file(), v3);
        expect(await updatePublishWorkflow(repoRoot())).toMatchObject({ from: 3, to: 4, plainTags: false });
        const now = await fs.readFile(file(), 'utf8');
        expect(now).toBe(publishWorkflow({}));
        expect(now).toContain("NPM_WAIT_SECONDS: '900'");
      });

      test('keeps a default (slug-tag) file default, reads a pre-marker v* file as plain, and writes a missing one', async () => {
        await fs.outputFile(file(), publishWorkflow({}).replace(/: \d+\n/, ': 0\n'));
        expect(await updatePublishWorkflow(repoRoot())).toMatchObject({ from: 0, plainTags: false });
        expect(await fs.readFile(file(), 'utf8')).toBe(publishWorkflow({}));

        await fs.outputFile(file(), "name: Publish\non:\n  push:\n    tags: ['v*']\n");
        expect(await updatePublishWorkflow(repoRoot())).toMatchObject({ from: 0, plainTags: true });

        await fs.remove(file());
        expect(await updatePublishWorkflow(repoRoot())).toMatchObject({ from: null, plainTags: false });
        expect(await fs.readFile(file(), 'utf8')).toBe(publishWorkflow({}));
      });

      test('the CLI rewrites an existing repository\'s file and touches nothing else', async () => {
        await scaffoldAddon(opts({ repo: true, target: repoRoot(), scope: '@acme', plainTags: true }));
        await fs.writeFile(file(), "# ngdpbase-publish-workflow: 0\nenv:\n  NGDPBASE_PLAIN_TAGS: 'true'\n");
        const before = await readTree(repoRoot());
        const root = path.resolve(__dirname, '..', '..');
        const run = spawnSync(path.join(root, 'node_modules', '.bin', 'tsx'), [path.join(root, 'scripts', 'create-addon.ts'),
          '--update-publish', '--target', repoRoot()], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: tmp } });
        expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
        expect(run.stdout).toContain(`version 0 → ${PUBLISH_WORKFLOW_VERSION}`);
        const after = await readTree(repoRoot());
        const publishRel = path.join('.github', 'workflows', 'publish.yml');
        expect(after[publishRel]).toBe(publishWorkflow({ plainTags: true }));
        delete before[publishRel]; delete after[publishRel];
        expect(after).toEqual(before);
      }, 60_000);
    });

    test('a plain (non-repo) scaffold writes no workflow', async () => {
      const result = await scaffoldAddon(opts());
      expect(result.files.some(f => f.includes('.github'))).toBe(false);
    });
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
