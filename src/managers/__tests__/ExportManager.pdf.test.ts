/**
 * #1974 — ExportManager.htmlToPdf, with the render and the Chromium lookup
 * replaced: options and config reach the render, a missing engine is a clear
 * error and a "needs attention" flag (only once something asked), the
 * concurrency limit holds, and a context is required.
 */
import ExportManager, { PDF_UNAVAILABLE_REASON, PdfUnavailableError } from '../ExportManager';
import type { PdfJob, PdfJobResult, ChromiumResolution } from '../../export/pdfEngine';
import { TEST_ACTOR } from '../../test-support/actors';
import logger from '../../utils/logger';

const HTML = '<!doctype html><title>Invoice</title><p>Total $35.50</p>';
const PDF = Buffer.from('%PDF-1.7 fake');
const FOUND: ChromiumResolution = { ok: true, executablePath: '/usr/bin/chromium', source: 'system' };

interface Harness {
  manager: ExportManager;
  jobs: PdfJob[];
  setRender(fn: (job: PdfJob) => Promise<PdfJobResult>): void;
  setEngine(r: ChromiumResolution): void;
  props: Record<string, unknown>;
}

function harness(): Harness {
  const props: Record<string, unknown> = { 'ngdpbase.export.pdf.provider': 'local-chrome' };
  const manager = new ExportManager({
    getManager: (name: string) =>
      name === 'ConfigurationManager' ? { getProperty: (k: string, d: unknown) => (k in props ? props[k] : d) } : undefined
  });
  const jobs: PdfJob[] = [];
  let render: (job: PdfJob) => Promise<PdfJobResult> = async () => ({ ok: true, pdf: PDF });
  let engine: ChromiumResolution = FOUND;
  const m = manager as unknown as { pdfRenderer: unknown; chromiumResolver: unknown };
  m.pdfRenderer = (job: PdfJob) => {
    jobs.push(job);
    return render(job);
  };
  m.chromiumResolver = async (configured: string) => (configured ? { ok: true, executablePath: configured, source: 'configured' } : engine);
  return { manager, jobs, props, setRender: (fn) => { render = fn; }, setEngine: (r) => { engine = r; } };
}

