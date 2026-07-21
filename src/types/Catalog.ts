/**
 * Catalog type definitions for CatalogManager (#424).
 *
 * CatalogTerm — a single controlled-vocabulary entry with optional Linked-Data URI.
 * CatalogProvider — interface implemented by DefaultCatalogProvider, addon providers,
 *                   and the AICatalogProvider stub.
 */

/**
 * A single term in the controlled vocabulary.
 */
export interface CatalogTerm {
  /** Canonical machine-readable key (e.g. 'geology', 'draft') */
  term: string;
  /** Human-readable display label */
  label: string;
  /** Optional Linked-Data URI — e.g. https://www.wikidata.org/wiki/Q1069 */
  uri?: string;
  /** Provenance — 'config' | 'wikidata' | 'lcsh' | 'getty-aat' | 'usgs' etc. */
  source?: string;
  /** Human-readable description (#894 — SKOS skos:definition candidate) */
  description?: string;
  /** Semantic category of the term */
  category?: 'content-type' | 'workflow-status' | 'subject' | 'access' | 'general' | 'status' | 'provenance';
  /** True if this is the default term for its category */
  default?: boolean;
  /** False to hide the term from pickers without deleting it from config */
  enabled?: boolean;
}

/**
 * Interface for all catalog providers — both built-in and addon-contributed.
 *
 * Addon registration pattern:
 * ```ts
 * const catalog = engine.getManager<CatalogManager>('CatalogManager');
 * if (catalog) catalog.registerProvider(new MyDomainCatalogProvider());
 * ```
 */
export interface CatalogProvider {
  /** Unique identifier for the provider */
  id: string;
  /** Human-readable name shown in admin UIs */
  displayName: string;
  /**
   * Optional domain scope — e.g. 'geoscience', 'medicine'.
   * When set, CatalogManager.getTerms(domain) will only include this provider
   * when the requested domain matches.
   */
  domain?: string;
  /** Return the terms this provider owns or manages */
  getTerms(): Promise<CatalogTerm[]>;
  /**
   * Resolve a term string to a canonical Linked-Data URI.
   * Return null if this provider does not know the term.
   */
  resolveUri?(term: string): Promise<string | null>;
  /**
   * Suggest terms from the controlled vocabulary for the given page content.
   * Only meaningful for AI/ML providers — static providers return [].
   */
  suggestTerms?(content: string, title: string): Promise<CatalogTerm[]>;
}
