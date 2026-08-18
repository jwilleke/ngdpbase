/**
 * #1064 — no showdown Converter may enable the options that turn two known
 * stored-XSS advisories into live vulnerabilities.
 *
 * showdown is a direct dependency, effectively abandoned (last release
 * 2023-07-31), and `npm audit` reports three advisories with `fixAvailable:
 * false` against every published version:
 *
 *   - GHSA-22g5-r2x5-97cx — stored XSS via table header ID. `parseHeaders`
 *     emits an unescaped `id="..."` built from the header text, but only when
 *     `tablesHeaderId` (alias `tableHeaderId`) is on. It defaults off.
 *   - GHSA-cr32-g25g-vxjj — XSS via metadata title. Needs `metadata` AND
 *     `completeHTMLDocument`, both defaulting off.
 *   - GHSA-rmmh-p597-ppvv — ReDoS, mitigated by guardShowdownInput (#599),
 *     coverage pinned by showdownGuardCoverage.test.ts (#1000).
 *
 * Neither XSS is exploitable today: none of the converter constructions in
 * src/ enables any of those options, and `setFlavor('github')` — which sets
 * `tablesHeaderId: true` — appears nowhere. That safety is an invariant
 * defended only by nobody happening to want table header anchors. Someone
 * adding `tablesHeaderId: true` for section links to tables — a
 * reasonable-looking change, since `ghHeaderIds` is already on for exactly
 * that reason on headings — turns a rendered wiki page into stored XSS with
 * nothing going red. This scan is the part that would notice.
 */
import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');

/**
 * The options whose enablement makes a published advisory reachable. Any value
 * other than a literal `false` fails — a computed value (`metadata: cfg.x`)
 * cannot be proven safe by reading the line.
 */
const FORBIDDEN_OPTIONS = ['tablesHeaderId', 'tableHeaderId', 'metadata', 'completeHTMLDocument'];

const ADVISORY_FOR: Record<string, string> = {
  tablesHeaderId: 'GHSA-22g5-r2x5-97cx (stored XSS: unescaped id="..." from table header text)',
  tableHeaderId: 'GHSA-22g5-r2x5-97cx (stored XSS: unescaped id="..." from table header text — legacy alias)',
  metadata: 'GHSA-cr32-g25g-vxjj (XSS via metadata title, with completeHTMLDocument)',
  completeHTMLDocument: 'GHSA-cr32-g25g-vxjj (XSS via metadata title, with metadata)'
};

/** Every .ts file under src/, excluding test files. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Comment lines are not call sites. */
function isProse(line: string): boolean {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

interface Construction { file: string; line: number; args: string }

const CONSTRUCTOR = /new\s+[Ss]howdown\.Converter\s*\(|new\s+Converter\s*\(/g;

/**
 * Every Converter construction in src/, with the full text of its argument
 * list — the constructor spans multiple lines at every real call site, so this
 * walks the source from the opening paren to its match rather than trusting
 * one line.
 */
function findConstructions(): Construction[] {
  const out: Construction[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    CONSTRUCTOR.lastIndex = 0;
    for (let m = CONSTRUCTOR.exec(text); m !== null; m = CONSTRUCTOR.exec(text)) {
      const open = text.indexOf('(', m.index + m[0].length - 1);
      let depth = 1;
      let i = open + 1;
      while (i < text.length && depth > 0) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')') depth--;
        i++;
      }
      out.push({
        file: path.relative(SRC, file),
        line: text.slice(0, m.index).split('\n').length,
        args: text.slice(open + 1, i - 1)
      });
    }
  }
  return out;
}

describe('#1064 — showdown converter options keep the XSS advisories unreachable', () => {
  test('the scan actually finds converter constructions (guards against a broken matcher)', () => {
    // A regex that silently matched nothing would make every assertion below
    // pass vacuously — the near-miss the #1058 write-up documents.
    expect(findConstructions().length).toBeGreaterThanOrEqual(4);
  });

  test('the known construction sites are all present', () => {
    const files = new Set(findConstructions().map(c => c.file));
    for (const expected of [
      'parsers/MarkupParser.ts',
      'context/WikiContext.ts',
      'managers/RenderingManager.ts',
      'extensions/showdown-footnotes-fixed.ts'
    ]) {
      expect(files, `expected a Converter construction in ${expected}`).toContain(expected);
    }
  });

  test('no construction enables an advisory-triggering option', () => {
    const violations: string[] = [];
    for (const c of findConstructions()) {
      for (const opt of FORBIDDEN_OPTIONS) {
        const set = new RegExp(`\\b${opt}\\s*:(?!\\s*false\\b)`);
        if (set.test(c.args)) {
          violations.push(`  ${c.file}:${c.line}  sets ${opt} — enables ${ADVISORY_FOR[opt]}`);
        }
      }
    }
    expect(
      violations,
      'Converter option makes a published showdown advisory exploitable (#1064). ' +
      'showdown has no fixed version; the option staying off is the mitigation. ' +
      'If you need the feature, sanitize the output first and update this test with why:\n' +
      violations.join('\n')
    ).toEqual([]);
  });

  test('no setOption() call enables an advisory-triggering option', () => {
    const violations: string[] = [];
    const pattern = new RegExp(`setOption\\s*\\(\\s*['"\`](${FORBIDDEN_OPTIONS.join('|')})['"\`]`);
    for (const file of sourceFiles(SRC)) {
      readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
        const m = pattern.exec(text);
        if (m && !isProse(text)) {
          violations.push(`  ${path.relative(SRC, file)}:${i + 1}  sets ${m[1]} — enables ${ADVISORY_FOR[m[1]]}`);
        }
      });
    }
    expect(
      violations,
      'setOption() reaches the same advisory-triggering options as the constructor (#1064):\n' +
      violations.join('\n')
    ).toEqual([]);
  });

  test('setFlavor() appears nowhere', () => {
    // The table-header-ID advisory reproduces "with the default github flavor
    // configuration" — setFlavor('github') sets tablesHeaderId: true without
    // the option ever appearing in this repo's source.
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
        if (text.includes('setFlavor(') && !isProse(text)) {
          hits.push(`  ${path.relative(SRC, file)}:${i + 1}  ${text.trim()}`);
        }
      });
    }
    expect(
      hits,
      "setFlavor() silently enables tablesHeaderId ('github' flavor) — " +
      'GHSA-22g5-r2x5-97cx becomes reachable (#1064). Set options explicitly instead:\n' +
      hits.join('\n')
    ).toEqual([]);
  });
});
