/**
 * #1508 — the shipped default config carries no `ngdpbase.storageLocation.*` keys.
 *
 * That block keyed storage by role and by capitalised category names, with the
 * old `regular` / `required` words. Nothing read it, and it contradicted the
 * category design in docs/system-category.md, where a category's own
 * `storageLocation` says where its pages live. One declaration, on the category.
 */
import fs from 'fs';
import path from 'path';

const SHIPPED_CONFIG = path.join(process.cwd(), 'config', 'app-default-config.json');

describe('app-default-config.json (#1508)', () => {
  test('has no ngdpbase.storageLocation.* keys', () => {
    const config = JSON.parse(fs.readFileSync(SHIPPED_CONFIG, 'utf8')) as Record<string, unknown>;
    const stray = Object.keys(config).filter((k) => k.startsWith('ngdpbase.storageLocation.') || k === '_comment_storageLocation');
    expect(stray).toEqual([]);
  });
});
