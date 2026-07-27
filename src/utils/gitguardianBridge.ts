/**
 * @file gitguardianBridge.ts
 * @description GitGuardian → GitHub issue bridge (#811).
 *
 * GitGuardian detects leaked secrets but has **no native "create a GitHub issue
 * per finding" feature** — confirmed during scoping, and the reason this bridge
 * is mandatory rather than a convenience. Incidents otherwise live only in the
 * GitGuardian console, where they are easy to miss and impossible to triage
 * alongside everything else the team tracks.
 *
 * This module is the decision core: given a webhook payload it says what should
 * happen to a GitHub issue. It performs no network I/O, which is what makes the
 * dedup, redaction and signature rules testable without a GitGuardian account —
 * the credentials are the only part of #811 that cannot be built ahead of time.
 *
 * ## The rule that matters most
 *
 * **A rendered issue must never contain the secret.** The whole point is to
 * make a leak visible in a place more people can read, so a bridge that copies
 * the credential into a GitHub issue would widen the leak it exists to report.
 * `renderIssue` takes only the fields it needs and never the match value; there
 * is a test asserting a planted secret does not survive into the output.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Marker embedded in an issue body so re-deliveries find the existing issue. */
export const INCIDENT_MARKER_PREFIX = 'gitguardian-incident:';

/** Events GitGuardian sends that this bridge acts on. */
export type IncidentEvent = 'incident.created' | 'incident.resolved' | 'incident.reopened';

/** The subset of a GitGuardian webhook payload the bridge relies on. */
export interface GitGuardianIncident {
  /** Stable GitGuardian incident id — the dedup key. */
  id: string;
  /** Detector name, e.g. `AWS Keys`. Safe to display. */
  detector: string;
  /** `owner/repo` the leak was found in. */
  repository: string;
  /** Path within the repo, when known. */
  filePath?: string;
  /** Commit sha the occurrence was found in, when known. */
  commitSha?: string;
  /** Link back to the incident in the GitGuardian console. */
  url?: string;
  /** GitGuardian severity, when supplied. */
  severity?: string;
}

/** What the caller should do with the GitHub issue for this incident. */
export type BridgeAction =
  | { kind: 'create'; title: string; body: string; labels: string[] }
  | { kind: 'comment-and-close'; comment: string }
  | { kind: 'reopen'; comment: string }
  | { kind: 'noop'; reason: string };

/**
 * Verify a GitGuardian webhook signature.
 *
 * Compared with `timingSafeEqual` rather than `===`. A string compare leaks the
 * position of the first differing byte through timing, which is enough to forge
 * a signature given patience — and the whole point of this check is that an
 * attacker must not be able to fabricate an incident.
 *
 * @param rawBody - The exact bytes received, before any JSON parsing
 * @param signatureHeader - Value of the signature header, with or without a `sha256=` prefix
 * @param secret - The shared webhook signing secret
 * @returns Whether the signature is valid
 */
export function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;

  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (provided.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    // Non-hex input — malformed, not merely wrong.
    return false;
  }
}

/**
 * Pull the fields the bridge needs out of a webhook payload.
 *
 * Tolerant of shape: GitGuardian nests the incident differently across event
 * types and plan tiers, so both the flat and `{ incident: … }` forms are
 * accepted. Returns null rather than throwing when the payload is unusable —
 * a malformed delivery should be dropped and logged, not crash a receiver that
 * is handling other repos' incidents.
 *
 * @param payload - Parsed webhook JSON
 * @returns The incident, or null when required fields are missing
 */
export function parseIncident(payload: unknown): GitGuardianIncident | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const raw = (root.incident && typeof root.incident === 'object')
    ? root.incident as Record<string, unknown>
    : root;

  const id = str(raw.id) || str(raw.incident_id);
  const repository = resolveRepository(raw);
  if (!id || !repository) return null;

  const occurrence = (raw.occurrence && typeof raw.occurrence === 'object')
    ? raw.occurrence as Record<string, unknown>
    : {};

  return {
    id,
    detector: str(raw.detector) || str((raw.detector_name)) || 'unknown detector',
    repository,
    filePath: str(raw.file_path) || str(occurrence.filepath) || undefined,
    commitSha: str(raw.commit_sha) || str(occurrence.commit_sha) || undefined,
    url: str(raw.incident_url) || str(raw.url) || undefined,
    severity: str(raw.severity) || undefined
  };
}

/**
 * Resolve `owner/repo` from the several shapes GitGuardian uses.
 *
 * A bare repo name with a separate owner field is accepted; a bare name with no
 * owner is rejected, because guessing the owner would file the issue against
 * whichever repo happened to match.
 */
function resolveRepository(raw: Record<string, unknown>): string {
  const direct = str(raw.repository) || str(raw.repository_full_name) || str(raw.source_full_name);
  if (direct.includes('/')) return direct;

  const owner = str(raw.owner) || str(raw.repository_owner);
  const name = direct || str(raw.repository_name) || str(raw.source_name);
  return owner && name ? `${owner}/${name}` : '';
}

