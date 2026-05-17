/**
 * Tests for the NCM core (#728 Phase 2 Slice 1)
 *
 * Establishes the hard-to-retrofit guarantees: idempotent fixed point,
 * ncmVersion stamp/preserve, deterministic frontmatter order, placeholder
 * round-trip, deferred-format signalling.
 */

import {
  normalizeToNcm,
  formatDroppedPlaceholder,
  isDroppedPlaceholderLine,
  NCM_VERSION
} from '../ncm/index';
import matter from 'gray-matter';

describe('NCM normalizeToNcm — idempotent fixed point', () => {
  test('normalize(normalize(x)) is byte-identical to normalize(x)', () => {
    const input = '---\ntitle: Hello\nslug: hello\n---\n# Hi\n\nBody text.\n';
    const r1 = normalizeToNcm(input, 'markdown');
    const r2 = normalizeToNcm(r1.content, 'ncm');
    expect(r2.content).toBe(r1.content);
    // and a third pass stays put
    expect(normalizeToNcm(r2.content, 'ncm').content).toBe(r1.content);
  });

  test('frontmatter-less markdown gains a frontmatter block, then is stable', () => {
    const r1 = normalizeToNcm('# Just a body\n\nno frontmatter\n', 'markdown');
    expect(r1.content).toContain('ncmVersion');
    const r2 = normalizeToNcm(r1.content, 'ncm');
    expect(r2.content).toBe(r1.content);
  });
});

describe('NCM ncmVersion stamping', () => {
  test('absent → stamped with NCM_VERSION', () => {
    const r = normalizeToNcm('---\ntitle: X\n---\nbody\n', 'markdown');
    expect(r.ncmVersion).toBe(NCM_VERSION);
    expect(matter(r.content).data.ncmVersion).toBe(NCM_VERSION);
  });

  test('present and current → preserved', () => {
    const r = normalizeToNcm(`---\nncmVersion: ${NCM_VERSION}\ntitle: X\n---\nb\n`, 'ncm');
    expect(r.ncmVersion).toBe(NCM_VERSION);
  });

  test('present but different → preserved verbatim (no silent migration)', () => {
    const r = normalizeToNcm('---\nncmVersion: 2\ntitle: X\n---\nb\n', 'ncm');
    expect(r.ncmVersion).toBe(2);
    expect(matter(r.content).data.ncmVersion).toBe(2);
  });
});

describe('NCM deterministic frontmatter order', () => {
  test('keys are emitted sorted, regardless of input order', () => {
    const a = normalizeToNcm('---\ntitle: T\nauthor: A\nslug: s\n---\nb\n', 'markdown');
    const b = normalizeToNcm('---\nslug: s\nauthor: A\ntitle: T\n---\nb\n', 'markdown');
    expect(a.content).toBe(b.content);
    const keys = Object.keys(matter(a.content).data);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('NCM dropped-content placeholder (§3.3)', () => {
  test('formatter produces the fixed single-line form', () => {
    expect(formatDroppedPlaceholder('iframe', 'raw HTML not permitted'))
      .toBe('> ⚠️ NCM-DROPPED [iframe]: raw HTML not permitted');
  });

  test('tag/reason newlines flattened to keep it one line', () => {
    const p = formatDroppedPlaceholder('script\n', 'multi\nline\nreason');
    expect(p.split('\n')).toHaveLength(1);
    expect(isDroppedPlaceholderLine(p)).toBe(true);
  });

  test('recogniser matches its own output and rejects others', () => {
    expect(isDroppedPlaceholderLine(formatDroppedPlaceholder('img', 'over size cap'))).toBe(true);
    expect(isDroppedPlaceholderLine('> a normal blockquote')).toBe(false);
    expect(isDroppedPlaceholderLine('NCM-DROPPED [x]: y')).toBe(false);
  });

  test('a body containing a placeholder round-trips byte-identical', () => {
    const ph = formatDroppedPlaceholder('iframe', 'raw HTML not permitted');
    const doc = `---\ntitle: P\n---\nBefore.\n\n${ph}\n\nAfter.\n`;
    const r1 = normalizeToNcm(doc, 'markdown');
    const r2 = normalizeToNcm(r1.content, 'ncm');
    expect(r2.content).toBe(r1.content);
    expect(r1.content).toContain(ph);
  });
});
