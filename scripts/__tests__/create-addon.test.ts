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
import matter from 'gray-matter';
import { validate as validateUuid, version as uuidVersion } from 'uuid';

import {
  scaffoldAddon,
  parseArgs,
  validateSlug,
  toPascalCase,
  toTitleCase,
  SLUG_PATTERN,
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
      '--plugins', 'A,B', '--managers', 'C', '--target', '/tmp/x'
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
});

describe('generated addon', () => {
  test('package.json carries the authoritative ngdpbase manifest block', async () => {
    await scaffoldAddon(opts());
    const pkg = await fs.readJson(path.join(tmp, 'volcano-watch', 'package.json'));
    expect(pkg.ngdpbase).toEqual({ slug: 'volcano-watch', type: 'additive' });
    expect(pkg.type).toBe('module');
    expect(pkg.name).toBe('@ngdpbase/volcano-watch');
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
    // Addon help pages are documentation per addons.md §9 — addon-owned.
    expect(data['system-category']).toBe('documentation');
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

  test('reports every file it wrote', async () => {
    const result = await scaffoldAddon(opts());
    for (const rel of result.files) {
      expect(await fs.pathExists(path.join(tmp, 'volcano-watch', rel))).toBe(true);
    }
    expect(result.files).toContain('index.ts');
    expect(result.files).toContain('package.json');
  });
});