/** Coerce an unknown to a trimmed string, or '' when it is not string-like. */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** The hidden marker line that makes an issue findable by incident id. */
export function incidentMarker(incidentId: string): string {
  return `${INCIDENT_MARKER_PREFIX}${incidentId}`;
}

/**
 * Render the GitHub issue for an incident.
 *
 * Takes an explicit field list rather than the whole payload: a redaction rule
 * enforced by *omission* cannot be defeated by GitGuardian adding a new field
 * that happens to carry the match value. Nothing here can print a secret that
 * was never passed in.
 *
 * @param incident - Parsed incident
 * @returns Issue title and body, carrying the dedup marker
 */
export function renderIssue(incident: GitGuardianIncident): { title: string; body: string } {
  const title = `[security] Leaked secret detected — ${incident.detector} in ${incident.repository}`;

  const lines = [
    '## GitGuardian secret-leak incident',
    '',
    `- **Detector:** ${incident.detector}`,
    `- **Repository:** ${incident.repository}`
  ];
  if (incident.filePath) lines.push(`- **File:** \`${incident.filePath}\``);
  if (incident.commitSha) lines.push(`- **Commit:** \`${incident.commitSha}\``);
  if (incident.severity) lines.push(`- **Severity:** ${incident.severity}`);
  if (incident.url) lines.push(`- **Incident:** ${incident.url}`);

  lines.push(
    '',
    '> The credential itself is deliberately **not** reproduced here. This issue',
    '> exists to make the leak visible to more people, so repeating the secret in',
    '> it would widen the exposure it reports. Open the GitGuardian incident for',
    '> the match.',
    '',
    '### What to do',
    '',
    '1. **Revoke and rotate the credential** — assume it is compromised the moment it was committed.',
    '2. Remove it from the code path so a rotated value is not committed next time.',
    '3. Resolve the incident in GitGuardian; this issue closes automatically.',
    '',
    '<!-- Managed by the GitGuardian bridge (#811). Do not edit the line below. -->',
    incidentMarker(incident.id)
  );

  return { title, body: lines.join('\n') };
}

/**
 * Decide what to do, given an event and whether an issue already exists.
 *
 * Dedup is by GitGuardian incident id, not by title: the same credential can
 * leak in several files, and two incidents that render the same title are still
 * two incidents. Re-delivery is expected — webhooks retry — so a repeat of
 * `incident.created` must comment, never open a second issue.
 *
 * @param event - The webhook event type
 * @param incident - Parsed incident
 * @param existing - The matching issue, when one was found by marker
 * @returns The action to perform
 */
export function decideAction(
  event: string,
  incident: GitGuardianIncident,
  existing: { number: number; state: 'open' | 'closed' } | null
): BridgeAction {
  switch (event) {
  case 'incident.created': {
    if (!existing) {
      const { title, body } = renderIssue(incident);
      return { kind: 'create', title, body, labels: ['security', 'secret-leak'] };
    }
    if (existing.state === 'closed') {
      return {
        kind: 'reopen',
        comment: `GitGuardian re-reported incident \`${incident.id}\` after this issue was closed.`
      };
    }
    return { kind: 'noop', reason: `issue #${existing.number} already open for incident ${incident.id}` };
  }

  case 'incident.resolved': {
    if (!existing) {
      // Resolved before we ever saw it created — nothing to close, and
      // opening an issue just to close it is noise.
      return { kind: 'noop', reason: `no issue tracks incident ${incident.id}` };
    }
    if (existing.state === 'closed') {
      return { kind: 'noop', reason: `issue #${existing.number} already closed` };
    }
    return {
      kind: 'comment-and-close',
      comment: `Resolved in GitGuardian (incident \`${incident.id}\`). Closing.`
    };
  }

  case 'incident.reopened': {
    if (!existing) {
      const { title, body } = renderIssue(incident);
      return { kind: 'create', title, body, labels: ['security', 'secret-leak'] };
    }
    if (existing.state === 'open') {
      return { kind: 'noop', reason: `issue #${existing.number} already open` };
    }
    return {
      kind: 'reopen',
      comment: `Reopened in GitGuardian (incident \`${incident.id}\`).`
    };
  }

  default:
    return { kind: 'noop', reason: `unhandled event '${event}'` };
  }
}

/**
 * Build the GitHub issue-search query that finds an incident's existing issue.
 *
 * Searches the marker rather than the title, for the reason in `decideAction`.
 * Includes closed issues, since a re-report has to find a closed one to reopen.
 *
 * @param repository - `owner/repo`
 * @param incidentId - GitGuardian incident id
 */
export function buildSearchQuery(repository: string, incidentId: string): string {
  return `repo:${repository} in:body "${incidentMarker(incidentId)}"`;
}
