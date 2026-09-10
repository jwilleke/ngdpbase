/**
 * #1126 — every ingestion path goes through NCM, provably.
 *
 * The spec's central claim — "any path that produces page content emits NCM"
 * — was prose until now. Same shape as the #1120 audit-emitter and #1000
 * showdown-guard scans: enumerate the content-producing entry points and
 * fail the build when one of them stops referencing the normalizer, or when
 * a transfer adopter drops the footnote funnel.
 *
 * The enumeration is DELIBERATE, not discovered: a brand-new ingestion path
 * will not appear here by itself — adding one means adding it to this list,
 * which is exactly the review moment the funnel needs. The editor /save path
 * is deliberately absent from the NCM conversion: an ordinary save runs only
 * the #1332 steps safe on save, at PageManager's door, and tells the author.
 *
 * #1332: the convert paths reach NCM through PageManager.convertPageToNcm,
 * never by calling the normalizer or the fix module themselves.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Extract the body of one method/function from a source string, crudely but stably. */
function region(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start);
  expect(end, `end marker not found after ${startMarker}: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('#1126 the NCM funnel covers every ingestion path', () => {
  const wikiRoutes = read('src/routes/WikiRoutes.ts');
  const importManager = read('src/managers/ImportManager.ts');
  const mcpServer = read('mcp-server.ts');
  const pageManager = read('src/managers/PageManager.ts');

  test('ImportManager.importPages normalizes registered text formats', () => {
    expect(importManager).toMatch(/normalizeToNcm\(content, formatId/);
  });

  test('agent ingest (POST /api/page/ingest) normalizes', () => {
    const ingest = region(wikiRoutes, 'async ingestPageMarkdown(', '\n  async ');
    expect(ingest).toContain('convertPageToNcm(');
  });

  test('the convert endpoints normalize', () => {
    const preview = region(wikiRoutes, 'async adminConvertPreview(', '\n  async ');
    const execute = region(wikiRoutes, 'async adminConvertExecute(', '\n  async ');
    expect(preview).toContain('convertPageToNcm(');
    expect(execute).toContain('convertPageToNcm(');
  });

  test('the MCP server normalizes create and update', () => {
    expect(mcpServer.match(/pageManager\.convertPageToNcm\(/g)).toHaveLength(2);
  });

  test('PageManager.convertPageToNcm runs the fix steps and the normalizer', () => {
    const convert = region(pageManager, '  convertPageToNcm(raw: string)', '\n  }\n');
    expect(convert).toContain("mode: 'convert'");
    expect(convert).toContain('normalizeExistingPageToNcm(');
  });

  test('no route or MCP tool calls the normalizer or the fix module directly (#1332)', () => {
    for (const source of [wikiRoutes, mcpServer]) {
      expect(source).not.toMatch(/normalizeExistingPageToNcm\(/);
      expect(source).not.toContain('converters/ncm/fix');
    }
  });
});

describe('#1126 the footnote transfer has one implementation and three adopters', () => {
  const wikiRoutes = read('src/routes/WikiRoutes.ts');
  const importManager = read('src/managers/ImportManager.ts');
  const footnoteManager = read('src/managers/FootnoteManager.ts');

  test('FootnoteManager owns transferFromContent', () => {
    expect(footnoteManager).toContain('async transferFromContent(');
  });

  test('convert, ingest, and import all delegate to it', () => {
    // The route helper (used by convert preview/execute AND ingest):
    expect(region(wikiRoutes, 'private async transferPageFootnotes(', '\n  private async convertEditContext'))
      .toContain('transferFromContent');
    const ingest = region(wikiRoutes, 'async ingestPageMarkdown(', '\n  async ');
    expect(ingest).toContain('transferPageFootnotes(');
    expect(importManager).toContain('transferFromContent(');
  });

  test('no second extraction loop grew outside the manager', () => {
    // extractFootnoteDefs may be called by FootnoteManager and by tests —
    // a route or import path calling it directly would be a second owner.
    expect(wikiRoutes).not.toContain('extractFootnoteDefs');
    expect(importManager).not.toContain('extractFootnoteDefs');
  });
});
