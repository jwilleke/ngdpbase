/**
 * Today's converters as shims (D8, #1979): each registered `IContentConverter`
 * becomes `core.<formatId>`, producing NCM for the pages receiver.
 *
 * The conversion is exactly the one ImportManager ran before the engine
 * (#728, #1131), moved here so the folder import (/admin/import) and the
 * engine run the same code:
 *
 * - a binary converter (`convertBuffer`, DOCX) produces intermediate `html`,
 *   which chains (D9) into the `core.html` shim — DOCX → HTML → NCM;
 * - `html`, `jspwiki` and `markdown` go through the NCM normalizer;
 * - any other converter's own `convert` output is taken as NCM.
 */
import path from 'node:path';
import type { IContentConverter } from '../converters/IContentConverter.js';
import { normalizeToNcm, ncmToConversionResult } from '../converters/ncm/index.js';
import type { IceShim } from './types.js';

/** The receiver today's converters hand to. */
export const PAGES_RECEIVER = 'core.pages';

/** The formats the NCM normalizer reads itself. */
const NCM_SOURCES = new Set(['html', 'jspwiki', 'markdown']);

export function converterShim(converter: IContentConverter, tableClasses: () => string[]): IceShim {
  const formatId = converter.formatId;
  const binary = typeof converter.convertBuffer === 'function';
  const ownsExtension = (name: string): boolean =>
    converter.fileExtensions.some(ext => name.toLowerCase().endsWith(ext.toLowerCase()));

  return {
    name: formatId,
    label: converter.formatName,
    direction: 'in',
    accepts: {
      extensions: converter.fileExtensions.map(e => e.toLowerCase()),
      ...(formatId === 'html' ? { kinds: ['html'] } : {}),
      // A chained input is already known to be this kind; a file is claimed by
      // its extension, or by the converter's own content check.
      canRead: (input) => input.kind !== 'file' || ownsExtension(input.name) || converter.canHandle(input.text ?? '', path.basename(input.name))
    },
    produces: binary ? 'html' : 'ncm',
    receivers: binary ? [] : [PAGES_RECEIVER],
    duplicates: 'file',
    async read(input) {
      if (binary) {
        if (!input.bytes) throw new Error(`${formatId}: needs the file's bytes`);
        const intermediate = await converter.convertBuffer!(input.bytes);
        return { items: [{ kind: 'html', name: input.name, text: intermediate.content, metadata: intermediate.metadata, warnings: intermediate.warnings }] };
      }
      const text = input.text ?? input.bytes?.toString('utf8') ?? '';
      const result = NCM_SOURCES.has(formatId)
        ? ncmToConversionResult(normalizeToNcm(text, formatId as 'html' | 'jspwiki' | 'markdown', { tableClasses: tableClasses() }))
        : converter.convert(text);
      // The NCM markdown path does not stamp provenance the way the JSPWiki and
      // HTML converters do; stamp it for parity.
      if (formatId === 'markdown' && !result.metadata['importedFrom']) {
        result.metadata['importedFrom'] = 'markdown';
      }
      return { items: [{ kind: 'ncm', name: input.name, text: result.content, metadata: result.metadata, warnings: result.warnings }] };
    }
  };
}
