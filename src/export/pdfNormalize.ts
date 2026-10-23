/**
 * Deterministic PDF bytes (#1974).
 *
 * Chromium writes the time of rendering into the document information
 * dictionary (`/CreationDate`, `/ModDate`) and its own user agent as
 * `/Creator`, so the same HTML rendered twice gives different bytes. An add-on
 * that stores an issued document's SHA-256 (an invoice, a giving statement)
 * needs the same bytes every time, so every PDF ExportManager returns goes
 * through here: the dates and any trailer `/ID` are removed, and `/Producer` and
 * `/Creator` are fixed. `/Title` stays: it comes from the HTML's `<title>`.
 *
 * Runs in the render child (`pdfRenderWorker.ts`), never on the thread that
 * answers requests: parsing and re-serialising a large PDF is CPU work.
 */
import { PDFDocument, PDFDict, PDFName, PDFString } from 'pdf-lib';

/** What `/Producer` and `/Creator` say on every PDF core makes. */
export const PDF_PRODUCER = 'ngdpbase';

/** The information-dictionary entries that change on every render. */
const VOLATILE_INFO_KEYS = ['CreationDate', 'ModDate'];

/**
 * The same bytes for the same document: no dates, no random `/ID`, a fixed
 * producer. The page content is not touched.
 *
 * @param bytes - A PDF as Chromium wrote it
 * @returns The normalised PDF
 */
export async function normalizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const { context } = doc;
  const infoRef = context.trailerInfo.Info;
  const info = infoRef ? context.lookup(infoRef) : undefined;
  if (info instanceof PDFDict) {
    for (const key of VOLATILE_INFO_KEYS) info.delete(PDFName.of(key));
    info.set(PDFName.of('Producer'), PDFString.of(PDF_PRODUCER));
    info.set(PDFName.of('Creator'), PDFString.of(PDF_PRODUCER));
  }
  context.trailerInfo.ID = undefined;
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}

/**
 * Whether the render may load a URL: only `data:` URIs (#1974). Everything
 * else — http(s), file, ftp, blob, websockets — is refused, so a PDF is made
 * from the HTML it was given and nothing else, and rendering cannot be used to
 * reach the network or the server's files.
 *
 * @param url - The URL the page asked for
 */
export function isAllowedPdfRequest(url: string): boolean {
  return /^data:/i.test(url.trim());
}
