/**
 * PdfProvider — how ExportManager turns HTML into PDF (#1974).
 *
 * `ngdpbase.export.pdf.provider` chooses one, as `ngdpbase.mail.provider` and
 * `ngdpbase.database.provider` do for their managers:
 *
 * - `none` (default) — `NonePdfProvider`: no PDF; `htmlToPdf` throws
 *   `PdfUnavailableError` and an add-on falls back to HTML.
 * - `local-chrome` — `LocalChromePdfProvider`: a Chromium already on the
 *   machine, run in a child process with no network.
 * - `chrome-service` — `ChromeServicePdfProvider`: a separate Chromium service
 *   reached by URL (Gotenberg's HTML route), through `guardedFetch`.
 *
 * A provider renders one document and returns the normalised bytes
 * (`normalizePdf`), so the same HTML gives the same bytes for a given provider
 * and engine version. It throws `PdfUnavailableError` when it has no engine to
 * use (not set up, not reachable, cannot start) and a plain `Error` when the
 * engine ran and the render failed. Another engine (e.g. WeasyPrint) is a new
 * class here and one more name in `PDF_PROVIDERS`.
 */
import { PdfUnavailableError, type ResolvedPdfOptions } from './pdfEngine.js';

/** The values `ngdpbase.export.pdf.provider` takes. */
export const PDF_PROVIDERS = ['none', 'local-chrome', 'chrome-service'] as const;
export type PdfProviderName = (typeof PDF_PROVIDERS)[number];

/** One render, after the options are validated and the defaults filled. */
export interface PdfRenderRequest {
  html: string;
  options: ResolvedPdfOptions;
  /** The whole render, including any wait on a PDF service. */
  timeoutMs: number;
}

export interface PdfRendered {
  /** The PDF, normalised. */
  pdf: Uint8Array;
  /** What made it, for the log line (`local-chrome:system`, `chrome-service`). */
  engine: string;
}

export interface PdfProvider {
  readonly name: PdfProviderName;
  render(request: PdfRenderRequest): Promise<PdfRendered>;
}

/**
 * `none`: PDF export is off. Also stands in for a provider name that is not
 * one, so a typo is reported the same way — unavailable, with the reason.
 */
export class NonePdfProvider implements PdfProvider {
  readonly name = 'none' as const;

  constructor(private readonly reason = 'ngdpbase.export.pdf.provider is none: set it to local-chrome or chrome-service') {}

  render(): Promise<PdfRendered> {
    return Promise.reject(new PdfUnavailableError(this.reason));
  }
}
