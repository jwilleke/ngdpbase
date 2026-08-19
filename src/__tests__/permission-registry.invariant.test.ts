/**
 * #1058 — the permission registry and the enforcement points must agree.
 *
 * These are two lists that must match and nothing compared them. Each direction
 * fails differently and both look fine from the outside:
 *
 *   - An ORPHAN permission is declared but never checked. It renders on the
 *     admin roles screen, an operator grants it believing it grants something,
 *     and it protects nothing. FAILS OPEN.
 *   - A MISSPELLED check names a permission the registry does not define, so
 *     nobody holds it and the check denies everyone. FAILS CLOSED, which looks
 *     like working security until someone reports they cannot do their job.
 *
 * The registry's own shape is why this is worth guarding: each entry carries
 * `icon` and `color`, because its day job is rendering an admin screen, while
 * enforcement lives at call sites scattered across `src/`.
 *
 * ## What counts as "enforced"
 *
 * Appearing in the source is NOT enough, and assuming otherwise is how a first
 * pass at this check reported zero orphans. `UserManager` registers a
 * human-readable description for every permission
 * (`this.permissions.set('asset-delete', 'Delete assets')`), so a naive
 * substring scan finds every permission "used" and passes vacuously.
 *
 * A permission is enforced when it is passed to a permission check or mapped to
 * one from an action name — see ENFORCEMENT_PATTERNS below.
 */
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const CONFIG = path.join(ROOT, 'config/app-default-config.json');

/**
 * Call shapes that actually gate behaviour. A permission reaching one of these
 * is enforced; a permission that only appears in a description map is not.
 */
const ENFORCEMENT_PATTERNS: RegExp[] = [
  /\bhasPermission\(\s*'([^']+)'/g,
  /\bcheckPermission\(\s*'([^']+)'/g,
  /\brequirePermission\(\s*'([^']+)'/g,
  /\bcheckPagePermission\w*\(\s*'([^']+)'/g
];

/**
 * ACLManager translates a legacy action name to a permission via an
 * `actionMap`, so a permission reachable only that way is still enforced.
 *
 * Matched by locating the map and reading its values, NOT by a general
 * "property whose value looks hyphenated" regex. The loose version matched
 * `kind: 'converter-note'`, `context: 'cross-page-check'` and
 * `kind: 'import-conflict'` — three object properties with nothing to do with
 * permissions — and would have reported them as checks against an undefined
 * permission. A drift test that invents its own drift teaches people to
 * ignore it.
 */
const ACTION_MAP_BLOCK = /const actionMap[^=]*=\s*\{([\s\S]*?)\};/;

/**
 * Known, deliberate divergences. Each needs a reason and an issue, so the list
 * cannot quietly become a place to hide new drift.
 */
const KNOWN_UNENFORCED: Record<string, string> = {
  // `page-export` is here for a reason worth reading before "fixing" it.
  //
  // Chasing it as an orphan found #1060: the export routes had no
  // authorization check at all, so a private page was extractable by anyone
  // who could name it. That is now gated on READ access — the same gate the
  // view route uses.
  //
  // `page-export` itself was deliberately NOT made the gate. For a page the
  // caller can already read, exporting returns words they are looking at on
  // screen, so requiring a second permission is friction rather than
  // protection. The read/export split would earn its keep against a bulk
  // surface — `ExportManager.exportPagesToHtml` and `exportToMarkdown` both
  // take arrays — but no route reaches either today. Enforce it on the bulk
  // route when one is built, on the act that is actually different.
  //
  // The other three #1059 orphans (asset-read, asset-delete, search-page) were
  // enforced in #1059: AttachmentManager.checkPermission became a real
  // UserManager.hasPermission check, asset-read gates attachment serve/thumb,
  // and search-page gates the search surfaces.
  'page-export': 'ngdpbase#1059'
};

/**
 * Names that reach a check but are not permissions. These are real call sites
 * passing a role or a legacy vocabulary; recorded rather than silently allowed.
 * Currently empty — the `attachment:upload` / `attachment:delete` strings that
 * used to live here became real registry permissions in #1059.
 */
const KNOWN_NON_PERMISSION_CHECKS: Record<string, string> = {};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function registryPermissions(): string[] {
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) as Record<string, unknown>;
  const defs = config['ngdpbase.permissions.definitions'] as Record<string, unknown> | undefined;
  return Object.keys(defs ?? {});
}

/** Every string reaching an enforcement call site across `src/`. */
function enforcedNames(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of ENFORCEMENT_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) found.add(m[1]);
    }

    const actionMap = ACTION_MAP_BLOCK.exec(text);
    if (actionMap) {
      const values = actionMap[1].matchAll(/:\s*'([^']+)'/g);
      for (const v of values) found.add(v[1]);
    }
  }
  return found;
}

describe('#1058 — permission registry vs enforcement points', () => {
  const registry = registryPermissions();
  const enforced = enforcedNames();

  // Without these, a regex that matches nothing makes every assertion below
  // pass while testing nothing — the failure mode this whole file exists to
  // prevent, applied to itself.
  describe('the scan actually found something', () => {
    test('the registry is non-trivial', () => {
      expect(registry.length).toBeGreaterThan(10);
      expect(registry).toContain('page-read');
    });

    test('the enforcement scan found real call sites', () => {
      expect(enforced.size).toBeGreaterThan(5);
      expect(enforced.has('page-read')).toBe(true);
    });
  });

  test('every registry permission is enforced somewhere', () => {
    // Fails OPEN: a permission an operator can grant that gates nothing.
    const orphans = registry
      .filter((p) => !enforced.has(p))
      .filter((p) => !(p in KNOWN_UNENFORCED));

    expect(orphans, `declared in the registry but reaching no permission check:\n  ${orphans.join('\n  ')}`)
      .toEqual([]);
  });

  test('every enforced name exists in the registry', () => {
    // Fails CLOSED: nobody holds a permission that is not defined, so the
    // check denies everyone — and looks like working security.
    const unknown = [...enforced]
      .filter((name) => !registry.includes(name))
      .filter((name) => !(name in KNOWN_NON_PERMISSION_CHECKS))
      // Roles and page names also reach `hasPermission` in a few places; the
      // registry format is the discriminator.
      .filter((name) => /^[a-z]+-[a-z-]+$/.test(name));

    expect(unknown, `checked in code but absent from the registry:\n  ${unknown.join('\n  ')}`)
      .toEqual([]);
  });

  test('every known exception carries an issue reference', () => {
    // Stops the exception lists becoming a place to park new drift.
    for (const [name, ref] of Object.entries({ ...KNOWN_UNENFORCED, ...KNOWN_NON_PERMISSION_CHECKS })) {
      expect(ref, `${name} is excepted without an issue reference`).toMatch(/#\d+/);
    }
  });

  test('registry names use the {target}-{action} format', () => {
    const malformed = registry.filter((p) => !/^[a-z]+-[a-z-]+$/.test(p));
    expect(malformed, `not {target}-{action}:\n  ${malformed.join('\n  ')}`).toEqual([]);
  });
});
