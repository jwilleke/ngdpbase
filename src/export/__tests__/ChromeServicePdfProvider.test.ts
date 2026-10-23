/**
 * #1974 — the chrome-service PDF provider against a stub PDF service on a real
 * socket: the Gotenberg request it sends, the egress policy, the timeout, a
 * service that fails or is not there, and the metadata pass that makes the
 * bytes deterministic.
 *
 * The site's URL is a LAN address (192.168.50.10), so the egress policy is
 * judged as it would be on a site. The guard never lets core reach loopback,
 * so a test transport carries the request that passed the policy to the stub
 * on 127.0.0.1 — the seam guardedFetch documents for exactly this.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PDFDocument } from 'pdf-lib';
import type { Transport } from '../../http/guardedFetch';
import { ChromeServicePdfProvider, gotenbergFields, serviceEndpoint, GOTENBERG_HTML_ROUTE } from '../ChromeServicePdfProvider';
import { PdfUnavailableError, normalizePdfInChild, resolvePdfOptions } from '../pdfEngine';
import { PDF_PRODUCER } from '../pdfNormalize';

const sha256 = (b: Uint8Array): string => crypto.createHash('sha256').update(b).digest('hex');
const HTML = '<!doctype html><title>Invoice 2026-0042</title><p>Total $35.50</p>';
const LAN = '192.168.50.10';
const ALLOW_LAN = { deniedRanges: [], allowedRanges: ['192.168.0.0/16'] };
const DEFAULT_POLICY = { deniedRanges: [], allowedRanges: [] };

/** A PDF as a Chromium service writes one: stamped with the time it was made. */
async function servicePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawText('Invoice 2026-0042  Total $35.50', { x: 72, y: 700, size: 14 });
  doc.setTitle('Invoice 2026-0042');
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());
  doc.setProducer('Skia/PDF m140');
  doc.setCreator('Gotenberg');
  return Buffer.from(await doc.save());
}

interface Seen {
  method: string;
  url: string;
  contentType: string;
  body: Buffer;
}

let server: http.Server;
let port = 0;
const seen: Seen[] = [];
let answer: (res: http.ServerResponse) => void | Promise<void>;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', contentType: String(req.headers['content-type']), body: Buffer.concat(chunks) });
      void answer(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  seen.length = 0;
  answer = async (res) => {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    res.end(await servicePdf());
  };
});

/** Carries a request that passed the policy to the stub, keeping its path, method, headers, body and timeout. */
const toStub = (toPort = (): number => port): Transport => (url, init) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: toPort(), path: url.pathname + url.search, method: init.method, headers: { ...init.headers, Host: url.host }, timeout: init.timeoutMs },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res as AsyncIterable<Buffer> })
    );
    req.on('timeout', () => req.destroy(new Error(`timed out after ${init.timeoutMs}ms`)));
    req.on('error', reject);
    req.end(init.body);
  });

function provider(over: { url?: string; policy?: typeof ALLOW_LAN; maxBytes?: number; transport?: Transport } = {}): ChromeServicePdfProvider {
  return new ChromeServicePdfProvider(
    { url: over.url ?? `http://${LAN}:${port}`, policy: over.policy ?? ALLOW_LAN, maxBytes: over.maxBytes ?? 50 * 1024 * 1024 },
    { transport: over.transport ?? toStub() }
  );
}

const request = (timeoutMs = 20_000) => ({ html: HTML, options: resolvePdfOptions({ margin: { top: '20mm' }, printBackground: false }, 'A4'), timeoutMs });

/** The named fields and the file of a multipart body. */
function parts(seenReq: Seen): { fields: Record<string, string>; file: { disposition: string; type: string; content: string } } {
  const boundary = /boundary=(.+)$/.exec(seenReq.contentType)?.[1] ?? '';
  const fields: Record<string, string> = {};
  let file = { disposition: '', type: '', content: '' };
  for (const part of seenReq.body.toString('utf8').split(`--${boundary}`).slice(1, -1)) {
    const [head, ...rest] = part.replace(/^\r\n/, '').split('\r\n\r\n');
    const content = rest.join('\r\n\r\n').replace(/\r\n$/, '');
    const name = /name="([^"]+)"/.exec(head)?.[1] ?? '';
    if (name === 'files') file = { disposition: head.split('\r\n')[0], type: head.split('\r\n')[1] ?? '', content };
    else fields[name] = content;
  }
  return { fields, file };
}

