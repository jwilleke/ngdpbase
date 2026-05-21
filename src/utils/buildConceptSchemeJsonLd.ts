/**
 * Slice 6c of #760 (#767) — SKOS ConceptScheme JSON-LD emitter.
 *
 * Renders a CatalogManager provider's terms as a W3C SKOS ConceptScheme.
 * Consumers: linked-data crawlers, knowledge-graph aggregators, the JSON-LD
 * playground for human inspection.
 *
 * Per Decision 8 of #755 (2026-05-20): "Vocabulary terms align with SKOS
 * (altLabels, broader/narrower, exactMatch/closeMatch, ConceptScheme JSON-LD
 * emission)." This slice ships the emission half. The hierarchical fields
 * (broader/narrower) and the alt/closeMatch fields require a richer
 * `CatalogTerm` shape than the current type carries — that's a follow-up
 * schema-extension. Today's mapping is `prefLabel` ← `term.label`,
 * `notation` ← `term.term`, `exactMatch` ← `term.uri` (when present).
 *
 * The W3C SKOS context (`http://www.w3.org/2004/02/skos/core`) is used as-is
 * without a wrapping `@context` array — JSON-LD playground / consumers
 * resolve the canonical SKOS vocabulary from that single URI.
 */

import type { CatalogTerm } from '../types/Catalog.js';

/** A single SKOS Concept rendered inside `hasTopConcept`. */
export interface SkosConcept {
  '@type': 'Concept';
  '@id': string;
  notation: string;
  prefLabel: string;
  inScheme: string;
  /** Linked-Data URI for the term (Wikidata, LCSH, etc.) — when configured. */
  exactMatch?: string;
}

/** A SKOS ConceptScheme. */
export interface SkosConceptScheme {
  '@context': 'http://www.w3.org/2004/02/skos/core';
  '@type': 'ConceptScheme';
  '@id': string;
  prefLabel: string;
  hasTopConcept: SkosConcept[];
}

export interface BuildConceptSchemeOptions {
  /**
   * Canonical base URL (e.g. `https://wiki.example.com`). When omitted, the
   * scheme + concept `@id`s use the relative-path form
   * `/api/catalog/vocabulary/<scheme>` — still valid JSON-LD (relative IRI).
   */
  baseUrl?: string;
}

/**
 * Build the SKOS ConceptScheme JSON-LD shape for a given vocabulary provider.
 *
 * @param schemeId       The CatalogProvider id (e.g. `default`, addon ids).
 * @param displayName    Human-readable scheme name (used as `prefLabel`).
 * @param terms          The provider's terms — typically `provider.getTerms()`.
 * @param options.baseUrl Canonical base URL; when empty, relative `@id`s.
 */
export function buildConceptSchemeJsonLd(
  schemeId: string,
  displayName: string,
  terms: CatalogTerm[],
  options: BuildConceptSchemeOptions = {}
): SkosConceptScheme {
  const base = options.baseUrl?.replace(/\/$/, '') ?? '';
  const schemeIdEnc = encodeURIComponent(schemeId);
  const schemeUri = `${base}/api/catalog/vocabulary/${schemeIdEnc}`;

  // Filter out explicitly-disabled terms (defensive — providers should already
  // skip these, but the type allows enabled=false to pass through).
  const liveTerms = terms.filter(t => t.enabled !== false);

  const hasTopConcept: SkosConcept[] = liveTerms.map(t => {
    const termIdEnc = encodeURIComponent(t.term);
    const concept: SkosConcept = {
      '@type': 'Concept',
      '@id': `${schemeUri}/${termIdEnc}`,
      notation: t.term,
      prefLabel: t.label,
      inScheme: schemeUri
    };
    if (t.uri) concept.exactMatch = t.uri;
    return concept;
  });

  return {
    '@context': 'http://www.w3.org/2004/02/skos/core',
    '@type': 'ConceptScheme',
    '@id': schemeUri,
    prefLabel: displayName,
    hasTopConcept
  };
}