describe('ExportManager.htmlToPdf (#1974)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns the PDF as a Buffer, rendered with the defaults from config', async () => {
    const h = harness();
    const out = await h.manager.htmlToPdf(TEST_ACTOR, HTML);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.equals(PDF)).toBe(true);
    expect(h.jobs).toEqual([{ kind: 'render', html: HTML, executablePath: '/usr/bin/chromium', options: { format: 'Letter', margin: {}, printBackground: true }, timeoutMs: 30000 }]);
  });

  test('the caller\'s options and the configured page size, timeout and Chromium path reach the render', async () => {
    const h = harness();
    Object.assign(h.props, {
      'ngdpbase.export.pdf.page-size': 'A4',
      'ngdpbase.export.pdf.timeout-ms': 5000,
      'ngdpbase.export.pdf.provider.local-chrome.chromium-path': '/opt/chrome'
    });
    await h.manager.htmlToPdf(TEST_ACTOR, HTML, { margin: { top: '20mm' }, printBackground: false });
    expect(h.jobs[0]).toMatchObject({ executablePath: '/opt/chrome', timeoutMs: 5000, options: { format: 'A4', margin: { top: '20mm' }, printBackground: false } });
  });

  test('bad options are refused before anything is started', async () => {
    const h = harness();
    await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML, { format: 'Napkin' as never })).rejects.toThrow(/format/);
    expect(h.jobs).toHaveLength(0);
  });

  test('a context is required, and so is HTML', async () => {
    const h = harness();
    await expect(h.manager.htmlToPdf(undefined as never, HTML)).rejects.toThrow(/context is required/);
    await expect(h.manager.htmlToPdf(TEST_ACTOR, '')).rejects.toThrow(/html/);
  });

  test('the log line names who asked and the size — never the HTML', async () => {
    const h = harness();
    await h.manager.htmlToPdf(TEST_ACTOR, HTML);
    const lines = vi.mocked(logger.info).mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toMatch(/PDF rendered bytes=\d+ .*by=test-user/);
    expect(lines).not.toContain('Total $35.50');
  });

  describe('no engine', () => {
    test('a site that never asks for a PDF is never flagged', () => {
      const h = harness();
      h.setEngine({ ok: false, reason: 'no Chromium found' });
      expect(h.manager.getManagerStatus().state).toBe('ready');
    });

    test('asking throws PdfUnavailableError (code PDF_UNAVAILABLE), logs why, and flags the manager as needing attention', async () => {
      const h = harness();
      h.setEngine({ ok: false, reason: 'no Chromium found: install Chromium, or set ngdpbase.export.pdf.provider.local-chrome.chromium-path' });
      const err = await h.manager.htmlToPdf(TEST_ACTOR, HTML).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PdfUnavailableError);
      expect((err as PdfUnavailableError).code).toBe('PDF_UNAVAILABLE');
      expect((err as Error).message).toMatch(/PDF export unavailable: no Chromium found/);
      expect(h.jobs).toHaveLength(0);
      expect(vi.mocked(logger.warn).mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/PDF export unavailable: no Chromium found/);
      expect(h.manager.getManagerStatus()).toEqual({
        state: 'degraded',
        kind: 'attention',
        reason: PDF_UNAVAILABLE_REASON,
        configKey: 'ngdpbase.export.pdf.provider'
      });
    });

    test('Chromium that cannot start is unavailable too', async () => {
      const h = harness();
      h.setRender(async () => ({ ok: false, stage: 'launch', error: 'error while loading shared libraries: libnss3.so' }));
      await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML)).rejects.toBeInstanceOf(PdfUnavailableError);
      expect(h.manager.getManagerStatus().kind).toBe('attention');
    });

    test('the next render that works clears the flag', async () => {
      const h = harness();
      h.setEngine({ ok: false, reason: 'no Chromium found' });
      await h.manager.htmlToPdf(TEST_ACTOR, HTML).catch(() => undefined);
      h.setEngine(FOUND);
      await h.manager.htmlToPdf(TEST_ACTOR, HTML);
      expect(h.manager.getManagerStatus().state).toBe('ready');
    });

    test('an outage already shown (the export folder) is not replaced by the PDF reminder', async () => {
      const h = harness();
      (h.manager as unknown as { markDegraded(r: string): void }).markDegraded('export folder not writable');
      h.setEngine({ ok: false, reason: 'no Chromium found' });
      await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML)).rejects.toBeInstanceOf(PdfUnavailableError);
      expect(h.manager.getManagerStatus()).toMatchObject({ kind: 'outage', reason: 'export folder not writable' });
    });
  });

  test('a render that fails (not a launch) is a plain error and flags nothing', async () => {
    const h = harness();
    h.setRender(async () => ({ ok: false, stage: 'render', error: 'Timeout 30000ms exceeded' }));
    const err = await h.manager.htmlToPdf(TEST_ACTOR, HTML).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PdfUnavailableError);
    expect((err as Error).message).toMatch(/PDF render failed: Timeout/);
    expect(h.manager.getManagerStatus().state).toBe('ready');
  });

  test('at most ngdpbase.export.pdf.max-concurrent renders run at once; the rest wait their turn', async () => {
    const h = harness();
    h.props['ngdpbase.export.pdf.max-concurrent'] = 2;
    let running = 0;
    let peak = 0;
    const gates: Array<() => void> = [];
    h.setRender(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise<void>((r) => gates.push(r));
      running--;
      return { ok: true, pdf: PDF };
    });
    const all = Promise.all([1, 2, 3, 4, 5].map(() => h.manager.htmlToPdf(TEST_ACTOR, HTML)));
    for (let i = 0; i < 5; i++) {
      await vi.waitFor(() => expect(gates.length).toBeGreaterThan(0));
      expect(running).toBeLessThanOrEqual(2);
      gates.shift()();
    }
    await all;
    expect(peak).toBe(2);
    expect(h.jobs).toHaveLength(5);
  });

  test('a render that throws (timeout, crash) frees its slot', async () => {
    const h = harness();
    h.props['ngdpbase.export.pdf.max-concurrent'] = 1;
    h.setRender(async () => { throw new Error('PDF render timed out after 30000 ms'); });
    await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML)).rejects.toThrow(/timed out/);
    h.setRender(async () => ({ ok: true, pdf: PDF }));
    await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML)).resolves.toBeInstanceOf(Buffer);
  });
});

