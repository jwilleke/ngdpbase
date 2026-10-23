/**
 * A stand-in for yourPHR's C-CDA reader, with the same shape (#1979): phr's
 * real one wraps `@medplum/ccda`, which this repo does not depend on.
 *
 * - `xmlKind(text)` — what kind of XML this is; the shim's "can I read this?";
 * - `readCcda(xml)` — the records it holds, plus a note when it read only part.
 */

export type XmlKind = 'ccda' | 'other' | null;

export interface CcdaRecord {
  code: string;
  value: string;
  /** The source system's id for the observation, when it has one. */
  id?: string;
}

/** `ccda` for an HL7 ClinicalDocument, `other` for any other XML, null for not XML. */
export function xmlKind(text: string): XmlKind {
  const head = text.trimStart();
  if (!head.startsWith('<')) return null;
  return /<ClinicalDocument\b[^>]*urn:hl7-org:v3/.test(head) ? 'ccda' : 'other';
}

/** Each `<observation code=".." value=".."/>` is a record; each `<unsupported/>` section is left out and noted. */
export function readCcda(xml: string): { records: CcdaRecord[]; note?: string } {
  const records: CcdaRecord[] = [];
  for (const m of xml.matchAll(/<observation\s+([^>]*?)\/>/g)) {
    const attr = (name: string): string | undefined => new RegExp(`${name}="([^"]*)"`).exec(m[1])?.[1];
    const code = attr('code');
    const value = attr('value');
    if (code && value) records.push({ code, value, ...(attr('id') ? { id: attr('id') } : {}) });
  }
  const skipped = (xml.match(/<unsupported\b/g) ?? []).length;
  return { records, ...(skipped > 0 ? { note: `${skipped} section(s) could not be read` } : {}) };
}