describe('the Gotenberg request', () => {
  test('POSTs a multipart form to <url>/forms/chromium/convert/html: the document as index.html, the page as fields', async () => {
    await provider().render(request());
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe(`/${GOTENBERG_HTML_ROUTE}`);
    expect(seen[0].contentType).toMatch(/^multipart\/form-data; boundary=/);
    const { fields, file } = parts(seen[0]);
    expect(file.disposition).toBe('Content-Disposition: form-data; name="files"; filename="index.html"');
    expect(file.type).toBe('Content-Type: text/html; charset=utf-8');
    expect(file.content).toBe(HTML);
    expect(fields).toEqual({
      paperWidth: '8.27in',
      paperHeight: '11.7in',
      marginTop: '20mm',
      marginRight: '0',
      marginBottom: '0',
      marginLeft: '0',
      preferCssPageSize: 'true',
      printBackground: 'false'
    });
  });

  test('every margin is sent, 0 when unset, since the service\'s own default is not zero', () => {
    const fields = Object.fromEntries(gotenbergFields(resolvePdfOptions(undefined, 'Letter')));
    expect(fields).toMatchObject({ paperWidth: '8.5in', paperHeight: '11in', marginTop: '0', marginRight: '0', marginBottom: '0', marginLeft: '0', printBackground: 'true' });
  });

  test('a path on the service URL is kept', () => {
    expect(serviceEndpoint('http://pdf.lan:3000')).toBe('http://pdf.lan:3000/forms/chromium/convert/html');
    expect(serviceEndpoint('http://pdf.lan:3000/gotenberg')).toBe('http://pdf.lan:3000/gotenberg/forms/chromium/convert/html');
  });
});

describe('the answer', () => {
  test('is normalised in a child: no dates, producer fixed, and the same HTML gives the same SHA-256', async () => {
    const p = new ChromeServicePdfProvider({ url: `http://${LAN}:${port}`, policy: ALLOW_LAN, maxBytes: 50 * 1024 * 1024 }, { transport: toStub(), normalize: normalizePdfInChild });
    const first = await p.render(request());
    await new Promise((r) => setTimeout(r, 1100)); // the service stamps a new second into its next PDF
    const second = await p.render(request());
    expect(first.engine).toBe('chrome-service');
    expect(sha256(first.pdf)).toBe(sha256(second.pdf));
    const doc = await PDFDocument.load(first.pdf, { updateMetadata: false });
    expect(doc.getCreationDate()).toBeUndefined();
    expect(doc.getProducer()).toBe(PDF_PRODUCER);
    expect(doc.getTitle()).toBe('Invoice 2026-0042');
  }, 30_000);

  test('a service error is a render failure, not "unavailable"', async () => {
    answer = (res) => { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Chromium crashed'); };
    const err = await provider().render(request()).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PdfUnavailableError);
    expect((err as Error).message).toMatch(/PDF render failed: the PDF service at http:\/\/192\.168\.50\.10:\d+ answered 500: Chromium crashed/);
  });

  test('an answer that is not a PDF is refused', async () => {
    answer = (res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>login</html>'); };
    await expect(provider().render(request())).rejects.toThrow(/not with a PDF/);
  });

  test('an answer over max-bytes is refused', async () => {
    await expect(provider({ maxBytes: 100 }).render(request())).rejects.toThrow(/PDF render failed: .*too large/);
  });

  test('a service that does not answer in timeout-ms is stopped: a render failure', async () => {
    answer = () => undefined; // never answers
    const started = Date.now();
    const err = await provider().render(request(300)).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PdfUnavailableError);
    expect((err as Error).message).toMatch(/timed out after 300ms/);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('unavailable', () => {
  test('no URL set', async () => {
    const err = await provider({ url: '' }).render(request()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect((err as Error).message).toMatch(/chrome-service\.url is not set/);
  });

  test('the egress policy refuses a LAN address until its range is allowed — nothing is sent', async () => {
    const err = await provider({ policy: DEFAULT_POLICY }).render(request()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect((err as Error).message).toMatch(/could not be reached: refusing to connect to an internal address/);
    expect(seen).toHaveLength(0);
  });

  test('loopback is refused even when allowed', async () => {
    const err = await provider({ url: `http://127.0.0.1:${port}`, policy: { deniedRanges: [], allowedRanges: ['127.0.0.0/8'] } }).render(request()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect(seen).toHaveLength(0);
  });

  test('nothing listening', async () => {
    const closed = http.createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const err = await provider({ transport: toStub(() => deadPort) }).render(request()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfUnavailableError);
    expect((err as Error).message).toMatch(/could not be reached: .*ECONNREFUSED/);
  });
});
