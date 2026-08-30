/**
 * Word (.docx) converter (#1131) — the first BINARY source format.
 *
 * Deliberately thin: mammoth (pure JS, no native deps) turns the document
 * into clean HTML, and ImportManager routes that HTML through the EXISTING
 * html→NCM path — turndown, §2.4 link normalization, §2.1 table up-convert,
 * §2.2 image localization, and the #1125 footnote transfer all come from
 * the funnel, not from here. The converter's own contribution is the
 * `convertBuffer` contract that text converters don't need.
 *
 * Known limitation, recorded on the issue: docx footnotes arrive as
 * mammoth's anchor/list HTML rather than `[^id]` markdown, so they survive
 * as ordinary links instead of sidecar records. Mapping them is a follow-up.
 */

import mammoth from 'mammoth';
import type { IContentConverter, ConversionResult } from './IContentConverter.js';

export default class DocxConverter implements IContentConverter {
  readonly formatId = 'docx';
  readonly formatName = 'Word (.docx)';
  readonly fileExtensions = ['.docx'];

  /**
   * Never claims by content (#879 extension-first): a docx read as UTF-8 is
   * zip garbage, and probing it risks both false negatives and another
   * converter mis-claiming. detectFormat's extension pass finds this
   * converter; the content pass must stay silent.
   */
  canHandle(_content: string, _filename: string): boolean {
    return false;
  }

  /** A docx has no meaningful text form — the binary contract is the only door. */
  convert(_content: string): ConversionResult {
    throw new Error('DocxConverter requires binary input — use convertBuffer (#1131)');
  }

  async convertBuffer(buffer: Buffer): Promise<ConversionResult> {
    const result = await mammoth.convertToHtml({ buffer });
    return {
      // Intermediate HTML — ImportManager hands it to normalizeToNcm('html').
      // Wrapped as a full document: mammoth emits a fragment, and the
      // html→NCM path extracts from a document body — an unwrapped fragment
      // came out as bare heading text with every paragraph dropped.
      content: `<html><head><title></title></head><body>${result.value}</body></html>`,
      metadata: { importedFrom: 'docx' },
      warnings: result.messages.map((m) => ({
        kind: 'converter-note',
        detail: `mammoth ${m.type}: ${m.message}`
      }))
    };
  }
}
