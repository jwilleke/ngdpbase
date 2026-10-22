/**
 * #1974 — the PDF engine's pure parts: options, finding Chromium, the
 * request filter, the child's environment, and deterministic bytes.
 * A real render is in pdfEngine.integration.test.ts.
 */
import crypto from 'node:crypto';
import { PDFDocument, PDFHexString } from 'pdf-lib';
import { childEnv, resolveChromium, resolvePdfOptions, SYSTEM_CHROMIUM_PATHS } from '../pdfEngine';
import { isAllowedPdfRequest, normalizePdf, PDF_PRODUCER } from '../pdfNormalize';

const sha256 = (b: Uint8Array): string => crypto.createHash('sha256').update(b).digest('hex');

describe('resolvePdfOptions', () => {
  test('defaults: the configured page size, no margins, backgrounds printed', () => {
    expect(resolvePdfOptions(undefined, 'Letter')).toEqual({ format: 'Letter', margin: {}, printBackground: true });
  });

  test('the caller\'s format, margins and printBackground are kept', () => {
    expect(resolvePdfOptions({ format: 'A4', margin: { top: '20mm', left: '0.5in' }, printBackground: false }, 'Letter'))
      .toEqual({ format: 'A4', margin: { top: '20mm', left: '0.5in' }, printBackground: false });
  });

  test('an unknown page size is refused, not silently replaced', () => {
    expect(() => resolvePdfOptions({ format: 'Napkin' as never }, 'Letter')).toThrow(/format must be one of/);
    expect(() => resolvePdfOptions(undefined, 'Napkin')).toThrow(/format must be one of/);
  });

  test('a margin that is not a length is refused', () => {
    expect(() => resolvePdfOptions({ margin: { top: '20' } }, 'Letter')).toThrow(/margin.top/);
    expect(() => resolvePdfOptions({ margin: { bottom: '1em' } }, 'Letter')).toThrow(/margin.bottom/);
    expect(() => resolvePdfOptions({ margin: { right: 5 as never } }, 'Letter')).toThrow(/margin.right/);
  });

  test('printBackground must be a boolean', () => {
    expect(() => resolvePdfOptions({ printBackground: 'yes' as never }, 'Letter')).toThrow(/printBackground/);
  });
});

describe('resolveChromium', () => {
  const none = (): boolean => false;
  const installed = (): boolean => true;

  test('without playwright-core the engine is unavailable, and says why', async () => {
    const r = await resolveChromium('', { playwrightInstalled: none });
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/playwright-core is not installed/) });
  });

  test('a configured path is used when it exists', async () => {
    const r = await resolveChromium('/opt/chrome', { playwrightInstalled: installed, exists: (p) => p === '/opt/chrome' });
    expect(r).toEqual({ ok: true, executablePath: '/opt/chrome', source: 'configured' });
  });

  test('a configured path that is missing is unavailable — no quiet fallback to another browser', async () => {
    const r = await resolveChromium('/opt/missing', {
      playwrightInstalled: installed,
      exists: (p) => p !== '/opt/missing',
      playwrightChromium: async () => '/pw/chrome'
    });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('/opt/missing') });
  });

  test('Playwright\'s own Chromium comes before the system locations', async () => {
    const r = await resolveChromium('', { playwrightInstalled: installed, platform: 'linux', exists: () => true, playwrightChromium: async () => '/pw/chrome' });
    expect(r).toEqual({ ok: true, executablePath: '/pw/chrome', source: 'playwright' });
  });

  test('then the system locations, in order', async () => {
    const r = await resolveChromium('', {
      playwrightInstalled: installed,
      platform: 'linux',
      exists: (p) => p === '/usr/bin/google-chrome',
      playwrightChromium: async () => '/pw/not-downloaded'
    });
    expect(r).toEqual({ ok: true, executablePath: '/usr/bin/google-chrome', source: 'system' });
    expect(SYSTEM_CHROMIUM_PATHS.linux.indexOf('/usr/bin/chromium')).toBeLessThan(SYSTEM_CHROMIUM_PATHS.linux.indexOf('/usr/bin/google-chrome'));
  });

  test('nothing found: unavailable, naming the config key', async () => {
    const r = await resolveChromium('', { playwrightInstalled: installed, platform: 'linux', exists: none, playwrightChromium: async () => null });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('ngdpbase.export.pdf.chromium-path') });
  });
});

describe('the sandbox', () => {
  test('only data: URIs may load — http, https, file, ftp, blob and websockets are refused', () => {
    expect(isAllowedPdfRequest('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isAllowedPdfRequest('DATA:font/woff2;base64,AAAA')).toBe(true);
    for (const url of ['http://127.0.0.1/x.png', 'https://example.com/a.css', 'file:///etc/passwd', 'ftp://h/f', 'blob:https://h/1', 'ws://h/', 'about:blank', ' http://x/data:']) {
      expect(isAllowedPdfRequest(url)).toBe(false);
    }
  });

  test('the render child gets no secret from the site\'s environment', () => {
    const env = childEnv({ PATH: '/bin', HOME: '/h', NGDPBASE_SESSION_SECRET: 's', NGDPBASE_CREDENTIALS_KEY: 'k', SMTP_PASS: 'p', NODE_OPTIONS: '--inspect' });
    expect(env).toEqual({ PATH: '/bin', HOME: '/h' });
  });
});

describe('normalizePdf — the same document gives the same bytes', () => {
  /** A PDF as a renderer writes one: the date it was made, and a random ID. */
  async function renderedAt(date: Date, id: string): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawText('Invoice 2026-0042  Total $35.50', { x: 72, y: 700, size: 14 });
    doc.setTitle('Invoice 2026-0042');
    doc.setCreationDate(date);
    doc.setModificationDate(date);
    doc.setProducer('Skia/PDF m140');
    doc.setCreator('Mozilla/5.0 HeadlessChrome/140');
    doc.context.trailerInfo.ID = doc.context.obj([PDFHexString.of(id), PDFHexString.of(id)]);
    return doc.save();
  }

  test('two renders a year apart, with different IDs, hash the same once normalised', async () => {
    const a = await renderedAt(new Date('2026-01-01T00:00:00Z'), 'a'.repeat(32));
    const b = await renderedAt(new Date('2027-01-01T09:30:00Z'), 'b'.repeat(32));
    expect(sha256(a)).not.toBe(sha256(b));
    expect(sha256(await normalizePdf(a))).toBe(sha256(await normalizePdf(b)));
  });

  test('dates and the ID are gone, the producer is fixed, the title and pages stay', async () => {
    const out = await normalizePdf(await renderedAt(new Date('2026-05-05T00:00:00Z'), 'c'.repeat(32)));
    const text = Buffer.from(out).toString('latin1');
    expect(text).not.toMatch(/CreationDate|ModDate|\/ID \[/);
    expect(text).not.toMatch(/HeadlessChrome|Skia/);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getTitle()).toBe('Invoice 2026-0042');
    expect(doc.getProducer()).toBe(PDF_PRODUCER);
    expect(doc.getCreator()).toBe(PDF_PRODUCER);
    expect(doc.getPageCount()).toBe(1);
  });

  test('normalising twice changes nothing', async () => {
    const once = await normalizePdf(await renderedAt(new Date(), 'd'.repeat(32)));
    expect(sha256(await normalizePdf(once))).toBe(sha256(once));
  });
});
