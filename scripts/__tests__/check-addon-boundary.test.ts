/**
 * #1813 — no add-on runtime file value-imports core's compiled `dist/`.
 *
 * The guard is `scripts/check-addon-boundary.ts` (`npm run lint:addons`, on
 * the pre-commit hook). Run here over this repository, it must report
 * nothing; run over a planted tree, it must name every value import of
 * `dist/` and nothing else: a type import is erased, and a test may build
 * core's own values.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../check-addon-boundary';

describe('#1813 lint:addons — add-ons reach core through the host, not ../../dist', () => {
  test('this repository has no finding', () => {
    expect(scan().findings.map((f) => `${f.file}:${f.line} ${f.detail}`)).toEqual([]);
  });

  describe('a planted add-on', () => {
    let root: string;

    const plant = (rel: string, text: string): void => {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    };

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-boundary-'));
      plant('src/utils/logger.ts', 'export default {};\n');
      plant('dist/src/utils/logger.js', 'export default {};\n');
      plant('addons/planted/index.ts', [
        "import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';",
        "import logger from '../../dist/src/utils/logger.js';",
        'export default { name: "planted", register(_e: WikiEngine) { logger; } };',
        ''
      ].join('\n'));
      plant('addons/planted/routes/api.ts', [
        'import {',
        '  ApiContext,',
        '  type ApiError',
        "} from '../../../dist/src/context/ApiContext.js';",
        "export const later = () => import('../../../dist/src/http/guardedFetch.js');",
        "export const old = () => require('../../../dist/src/utils/version.js');",
        'export { ApiContext };',
        ''
      ].join('\n'));
      plant('addons/planted/__tests__/index.test.ts', "import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';\n");
      plant('addons/planted/thing.test.ts', "import logger from '../../dist/src/utils/logger.js';\n");
    });

    // Only this test's own temporary folder; never a data/ directory.
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    test('every runtime value import of dist/ is a finding; type imports and tests are not', () => {
      const found = scan(root).findings.map((f) => `${f.file}:${f.line}`).sort();
      expect(found).toEqual([
        'addons/planted/index.ts:2',
        'addons/planted/routes/api.ts:1',
        'addons/planted/routes/api.ts:5',
        'addons/planted/routes/api.ts:6'
      ]);
    });

    test('the finding sends the author to the host', () => {
      const [first] = scan(root).findings;
      expect(first.detail).toMatch(/#1813/);
      expect(first.detail).toMatch(/host/);
      expect(first.detail).toMatch(/import type/);
    });
  });
});
