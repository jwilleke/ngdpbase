/**
 * The PDF render child (#1974) — see `renderPdfInChild` in pdfEngine.ts.
 *
 * One job per process: receive the HTML, render it in headless Chromium with
 * no network and no JavaScript, normalise the bytes, send them back, exit. Or,
 * for the chrome-service provider, receive a PDF the service made and only
 * normalise it (`kind: 'normalize'`; playwright-core is never loaded). A
 * separate process, so a hung or crashing Chromium and the PDF parsing in
 * `normalizePdf` never touch the thread that answers requests, and a timeout
 * can kill all of it. Chromium talks to Playwright over a pipe, so when this
 * process dies Chromium exits with it.
 */
import type { PdfChildJob, PdfJob, PdfJobResult, PdfNormalizeJob } from './pdfEngine.js';
import { isAllowedPdfRequest, normalizePdf } from './pdfNormalize.js';

/** Chromium flags: no shared-memory assumptions (containers), and a dead proxy behind the request block. */
const CHROMIUM_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--proxy-server=http://127.0.0.1:9',
  '--proxy-bypass-list=<-loopback>'
];

function reply(result: PdfJobResult): void {
  process.send?.(result, () => process.disconnect?.());
}

async function render(job: PdfJob): Promise<PdfJobResult> {
  let chromium: typeof import('playwright-core').chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (err) {
    return { ok: false, stage: 'launch', error: `playwright-core could not be loaded: ${(err as Error).message}` };
  }

  let browser: import('playwright-core').Browser;
  try {
    browser = await chromium.launch({
      executablePath: job.executablePath,
      headless: true,
      args: CHROMIUM_ARGS,
      timeout: job.timeoutMs
    });
  } catch (err) {
    return { ok: false, stage: 'launch', error: (err as Error).message.split('\n')[0] };
  }

  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    // Every request the page makes is refused except data: URIs.
    await context.route('**/*', (route) =>
      isAllowedPdfRequest(route.request().url()) ? route.continue() : route.abort('blockedbyclient')
    );
    const page = await context.newPage();
    page.setDefaultTimeout(job.timeoutMs);
    await page.setContent(job.html, { waitUntil: 'load' });
    const raw = await page.pdf({
      format: job.options.format,
      margin: job.options.margin,
      printBackground: job.options.printBackground,
      preferCSSPageSize: true
    });
    const pdf = await normalizePdf(raw);
    return { ok: true, pdf };
  } catch (err) {
    return { ok: false, stage: 'render', error: (err as Error).message.split('\n')[0] };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function normalize(job: PdfNormalizeJob): Promise<PdfJobResult> {
  try {
    return { ok: true, pdf: await normalizePdf(job.pdf) };
  } catch (err) {
    return { ok: false, stage: 'render', error: (err as Error).message.split('\n')[0] };
  }
}

process.once('message', (job: PdfChildJob) => {
  (job.kind === 'normalize' ? normalize(job) : render(job)).then(reply, (err: unknown) => reply({ ok: false, stage: 'render', error: (err as Error).message }));
});
