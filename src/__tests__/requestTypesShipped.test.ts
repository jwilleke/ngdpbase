/**
 * #1665 — the Request augmentation reaches every add-on that typechecks against dist/.
 *
 * It is a module (`src/types/express.ts`), so tsc emits its declaration, and
 * `ApiContext` imports it, so the emitted `ApiContext.d.ts` carries it. Its
 * `/// <reference types>` lines must keep `preserve="true"`, or tsc drops them
 * from the emitted file and `req.session` (declared by express-session's
 * types) disappears for the add-on. Type-level checks do not run in this
 * suite, so these guard the source that makes the emitted types right.
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('#1665 the Request augmentation ships with dist/', () => {
  test('it is a module tsc emits, not a hand-written .d.ts', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/types/express.ts'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'src/types/express.d.ts'))).toBe(false);
  });

  test('ApiContext imports it, so its emitted declaration carries it', () => {
    expect(read('src/context/ApiContext.ts')).toMatch(/^import '\.\.\/types\/express\.js';$/m);
  });

  test('its type references are preserved in the emitted file', () => {
    const src = read('src/types/express.ts');
    for (const pkg of ['express', 'express-session', 'multer']) {
      expect(src).toContain(`/// <reference types="${pkg}" preserve="true" />`);
    }
  });

  test('no bundled add-on includes src/types by hand any more', () => {
    for (const dir of fs.readdirSync(path.join(process.cwd(), 'addons'))) {
      const file = path.join(process.cwd(), 'addons', dir, 'tsconfig.json');
      if (fs.existsSync(file)) expect(fs.readFileSync(file, 'utf8'), dir).not.toContain('src/types/');
    }
  });
});