describe('ngdpbase.export.pdf.provider (#1974)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('none is the default: unavailable, nothing rendered, flagged only once asked', async () => {
    const h = harness();
    delete h.props['ngdpbase.export.pdf.provider'];
    expect(h.manager.getManagerStatus().state).toBe('ready');
    const err = await h.manager.htmlToPdf(TEST_ACTOR, HTML).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect((err as PdfUnavailableError).code).toBe('PDF_UNAVAILABLE');
    expect((err as Error).message).toMatch(/ngdpbase\.export\.pdf\.provider is none/);
    expect(h.jobs).toHaveLength(0);
    expect(h.manager.getManagerStatus()).toMatchObject({ kind: 'attention', configKey: 'ngdpbase.export.pdf.provider' });
  });

  test('a name that is not a provider is unavailable, naming the ones there are', async () => {
    const h = harness();
    h.props['ngdpbase.export.pdf.provider'] = 'weasyprint';
    await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML)).rejects.toThrow(/'weasyprint' is not a PDF provider: use none, local-chrome, chrome-service/);
    expect(h.jobs).toHaveLength(0);
  });

  test('read on every render: switching to local-chrome works without a restart and clears the flag', async () => {
    const h = harness();
    h.props['ngdpbase.export.pdf.provider'] = 'none';
    await h.manager.htmlToPdf(TEST_ACTOR, HTML).catch(() => undefined);
    h.props['ngdpbase.export.pdf.provider'] = 'local-chrome';
    await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML)).resolves.toBeInstanceOf(Buffer);
    expect(h.manager.getManagerStatus().state).toBe('ready');
  });

  describe('chrome-service', () => {
    /** The service, as the transport sees it: records the request and answers with a PDF. */
    function service(h: Harness): string[] {
      const urls: string[] = [];
      const m = h.manager as unknown as { pdfServiceTransport: unknown; pdfNormalizer: unknown };
      m.pdfServiceTransport = async (url: URL) => {
        urls.push(url.toString());
        return { status: 200, headers: {}, body: (async function* () { yield Buffer.from('%PDF-1.7 from the service'); })() };
      };
      m.pdfNormalizer = async (pdf: Uint8Array) => Buffer.concat([Buffer.from(pdf), Buffer.from(' normalised')]);
      h.props['ngdpbase.export.pdf.provider'] = 'chrome-service';
      h.props['ngdpbase.export.pdf.provider.chrome-service.url'] = 'http://192.168.68.71:3000';
      return urls;
    }

    test('posts to the configured service once its range is allowed, and returns the normalised PDF', async () => {
      const h = harness();
      const urls = service(h);
      h.props['ngdpbase.security.egress.allowed-ranges'] = ['192.168.68.0/24'];
      const pdf = await h.manager.htmlToPdf(TEST_ACTOR, HTML);
      expect(pdf.toString()).toBe('%PDF-1.7 from the service normalised');
      expect(urls).toEqual(['http://192.168.68.71:3000/forms/chromium/convert/html']);
      expect(h.jobs).toHaveLength(0);
      expect(vi.mocked(logger.info).mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/engine=chrome-service by=test-user/);
    });

    test('the site\'s egress policy refuses a LAN service it has not allowed: unavailable, flagged', async () => {
      const h = harness();
      const urls = service(h);
      await expect(h.manager.htmlToPdf(TEST_ACTOR, HTML)).rejects.toBeInstanceOf(PdfUnavailableError);
      expect(urls).toEqual([]);
      expect(h.manager.getManagerStatus().kind).toBe('attention');
    });
  });
});
