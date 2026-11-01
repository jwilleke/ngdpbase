/**
 * #1974 — a real render through headless Chromium, when one is available.
 *
 * Skipped, with the reason printed, when `resolveChromium` finds none (no
 * playwright-core, no Playwright browser, no system Chromium or Chrome). CI's
 * ubuntu runners have Google Chrome at /usr/bin/google-chrome, so it runs
 * there; locally `npx playwright install chromium` is enough.
 *
 * Proves, on real bytes: a print-styled invoice renders to a PDF; the same
 * HTML gives the same SHA-256; nothing the page asks for reaches the network.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PDFDocument } from 'pdf-lib';
import ExportManager from '../../managers/ExportManager';
import { resolveChromium } from '../pdfEngine';
import { TEST_ACTOR } from '../../test-support/actors';
import { hasChromium, noteSkip } from '../../test-support/tools';

const engine = await resolveChromium(process.env.NGDPBASE_TEST_CHROMIUM ?? '');
// Found is not enough: a Chromium on disk can still fail to start (#2216).
const starts = await hasChromium();
noteSkip('pdfEngine.integration', starts);

const sha256 = (b: Uint8Array): string => crypto.createHash('sha256').update(b).digest('hex');

/** A one-pixel PNG, inlined: the only kind of image the sandbox loads. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const invoice = (remote = ''): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice 2026-0042</title>
<style>
  @page { size: Letter; margin: 15mm; }
  body { font-family: sans-serif; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #eee; text-align: left; }
  td, th { border-bottom: 1px solid #ccc; padding: 4px; }
  @media print { .no-print { display: none; } }
</style>${remote}</head>
<body>
  <h1>Invoice 2026-0042</h1>
  <img src="${PIXEL}" alt="logo" width="16" height="16">
  <p class="no-print">Shown on screen only</p>
  <table><tr><th>Item</th><th>Amount</th></tr><tr><td>Annual dues</td><td>$35.50</td></tr></table>
</body></html>`;

function exportManager(): ExportManager {
  const props: Record<string, unknown> = { 'ngdpbase.export.pdf.provider': 'local-chrome', 'ngdpbase.export.pdf.provider.local-chrome.chromium-path': engine.ok ? engine.executablePath : '' };
  return new ExportManager({
    getManager: (name: string) => (name === 'ConfigurationManager' ? { getProperty: (k: string, d: unknown) => (k in props ? props[k] : d) } : undefined)
  });
}

describe.skipIf(!engine.ok || !starts.ok)('htmlToPdf with real Chromium (#1974)', () => {
  test('a print-styled invoice renders to a one-page PDF, and the same HTML gives the same SHA-256', async () => {
    const manager = exportManager();
    const first = await manager.htmlToPdf(TEST_ACTOR, invoice());
    const second = await manager.htmlToPdf(TEST_ACTOR, invoice());
    expect(first.subarray(0, 5).toString()).toBe('%PDF-');
    expect(sha256(first)).toBe(sha256(second));
    const doc = await PDFDocument.load(first, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Invoice 2026-0042');
    expect(doc.getCreationDate()).toBeUndefined();
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([612, 792]);
  }, 60_000);

  test('different HTML gives different bytes', async () => {
    const manager = exportManager();
    const a = await manager.htmlToPdf(TEST_ACTOR, invoice());
    const b = await manager.htmlToPdf(TEST_ACTOR, invoice().replace('$35.50', '$36.50'));
    expect(sha256(a)).not.toBe(sha256(b));
  }, 60_000);

  test('nothing the page asks for reaches the network: images, stylesheets, fonts, frames', async () => {
    const hits: string[] = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url ?? '');
      res.end('x');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const remote = `<link rel="stylesheet" href="${base}/style.css"><style>@import url("${base}/import.css"); @font-face { font-family: X; src: url("${base}/font.woff2"); } body { background: url("${base}/bg.png"); font-family: X; }</style>`;
      const html = invoice(remote).replace('</body>', `<img src="${base}/img.png"><iframe src="${base}/frame.html"></iframe><img src="file:///etc/hosts"></body>`);
      const pdf = await exportManager().htmlToPdf(TEST_ACTOR, html);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(hits).toEqual([]);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 60_000);

  test('a render past the timeout is killed and rejected', async () => {
    const props: Record<string, unknown> = { 'ngdpbase.export.pdf.provider': 'local-chrome', 'ngdpbase.export.pdf.provider.local-chrome.chromium-path': engine.ok ? engine.executablePath : '', 'ngdpbase.export.pdf.timeout-ms': 1 };
    const manager = new ExportManager({
      getManager: (name: string) => (name === 'ConfigurationManager' ? { getProperty: (k: string, d: unknown) => (k in props ? props[k] : d) } : undefined)
    });
    await expect(manager.htmlToPdf(TEST_ACTOR, invoice())).rejects.toThrow(/timed out|Timeout/);
  }, 60_000);
});
