/**
 * `local-chrome` (#1974): a Chromium already on the machine — the configured
 * path (`ngdpbase.export.pdf.provider.local-chrome.chromium-path`), or one
 * `resolveChromium` finds. Each render is its own child process
 * (`pdfRenderWorker.ts`) with JavaScript off and every request refused except
 * `data:` URIs, killed at the timeout.
 */
import {
  PdfUnavailableError,
  renderPdfInChild,
  resolveChromium,
  type ChromiumResolution,
  type PdfJob,
  type PdfJobResult
} from './pdfEngine.js';
import type { PdfProvider, PdfRenderRequest, PdfRendered } from './PdfProvider.js';

/** Hooks for tests; a site passes nothing. */
export interface LocalChromeDeps {
  render?: (job: PdfJob) => Promise<PdfJobResult>;
  resolve?: (configuredPath: string) => Promise<ChromiumResolution>;
}

export class LocalChromePdfProvider implements PdfProvider {
  readonly name = 'local-chrome' as const;

  /**
   * @param chromiumPath - The configured Chromium ('' = find one)
   * @param deps - Test hooks
   */
  constructor(private readonly chromiumPath: string, private readonly deps: LocalChromeDeps = {}) {}

  async render({ html, options, timeoutMs }: PdfRenderRequest): Promise<PdfRendered> {
    const engine = await (this.deps.resolve ?? ((p: string) => resolveChromium(p)))(this.chromiumPath);
    if (!engine.ok) throw new PdfUnavailableError(engine.reason);
    const result = await (this.deps.render ?? renderPdfInChild)({ kind: 'render', html, executablePath: engine.executablePath, options, timeoutMs });
    if (!result.ok) {
      if (result.stage === 'launch') throw new PdfUnavailableError(`Chromium at ${engine.executablePath} could not start: ${result.error}`);
      throw new Error(`PDF render failed: ${result.error}`);
    }
    return { pdf: result.pdf, engine: `local-chrome:${engine.source}` };
  }
}
