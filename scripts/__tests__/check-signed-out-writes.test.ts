import { checkApp, checkRouteFile, run } from '../check-signed-out-writes';

const GATE = '  app.use(signedOutWriteGate(engine));';

describe('check-signed-out-writes (#2298)', () => {
  test('the repository passes', () => {
    expect(run()).toEqual([]);
  });

  test('an app.ts without the gate fails', () => {
    expect(checkApp('app.use(x);')[0].detail).toMatch(/not registered/);
  });

  test('a route registered before the gate is named', () => {
    const src = ["app.post('/sneaky', h);", GATE, 'app.post(OUTSIDE_CALLBACK_PATH, r);', 'app.use(OIDC_MOUNT, m);'].join('\n');
    const v = checkApp(src);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ file: 'src/app.ts', line: 1 });
    expect(v[0].detail).toContain("app.post('/sneaky', h)");
  });

  test.each([
    ['app.use(zzRouter);'],
    ['app.use(zzMount, zzRouter);'],
    ['app\n  .post(\'/zz\', h);'],
    ['app?.put(\'/zz\', h);'],
    ['app.propfind(\'/zz\', h);'],
    ['app.route(\'/zz\').post(h);']
  ])('a pre-gate registration written as %s is named', (line) => {
    const src = [line, GATE, 'app.post(OUTSIDE_CALLBACK_PATH, r);', 'app.use(OIDC_MOUNT, m);'].join('\n');
    expect(checkApp(src).length).toBeGreaterThan(0);
  });

  test.each([
    ["apiRouter.post('/x', h);"],
    ["express.Router().post('/x', h);"],
    ["engine.app?.post('/x', h);"],
    ["router.search('/x', h);"]
  ])('a write route written as %s in an unknown file is named', (src) => {
    expect(checkRouteFile('src/newthing/Routes.ts', src)).toHaveLength(1);
  });

  test('the listed pre-gate registrations pass, and a stale entry is refused', () => {
    expect(checkApp(['app.use(OIDC_MOUNT, m);', 'app.post(OUTSIDE_CALLBACK_PATH, r);', GATE].join('\n'))).toEqual([]);
    expect(checkApp(GATE).map((v) => v.detail).join()).toMatch(/no longer registers/);
  });

  test('a write route in an unknown file is named, an add-on route module is not', () => {
    const src = "router.post('/x', h);\n";
    expect(checkRouteFile('src/newthing/Routes.ts', src)[0]).toMatchObject({ file: 'src/newthing/Routes.ts', line: 1 });
    expect(checkRouteFile('addons/forms/routes/api.ts', src)).toEqual([]);
    expect(checkRouteFile('src/routes/WikiRoutes.ts', src)).toEqual([]);
    expect(checkRouteFile('src/newthing/Routes.ts', "// router.post('/x', h);\n")).toEqual([]);
  });
});
