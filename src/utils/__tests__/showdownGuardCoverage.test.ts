/**
 * @file showdownGuardCoverage.test.ts
 * @description #1000 — every `makeHtml()` call site must pass guarded input.
 *
 * #599 shipped `guardShowdownInput()` and wired it into the primary render
 * path, but three other call sites kept handing showdown raw text:
 *
 *   src/parsers/MarkupParser.ts        the parser-disabled fallback
 *   src/context/WikiContext.ts         the no-parser fallback
 *   src/extensions/showdown-footnotes-fixed.ts   a SEPARATE Converter instance
 *
 * All three are degraded or nested paths, which is exactly why nobody looked at
 * them — but `POST /api/preview` takes an arbitrary request body, has no auth
 * middleware, and routes into `renderMarkdown`, so a fallback path is as
 * exposed as the primary one. Unguarded, a 12 KB body blocks the event loop for
 * 16 seconds (CVE-2024-1899, no upstream patch).
 *
 * A per-call-site unit test would not have caught this: the defect was a call
 * site nobody thought to test. So this scans the source instead and fails on
 * any `.makeHtml(` whose argument does not visibly name the guard. Adding a new
 * converter call without guarding it breaks the build.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

/** Comment lines and interface declarations are not call sites. */
function isProse(line: string): boolean {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

interface CallSite { file: string; line: number; text: string }

function findMakeHtmlCalls(): CallSite[] {
  const out: CallSite[] = [];
  for (const file of sourceFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
      // The leading dot excludes the `makeHtml(content: string): string;`
      // interface member in MarkupParser.
      if (text.includes('.makeHtml(') && !isProse(text)) {
        out.push({ file: path.relative(SRC, file), line: i + 1, text: text.trim() });
      }
    });
  }
  return out;
}

/**
 * The argument must visibly name the guard — either `guardShowdownInput(...)`
 * inline, or a variable whose name says it is guarded (MarkupParser assigns
 * `const guarded = guardShowdownInput(preprocessed)` a few lines above its two
 * calls). Naming, not dataflow: a reviewer can see it, and it cannot silently
 * regress into an unguarded local.
 */
function looksGuarded(text: string): boolean {
  const arg = text.slice(text.indexOf('.makeHtml(') + '.makeHtml('.length);
  return /guardShowdownInput\s*\(/.test(arg) || /\bguarded\b/.test(arg);
}

describe('#1000 — showdown guard coverage', () => {
  test('the scan actually finds call sites (guards against a broken matcher)', () => {
    // A regex that silently matched nothing would make every assertion below
    // pass vacuously — the failure mode this whole file exists to prevent.
    expect(findMakeHtmlCalls().length).toBeGreaterThanOrEqual(4);
  });

  test('every makeHtml() call site passes guarded input', () => {
    const unguarded = findMakeHtmlCalls().filter(c => !looksGuarded(c.text));
    const detail = unguarded.map(c => `  ${c.file}:${c.line}  ${c.text}`).join('\n');
    expect(unguarded, `Unguarded showdown call site(s) — wrap the argument in guardShowdownInput() (#1000):\n${detail}`).toEqual([]);
  });

  test('the known call sites are all present and guarded', () => {
    const files = new Set(findMakeHtmlCalls().map(c => c.file));
    for (const expected of [
      'parsers/MarkupParser.ts',
      'context/WikiContext.ts',
      'managers/RenderingManager.ts',
      'extensions/showdown-footnotes-fixed.ts'
    ]) {
      expect(files, `expected a makeHtml call in ${expected}`).toContain(expected);
    }
  });
});
