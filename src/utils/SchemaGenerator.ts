/**
 * SchemaGenerator — narrow JSON-LD generation for Organization + Person.
 *
 * **History:** previously this module also generated page-render JSON-LD
 * (Article / WebPage / TechArticle / DigitalDocumentPermissions). That path
 * was confirmed dead during #792 Phase 1 — `pageSchema` / `siteSchema`
 * template hooks in views/header.ejs were never assigned by any route
 * handler, and the legacy class methods on WikiRoutes that would have
 * populated them had no callers. The unified `pageToArticle → articleToPageJsonLd
 * → buildPageJsonLd` pipeline (#773) has been the single live page-render
 * path since before this scope-narrow, and #791 ships the config-driven
 * @type per system-category on top of that pipeline.
 *
 * This file is now intentionally minimal: only `generateOrganizationSchema`,
 * `generatePersonSchema`, and `generateScriptTag` remain, used by the admin
 * org/person detail-page renders at `src/routes/WikiRoutes.ts` (search for
 * `SchemaGenerator.generateOrganizationSchema` / `generatePersonSchema`).
 * If a future feature needs a generic JSON-LD render helper, prefer
 * extending the unified pipeline; do not re-grow this file.
 */

interface SchemaOptions {
  baseUrl?: string;
}

interface PersonData {
  identifier?: string;
  authentication?: unknown;
  [key: string]: unknown;
}

interface OrganizationData {
  url?: string;
  [key: string]: unknown;
}

class SchemaGenerator {
  /**
   * Generate Person JSON-LD from a Schema.org-shaped Person record. The
   * `authentication` field (if present) is stripped — never publish secrets.
   * Adds `url` when missing and `options.baseUrl` is supplied.
   */
  static generatePersonSchema(personData: PersonData, options: SchemaOptions = {}): Record<string, unknown> {
    const { authentication: _authentication, ...publicPerson } = personData;
    if (!publicPerson.url && options.baseUrl) {
      publicPerson.url = `${options.baseUrl}/person/${personData.identifier}`;
    }
    return publicPerson;
  }

  /**
   * Generate Organization JSON-LD from a Schema.org-shaped Organization
   * record. Adds `url` when missing and `options.baseUrl` is supplied.
   */
  static generateOrganizationSchema(organizationData: OrganizationData, options: SchemaOptions = {}): Record<string, unknown> {
    const organization = { ...organizationData };
    if (!organization.url && options.baseUrl) {
      organization.url = options.baseUrl;
    }
    return organization;
  }
}

export default SchemaGenerator;
