/**
 * `chrome-service` (#1974): a separate Chromium service reached by URL, for a
 * site whose own image carries no browser (the Docker image). It speaks
 * Gotenberg's HTML route: `POST <url>/forms/chromium/convert/html`, a
 * multipart form with the document as `files` (`index.html`) and the page
 * settings as fields; the answer is the PDF.
 *
 * - Outbound through `guardedFetch` under the site's egress policy. A service
 *   on the LAN or in the cluster is on a private address, which the policy
 *   refuses until the operator allows its range
 *   (`ngdpbase.security.egress.allowed-ranges`); loopback is never allowed.
 * - The whole request is bounded by `ngdpbase.export.pdf.timeout-ms`, and the
 *   answer by `ngdpbase.export.pdf.provider.chrome-service.max-bytes`.
 * - The PDF goes through the same `normalizePdf` pass a local render gets, in
 *   a child process, so the same HTML gives the same bytes for a given service
 *   version.
 *
 * What the service's Chromium may load (remote images, files) is the
 * service's own setting, not this request's; the setup guide says how to
 * lock it down.
 */
import { randomUUID } from 'node:crypto';
import { guardedFetch, type Transport } from '../http/guardedFetch.js';
import type { Resolver } from '../http/guardedLookup.js';
import type { EgressPolicy } from '../http/ssrf.js';
import { PdfUnavailableError, normalizePdfInChild, type PdfPageSize, type ResolvedPdfOptions } from './pdfEngine.js';
import type { PdfProvider, PdfRenderRequest, PdfRendered } from './PdfProvider.js';

/** Gotenberg's HTML → PDF route, relative to the configured service URL. */
export const GOTENBERG_HTML_ROUTE = 'forms/chromium/convert/html';

/**
 * The named page sizes in inches, as Chromium's (and Playwright's) print uses
 * them, so a service render and a local one get the same paper.
 */
export const PAPER_INCHES: Record<PdfPageSize, readonly [number, number]> = {
  Letter: [8.5, 11],
  Legal: [8.5, 14],
  Tabloid: [11, 17],
  Ledger: [17, 11],
  A0: [33.1, 46.8],
  A1: [23.4, 33.1],
  A2: [16.54, 23.4],
  A3: [11.7, 16.54],
  A4: [8.27, 11.7],
  A5: [5.83, 8.27],
  A6: [4.13, 5.83]
};

export interface ChromeServiceSettings {
  /** `ngdpbase.export.pdf.provider.chrome-service.url` — the service's base URL. */
  url: string;
  /** The site's egress policy (`resolveEgressPolicy`). */
  policy: EgressPolicy;
  /** The largest answer accepted, in bytes. */
  maxBytes: number;
}

/** Hooks for tests; a site passes nothing. */
export interface ChromeServiceDeps {
  transport?: Transport;
  resolver?: Resolver;
  normalize?: (pdf: Uint8Array, timeoutMs: number) => Promise<Uint8Array>;
}

/**
 * The form fields for one render. Every margin is sent, `0` when the caller
 * set none, because Gotenberg's own default margin is not zero and a local
 * render's is.
 *
 * @param options - The validated options
 */
export function gotenbergFields(options: ResolvedPdfOptions): Array<[string, string]> {
  const [width, height] = PAPER_INCHES[options.format];
  const margin = (side: 'top' | 'right' | 'bottom' | 'left'): string => options.margin[side] ?? '0';
  return [
    ['paperWidth', `${width}in`],
    ['paperHeight', `${height}in`],
    ['marginTop', margin('top')],
    ['marginRight', margin('right')],
    ['marginBottom', margin('bottom')],
    ['marginLeft', margin('left')],
    ['preferCssPageSize', 'true'],
    ['printBackground', String(options.printBackground)]
  ];
}

/**
 * A `multipart/form-data` body: the fields, then the document as `files`
 * named `index.html` (the name Gotenberg's HTML route requires).
 *
 * @param html - The document
 * @param fields - Name and value pairs
 * @param boundary - The part boundary
 */
export function multipartBody(html: string, fields: Array<[string, string]>, boundary: string): Buffer {
  const parts: Buffer[] = [];
  for (const [name, value] of fields) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="index.html"\r\nContent-Type: text/html; charset=utf-8\r\n\r\n`));
  parts.push(Buffer.from(html, 'utf8'));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

/** The service URL with the route appended (a path on the URL is kept). */
export function serviceEndpoint(base: string): string {
  const url = new URL(base);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return new URL(GOTENBERG_HTML_ROUTE, url).toString();
}

export class ChromeServicePdfProvider implements PdfProvider {
  readonly name = 'chrome-service' as const;

  constructor(private readonly settings: ChromeServiceSettings, private readonly deps: ChromeServiceDeps = {}) {}

  async render({ html, options, timeoutMs }: PdfRenderRequest): Promise<PdfRendered> {
    const { url, policy, maxBytes } = this.settings;
    if (!url) throw new PdfUnavailableError('ngdpbase.export.pdf.provider.chrome-service.url is not set');
    let endpoint: string;
    try {
      endpoint = serviceEndpoint(url);
    } catch {
      throw new PdfUnavailableError('ngdpbase.export.pdf.provider.chrome-service.url is not a URL');
    }
    const where = new URL(endpoint).origin;
    const boundary = `ngdpbase-pdf-${randomUUID()}`;
    const body = multipartBody(html, gotenbergFields(options), boundary);

    const started = Date.now();
    let response: Awaited<ReturnType<typeof guardedFetch>>;
    try {
      response = await withDeadline(
        guardedFetch(endpoint, {
          policy,
          method: 'POST',
          body,
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, Accept: 'application/pdf' },
          timeoutMs,
          maxBytes,
          ...(this.deps.transport ? { transport: this.deps.transport } : {}),
          ...(this.deps.resolver ? { resolver: this.deps.resolver } : {})
        }),
        timeoutMs
      );
    } catch (err) {
      const message = (err as Error).message;
      // Too slow or too big: the service ran, and this render failed.
      if (/timed out|too large/.test(message)) throw new Error(`PDF render failed: the PDF service at ${where} ${message}`, { cause: err });
      // Refused by the egress policy, or nothing answering: no engine to use.
      throw new PdfUnavailableError(`the PDF service at ${where} could not be reached: ${message}`, { cause: err });
    }
    if (response.status !== 200) {
      const said = response.body.subarray(0, 200).toString('utf8').replace(/\s+/g, ' ').trim();
      throw new Error(`PDF render failed: the PDF service at ${where} answered ${response.status}${said ? `: ${said}` : ''}`);
    }
    if (response.body.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error(`PDF render failed: the PDF service at ${where} answered, but not with a PDF`);
    }
    const remaining = Math.max(1, timeoutMs - (Date.now() - started));
    const pdf = await (this.deps.normalize ?? normalizePdfInChild)(response.body, remaining);
    return { pdf, engine: 'chrome-service' };
  }
}

/** `guardedFetch`'s timeout is per socket wait; this bounds the whole request. */
function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
