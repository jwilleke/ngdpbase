/**
 * Every permission a view asks about must be one getCommonTemplateData()
 * resolves, or the control reads "not held" for everyone — #1525's
 * config-manage buttons were locked for an admin this way, caught only by E2E.
 */
import fs from 'node:fs';
import path from 'node:path';
import { VIEW_PERMISSIONS } from '../WikiRoutes';

const viewsDir = path.resolve(__dirname, '../../../views');

describe('view permissions (#1198, #1525)', () => {
  test('every can()/lockedUnless() permission in views is resolved for the render', () => {
    const used = new Set<string>();
    for (const file of fs.readdirSync(viewsDir).filter((f) => f.endsWith('.ejs'))) {
      const text = fs.readFileSync(path.join(viewsDir, file), 'utf8');
      for (const m of text.matchAll(/(?:\bcan|lockedUnless)\('([a-z]+(?:-[a-z]+)*)'\)/g)) used.add(m[1]);
    }
    // admin-read is resolved separately (canViewAdmin).
    used.delete('admin-read');
    const missing = [...used].filter((p) => !(VIEW_PERMISSIONS as readonly string[]).includes(p));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(0);
  });
});
