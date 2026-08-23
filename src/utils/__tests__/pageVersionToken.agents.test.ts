import { describe, it, expect } from 'vitest';
import { isStaleSave, versionTokenOf } from '../pageVersionToken.js';

/**
 * #1081 — optimistic concurrency existed but only for the browser form, which
 * submits `baseLastModified` as a hidden field. `mcp-server.ts` and
 * `POST /api/page/ingest` never sent one, so every agent write was
 * last-writer-wins: an agent that read a page, thought for a while, and wrote
 * it back silently discarded whatever a human wrote in between.
 *
 * These pin the semantics the two agent surfaces now rely on. The
 * `isStaleSave` contract itself is deliberately permissive — a missing token
 * means "not participating", not "stale" — and that is exactly what keeps the
 * feature optional and existing ingest scripts working.
 */
describe('isStaleSave — the contract the agent surfaces depend on', () => {
  const CURRENT = '2026-08-23T12:00:00.000Z';
  const STALE = '2026-08-20T09:00:00.000Z';

  it('is not stale when the submitted token matches the current one', () => {
    expect(isStaleSave(CURRENT, CURRENT)).toBe(false);
  });

  it('is stale when the page moved on after the caller read it', () => {
    expect(isStaleSave(STALE, CURRENT)).toBe(true);
  });

  it('is NOT stale when the caller sent no token — this is what keeps #1081 optional', () => {
    // Every pre-existing ingest script and MCP client falls through here.
    // Making a missing token stale would have been a breaking change to every
    // programmatic writer at once.
    expect(isStaleSave(null, CURRENT)).toBe(false);
    expect(isStaleSave(undefined, CURRENT)).toBe(false);
  });

  it('is not stale when the page has no token to compare against', () => {
    // A page whose frontmatter carries no lastModified cannot be shown to
    // have changed, so refusing the write would block it forever.
    expect(isStaleSave(CURRENT, null)).toBe(false);
  });
});

describe('versionTokenOf — what the agent surfaces hand back on conflict', () => {
  it('reads lastModified from page metadata', () => {
    expect(versionTokenOf({ lastModified: '2026-08-23T12:00:00.000Z' })).toBe('2026-08-23T12:00:00.000Z');
  });

  it('normalises a YAML Date to the same string a caller would echo back', () => {
    // gray-matter parses an unquoted frontmatter timestamp into a Date, while
    // an agent echoes back the ISO string it was given. Without normalisation
    // those two never compare equal and every conditional write would 409.
    const asDate = versionTokenOf({ lastModified: new Date('2026-08-23T12:00:00.000Z') });
    const asString = versionTokenOf({ lastModified: '2026-08-23T12:00:00.000Z' });
    expect(asDate).toBe(asString);
  });

  it('round-trips: a token read from a page is never stale against that page', () => {
    const metadata = { lastModified: new Date('2026-08-23T12:00:00.000Z') };
    const token = versionTokenOf(metadata);
    expect(isStaleSave(token, versionTokenOf(metadata))).toBe(false);
  });

  it('returns null for metadata with no lastModified', () => {
    expect(versionTokenOf({})).toBeNull();
  });

  it('returns null for absent metadata', () => {
    expect(versionTokenOf(null)).toBeNull();
    expect(versionTokenOf(undefined)).toBeNull();
  });
});
