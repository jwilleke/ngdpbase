/**
 * #1052 — every view that calls a helper from `getCommonTemplateData()` must be
 * rendered by a route that actually supplies it.
 *
 * `/admin/keywords` 500'd with `lockedUnless is not defined` because
 * `adminKeywords` rendered without the common data. Nothing caught it: no test
 * renders an EJS admin view, so a template referencing an absent helper is a
 * pure runtime failure, and it reaches the operator rather than CI.
 *
 * This is a static invariant rather than a render test on purpose — rendering
 * ten admin views would need ten sets of manager mocks, and would still only
 * cover the views someone remembered to add.
 *
 * The scan walks BACKWARDS from each `res.render('<view>'` to its enclosing
 * method, rather than looking a fixed number of lines up. That distinction is
 * not academic: a fixed 140-line window reported `admin-dashboard` as broken
 * during triage of #1052 when its `getCommonTemplateData` call sits 206 lines
 * above the render.
 */
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const ROUTES = path.join(ROOT, 'src/routes/WikiRoutes.ts');
const VIEWS_DIR = path.join(ROOT, 'views');

/** Helpers that only exist on the payload built by getCommonTemplateData(). */
const COMMON_ONLY_HELPERS = ['lockedUnless'];

/** Views that reference at least one of those helpers. */
function viewsNeedingCommonData(): string[] {
  return fs.readdirSync(VIEWS_DIR)
    .filter((f) => f.endsWith('.ejs'))
    .filter((f) => {
      const src = fs.readFileSync(path.join(VIEWS_DIR, f), 'utf8');
      return COMMON_ONLY_HELPERS.some((h) => src.includes(`${h}(`));
    })
    .map((f) => f.replace(/\.ejs$/, ''));
}

const routeSrc = fs.readFileSync(ROUTES, 'utf8').split('\n');

/** Line index of the method enclosing `line`, or -1. */
function enclosingMethodStart(line: number): number {
  for (let i = line; i >= 0; i--) {
    if (/^\s{2}(?:private\s+|public\s+)?(?:async\s+)?[A-Za-z_][\w]*\s*\(/.test(routeSrc[i])
      && !/^\s*(if|for|while|switch|catch|return)\b/.test(routeSrc[i].trim())) {
      return i;
    }
  }
  return -1;
}

/**
 * Every place WikiRoutes renders `view`, with whether the enclosing method
 * resolves the common template data.
 */
function rendersOf(view: string): Array<{ line: number; hasCommon: boolean }> {
  const out: Array<{ line: number; hasCommon: boolean }> = [];
  routeSrc.forEach((text, i) => {
    if (!text.includes(`res.render('${view}'`) && !text.includes(`render('${view}'`)) return;
    const start = enclosingMethodStart(i);
    if (start < 0) return;
    const body = routeSrc.slice(start, i + 1).join('\n');
    out.push({ line: i + 1, hasCommon: body.includes('getCommonTemplateData') });
  });
  return out;
}

describe('#1052 — views using common-data helpers get the common data', () => {
  test('the scan finds views to check (guards against a silently empty suite)', () => {
    // Without this, a broken glob would make every assertion below vacuous.
    const views = viewsNeedingCommonData();
    expect(views.length).toBeGreaterThan(5);
    expect(views).toContain('admin-keywords');
  });

  test('admin-keywords supplies it — the exact #1052 regression', () => {
    const renders = rendersOf('admin-keywords');
    expect(renders.length).toBeGreaterThan(0);
    for (const r of renders) {
      expect(r.hasCommon, `WikiRoutes.ts:${r.line} renders admin-keywords without getCommonTemplateData`).toBe(true);
    }
  });

  test('every view calling lockedUnless is rendered with the common data', () => {
    const offenders: string[] = [];
    for (const view of viewsNeedingCommonData()) {
      for (const r of rendersOf(view)) {
        if (!r.hasCommon) offenders.push(`${view} (WikiRoutes.ts:${r.line})`);
      }
    }
    expect(offenders, `these renders would throw "lockedUnless is not defined":\n  ${offenders.join('\n  ')}`)
      .toEqual([]);
  });

  test('admin-dashboard is NOT flagged — its call is far above the render', () => {
    // Pinned because a naive fixed-window check called this broken during
    // #1052 triage. The enclosing-method walk is what makes it correct.
    const renders = rendersOf('admin-dashboard');
    expect(renders.length).toBeGreaterThan(0);
    expect(renders.every((r) => r.hasCommon)).toBe(true);
  });
});
