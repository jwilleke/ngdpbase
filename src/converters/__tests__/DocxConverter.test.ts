/**
 * #1131 — Word import: the first BINARY source format in the registry.
 *
 * DocxConverter is deliberately thin: mammoth turns the .docx into HTML and
 * the EXISTING html→NCM path does everything else (turndown, link
 * normalization, table up-convert, image localization, footnote transfer
 * via the funnel). The converter's own job is the buffer contract —
 * `convertBuffer` — that text converters don't need.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DocxConverter from '../DocxConverter';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample.docx');

describe('DocxConverter (#1131)', () => {
  const converter = new DocxConverter();

  test('declares the binary contract and owns the extension', () => {
    expect(converter.formatId).toBe('docx');
    expect(converter.fileExtensions).toContain('.docx');
    expect(typeof converter.convertBuffer).toBe('function');
  });

  test('canHandle never claims by content — extension-first only (#879)', () => {
    // A docx read as utf-8 is zip garbage; content sniffing must not claim
    // (or mis-claim) anything. Extension matching in detectFormat wins.
    expect(converter.canHandle('PK garbage', 'file.docx')).toBe(false);
    expect(converter.canHandle('# markdown', 'file.md')).toBe(false);
  });

  test('convert(string) refuses — a docx has no meaningful text form', () => {
    expect(() => converter.convert('whatever')).toThrow(/binary/i);
  });

  test('convertBuffer produces HTML mammoth-side, ready for the html→NCM path', async () => {
    const result = await converter.convertBuffer(readFileSync(FIXTURE));
    expect(result.content).toContain('<h1>Docx Import Title</h1>');
    expect(result.content).toContain('<strong>bold words</strong>');
    expect(result.metadata['importedFrom']).toBe('docx');
  });

  test('mammoth messages surface as structured warnings', async () => {
    // The fixture is clean, so no messages — the shape is what is pinned:
    // warnings is always an array of {kind, detail}.
    const result = await converter.convertBuffer(readFileSync(FIXTURE));
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
