/**
 * #1241 (#1177) — the permission-subject guard covers addons.
 *
 * `scripts/check-permission-subject.ts` (`npm run lint:permission-subject`,
 * on the pre-commit hook) refuses a subject rebuilt from fields — the #1173
 * defect, a three-field object that type-checks and carries no viaToken. It
 * scanned src/ only. This runs it under vitest so a rebuild that creeps back
 * anywhere fails the suite as well as the hook, and asserts the scope with a
 * temp repo rather than trusting the success line.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { collectSources, run } from '../../scripts/check-permission-subject';

describe('#1241 — addon routes are inside the permission-subject guard', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-subject-guard-'));
    const put = (rel: string, body: string) => fs.outputFile(path.join(repo, rel), body);
    // The #1173 shape, in an addon route: a subject rebuilt from a name.
    await put('addons/one/routes/api.ts', "const ok = await um.hasPermission({ username: name, roles: ['editor'], isAuthenticated: true }, 'page-edit');");
    // The #1181 shape, in an addon manager: an identity invented and handed on as an option.
    await put('addons/one/managers/Thing.ts', "await upload(buf, info, { context: { username: author, isAuthenticated: true, roles: ['admin'] } });");
    // What an addon should do: forward the context it was given.
    await put('addons/two/routes/api.ts', "await ctx.requirePermission('two-manage'); const v = await um.hasPermission(ctx.subject, 'page-read');");
    // A view-model is not a principal — no authentication or roles asserted.
    await put('addons/two/routes/reservations.ts', 'const viewer = { username: ctx.username ?? undefined, isAuthenticated: ctx.isAuthenticated, canManage: false };');
    // Compiled output, tests and browser files are not source.
    await put('addons/one/dist/api.ts', "um.hasPermission({ username: 'x', roles: [], isAuthenticated: true }, 'p');");
    await put('addons/one/__tests__/api.test.ts', "um.hasPermission({ username: 'x', roles: [], isAuthenticated: true }, 'p');");
    await put('addons/one/public/app.ts', "um.hasPermission({ username: 'x', roles: [], isAuthenticated: true }, 'p');");
  });

  afterEach(async () => {
    // This test's own temp dir only — never a live data tree.
    await fs.remove(repo);
  });

  test('a rebuilt or invented subject in an addon route or manager is reported', () => {
    const files = run(repo).map((v) => v.file).sort();
    expect(files).toEqual([
      path.join('addons', 'one', 'managers', 'Thing.ts'),
      path.join('addons', 'one', 'routes', 'api.ts')
    ]);
  });

  test('a forwarded context and a view-model are not; dist, tests and public are not read', () => {
    const seen = collectSources(repo);
    expect(seen).toContain(path.join('addons', 'two', 'routes', 'api.ts'));
    expect(seen.some((f) => f.includes(`${path.sep}dist${path.sep}`))).toBe(false);
    expect(seen.some((f) => f.includes('__tests__'))).toBe(false);
    expect(seen.some((f) => f.includes(`${path.sep}public${path.sep}`))).toBe(false);
  });

  test('the real tree: the scan reaches the bundled addons and reports nothing', () => {
    const seen = collectSources();
    expect(seen).toContain(path.join('addons', 'calendar', 'routes', 'api.ts'));
    expect(seen).toContain(path.join('addons', 'forms', 'index.ts'));
    expect(run().map((v) => `${v.file}:${v.line} ${v.detail}`)).toEqual([]);
  });
});
