#!/usr/bin/env tsx
/**
 * One-shot follow-up to migrate-docs-frontmatter.ts (#660): replace
 * descriptions that the auto-extractor pulled from metadata labels
 * (e.g. "Module: src/managers/Foo.ts", "Quick Reference | Complete Guide",
 * "Version: 1.3.2") with real one-line descriptions hand-written from
 * each module's purpose.
 *
 * Idempotent: only rewrites the `description:` line; leaves everything
 * else intact. Run once and delete; kept in scripts/ as a record of which
 * descriptions were chosen.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

const DESCRIPTIONS: Record<string, string> = {
  // Managers
  'docs/managers/ACLManager.md': 'Per-page access control: private/author-lock/audience/role-policy evaluation via the canonical wikiContext.canAccess facade',
  'docs/managers/AssetService.md': 'Unified DAM search facade over the AssetProvider registry; called by SearchManager and the asset-picker',
  'docs/managers/AttachmentManager.md': 'File attachment CRUD: upload, lookup-by-filename, per-page attachment listings, SHA-256 deduplication',
  'docs/managers/BackupManager.md': 'System-wide backup and restore — pages, attachments, config, search indices',
  'docs/managers/BaseManager.md': 'Abstract base class for all managers — engine wiring, lifecycle hooks, config accessor pattern',
  'docs/managers/CacheManager.md': 'Centralized cache facade with pluggable backends (NodeCache, Redis, Null) and named regions per consumer',
  'docs/managers/ConfigurationManager.md': 'Loads and merges app-default-config.json + app-custom-config.json; the single source of truth for runtime config',
  'docs/managers/ExportManager.md': 'Per-page export to HTML or Markdown with frontmatter stripping and link rewriting',
  'docs/managers/MediaManager.md': 'Read-only external photo/video library (filesystem-backed) with EXIF indexing and keyword facets',
  'docs/managers/MetricsManager.md': 'OpenTelemetry-backed metrics: route latency histograms, engine init timing, cache hit ratios',
  'docs/managers/NotificationManager.md': 'System and per-user notifications — toast popups, persistent inbox, scheduled expiry',
  'docs/managers/PluginManager.md': 'Plugin discovery, registration, and execution; resolves `[{PluginName ...}]` markup to handler output',
  'docs/managers/PolicyEvaluator.md': 'Tier-2 of ACLManager — evaluates role/permission policies against principals and resources',
  'docs/managers/PolicyManager.md': 'Policy CRUD and lookup — manages the role/permission ruleset that PolicyEvaluator applies',
  'docs/managers/PolicyValidator.md': 'Schema validation for policy definitions; runs at startup to refuse malformed policies',
  'docs/managers/RenderingManager.md': 'Markdown + JSPWiki-style markup rendering pipeline; orchestrates handlers and plugin invocation',
  'docs/managers/SchemaManager.md': 'JSON Schema registration and validation for typed entities (Person, Organization, etc.)',
  'docs/managers/SearchManager.md': 'Full-text page search with pluggable backends (Lunr in-process, Elasticsearch); also drives the asset-picker',
  'docs/managers/TemplateManager.md': 'Page templates for /create and theme-driven layout templates for /view',
  'docs/managers/UserManager.md': 'User CRUD, sessions, authentication, profile-page binding, contact-recipient resolution',
  // Providers
  'docs/providers/BaseMediaProvider.md': 'Abstract base class for asset/media providers — defines the AssetService-facing interface',
  'docs/providers/BasicAttachmentProvider.md': 'File-system attachment storage with SHA-256-content-addressed dedup and per-page listings',
  'docs/providers/ElasticsearchSearchProvider.md': 'Elasticsearch backend for SearchManager — full-text and (optionally) vector search over pages',
  'docs/providers/AssetProvider-Guide.md': 'Implementation guide for plugin authors building a new AssetProvider backend',
  'docs/providers/FileSystemMediaProvider.md': 'Read-only filesystem media library with EXIF parsing and keyword facets; the default MediaManager backend',
  'docs/providers/FileUserProvider.md': 'JSON-file user, role, and session storage — the default UserManager backend',
  'docs/providers/VersioningFileProvider.md': 'File-based page storage with delta-compressed version history; the default PageManager backend',
  // Followup: replace remaining truncated 200-char extracts with concise one-liners
  'docs/managers/AuditManager.md': 'Audit trail logging: security events, access decisions, policy evaluations, with pluggable Audit*Provider backends',
  'docs/managers/ValidationManager.md': 'Central data-integrity enforcement: UUID-based naming, YAML frontmatter validation, slug-conflict detection',
  'docs/managers/VariableManager.md': 'Variable expansion in content — `[{$pagename}]`, `[{$applicationname}]`, custom user variables (JSPWiki-compatible)',
  'docs/plugins/RecentChangesPlugin.md': 'Lists recent page changes in chronological order for "what changed lately" feeds',
  'docs/plugins/ConfigAccessorPlugin.md': 'Renders configuration values inside pages — roles, features, manager settings, arbitrary config properties',
  'docs/plugins/CounterPlugin.md': 'Page-render-scoped counters: increment in place to number items or track invocations within a single render',
  'docs/plugins/LocationPlugin.md': 'Renders a location as a map link or embedded map preview; supports multiple map providers + coordinates or place names',
  'docs/plugins/VariablesPlugin.md': 'Displays the system + contextual variables available in the current render (admin/debugging aid)',
  'docs/plugins/UserLookupPlugin.md': 'Searches users via the asset-search API and renders results as a sortable table (PII gated server-side)'
};

let changed = 0;
let unchanged = 0;
for (const [relPath, desc] of Object.entries(DESCRIPTIONS)) {
  const absPath = path.join(REPO_ROOT, relPath);
  if (!existsSync(absPath)) {
    console.log(`  ! ${relPath} — file not found, skipping`);
    continue;
  }
  const content = readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');
  // Find the description: line in the first frontmatter block.
  let inFm = false;
  let fmEnd = -1;
  let descLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '---') {
      if (!inFm) inFm = true;
      else { fmEnd = i; break; }
    } else if (inFm && lines[i].startsWith('description:')) {
      descLineIdx = i;
    }
  }
  if (descLineIdx === -1 || fmEnd === -1) {
    console.log(`  ! ${relPath} — no description: line in frontmatter, skipping`);
    continue;
  }
  // YAML scalar quoting: prefer single-quotes if the description has none,
  // otherwise leave bare (we control the inputs above, none have quotes).
  const needsQuote = /[:#[\]{}&*!|>'"%@`,]/.test(desc) || /^\s|\s$/.test(desc);
  const newLine = needsQuote
    ? `description: ${JSON.stringify(desc)}`
    : `description: ${desc}`;
  if (lines[descLineIdx] === newLine) {
    unchanged++;
    continue;
  }
  lines[descLineIdx] = newLine;
  if (!DRY_RUN) {
    writeFileSync(absPath, lines.join('\n'), 'utf-8');
  }
  console.log(`  ${DRY_RUN ? '~' : '✓'} ${relPath}`);
  changed++;
}

console.log('');
console.log(`Summary: ${changed} updated, ${unchanged} already correct`);
if (DRY_RUN) console.log('(dry run — no files written)');
