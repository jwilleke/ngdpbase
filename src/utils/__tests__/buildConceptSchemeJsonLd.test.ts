/**
 * Slice 6c of #760 (#767) — unit tests for the SKOS ConceptScheme emitter.
 */

import { buildConceptSchemeJsonLd } from '../buildConceptSchemeJsonLd';
import type { CatalogTerm } from '../../types/Catalog';

describe('buildConceptSchemeJsonLd()', () => {
  it('emits the canonical SKOS ConceptScheme shape', () => {
    const out = buildConceptSchemeJsonLd('default', 'Default Catalog Provider', [
      { term: 'geology', label: 'Geology' },
      { term: 'biology', label: 'Biology', uri: 'https://www.wikidata.org/wiki/Q420' }
    ]);
    expect(out['@context']).toBe('http://www.w3.org/2004/02/skos/core');
    expect(out['@type']).toBe('ConceptScheme');
    expect(out['@id']).toBe('/api/catalog/vocabulary/default');
    expect(out.prefLabel).toBe('Default Catalog Provider');
    expect(out.hasTopConcept).toHaveLength(2);

    const geology = out.hasTopConcept[0];
    expect(geology).toEqual({
      '@type': 'Concept',
      '@id': '/api/catalog/vocabulary/default/geology',
      notation: 'geology',
      prefLabel: 'Geology',
      inScheme: '/api/catalog/vocabulary/default'
    });
    // term with a URI gets exactMatch
    const biology = out.hasTopConcept[1];
    expect(biology.exactMatch).toBe('https://www.wikidata.org/wiki/Q420');
    expect(biology.notation).toBe('biology');
  });

  it('emits Concept without exactMatch when the term has no uri', () => {
    const out = buildConceptSchemeJsonLd('default', 'D', [{ term: 'foo', label: 'Foo' }]);
    const concept = out.hasTopConcept[0];
    expect(concept.exactMatch).toBeUndefined();
    // Make sure the key isn't even emitted (cleaner JSON-LD output).
    expect(Object.prototype.hasOwnProperty.call(concept, 'exactMatch')).toBe(false);
  });

  it('emits an empty hasTopConcept array for a provider with no terms', () => {
    const out = buildConceptSchemeJsonLd('empty', 'Empty Scheme', []);
    expect(out.hasTopConcept).toEqual([]);
  });

  it('filters out terms with enabled=false', () => {
    const terms: CatalogTerm[] = [
      { term: 'live', label: 'Live' },
      { term: 'dead', label: 'Dead', enabled: false },
      { term: 'explicit-on', label: 'Explicitly On', enabled: true }
    ];
    const out = buildConceptSchemeJsonLd('default', 'D', terms);
    expect(out.hasTopConcept.map(c => c.notation)).toEqual(['live', 'explicit-on']);
  });

  it('uses the baseUrl when provided', () => {
    const out = buildConceptSchemeJsonLd('default', 'D', [{ term: 'a', label: 'A' }], {
      baseUrl: 'https://wiki.example.com'
    });
    expect(out['@id']).toBe('https://wiki.example.com/api/catalog/vocabulary/default');
    expect(out.hasTopConcept[0]['@id']).toBe('https://wiki.example.com/api/catalog/vocabulary/default/a');
    expect(out.hasTopConcept[0].inScheme).toBe('https://wiki.example.com/api/catalog/vocabulary/default');
  });

  it('strips a trailing slash from baseUrl', () => {
    const out = buildConceptSchemeJsonLd('default', 'D', [{ term: 'a', label: 'A' }], {
      baseUrl: 'https://example.com/'
    });
    expect(out['@id']).toBe('https://example.com/api/catalog/vocabulary/default');
  });

  it('URL-encodes the scheme id (some providers use slashes / colons)', () => {
    const out = buildConceptSchemeJsonLd('my:weird/id', 'Weird', [{ term: 'a', label: 'A' }]);
    expect(out['@id']).toBe('/api/catalog/vocabulary/my%3Aweird%2Fid');
    expect(out.hasTopConcept[0].inScheme).toBe('/api/catalog/vocabulary/my%3Aweird%2Fid');
  });

  it('URL-encodes term ids (terms can contain spaces / punctuation)', () => {
    const out = buildConceptSchemeJsonLd('default', 'D', [
      { term: 'has space', label: 'Has Space' },
      { term: 'with/slash', label: 'With Slash' }
    ]);
    expect(out.hasTopConcept[0]['@id']).toBe('/api/catalog/vocabulary/default/has%20space');
    expect(out.hasTopConcept[1]['@id']).toBe('/api/catalog/vocabulary/default/with%2Fslash');
    // notation keeps the raw term (machine key, not URL).
    expect(out.hasTopConcept[0].notation).toBe('has space');
    expect(out.hasTopConcept[1].notation).toBe('with/slash');
  });

  it('preserves order of terms as given by the provider', () => {
    const out = buildConceptSchemeJsonLd('default', 'D', [
      { term: 'z', label: 'Z' },
      { term: 'a', label: 'A' },
      { term: 'm', label: 'M' }
    ]);
    expect(out.hasTopConcept.map(c => c.notation)).toEqual(['z', 'a', 'm']);
  });

  it('round-trips through JSON.stringify / JSON.parse without losing structure', () => {
    const out = buildConceptSchemeJsonLd('default', 'Default', [
      { term: 'geology', label: 'Geology', uri: 'https://example.com/geology' }
    ], { baseUrl: 'https://wiki.example.com' });
    const parsed = JSON.parse(JSON.stringify(out));
    expect(parsed).toEqual(out);
  });
});
