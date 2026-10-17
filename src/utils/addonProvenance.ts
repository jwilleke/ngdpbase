/**
 * Sigstore provenance of an npm add-on (#1830, decided on #1810): before an
 * add-on is installed, its SLSA provenance attestation must be valid for the
 * exact tarball and name the repository the site expects it to be built from.
 *
 * The registry serves a package's attestations at `dist.attestations.url`.
 * The SLSA one is a Sigstore bundle: a DSSE envelope around an in-toto
 * statement, signed with a short-lived Fulcio certificate issued to the CI
 * workflow that built it, and logged in Rekor. Verification here:
 *
 * - the bundle verifies against the Sigstore trusted root (Fulcio chain,
 *   transparency log, timestamps), with `@sigstore/verify`;
 * - the certificate's identity is a workflow of the expected repository
 *   (subject alternative name under `https://<repository>/`) and its issuer is
 *   that host's CI (GitHub Actions or GitLab CI);
 * - the statement's subject is this package and version, and its sha512 is
 *   the tarball's.
 *
 * The trusted root is passed in: `sigstoreTrustedRoot.ts` fetches it through
 * the guarded client. Nothing here opens the network.
 */

import { bundleFromJSON } from '@sigstore/bundle';
import { TrustedRoot } from '@sigstore/protobuf-specs';
import { Verifier, toSignedEntity, toTrustMaterial } from '@sigstore/verify';

const SLSA_PREDICATE = /^https:\/\/slsa\.dev\/provenance\//;

/** The CI identity issuer each supported source host's workflows sign with. */
const ISSUERS: Record<string, string> = {
  'github.com': 'https://token.actions.githubusercontent.com',
  'gitlab.com': 'https://gitlab.com'
};

export type ProvenanceResult = { ok: true; repository: string } | { ok: false; reason: string };

/**
 * `github.com/owner/repo` from any of `github.com/owner/repo`,
 * `https://github.com/owner/repo`, `git+https://github.com/owner/repo.git`.
 * Null when it is not host/owner/repo.
 */
export function normaliseRepository(value: string): string | null {
  const stripped = value.trim()
    .replace(/^git\+/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return /^[a-z0-9.-]+\/[a-z0-9._-]+(\/[a-z0-9._-]+)+$/.test(stripped) ? stripped : null;
}

/** The package URL npm puts in the statement's subject. */
export function npmPurl(name: string, version: string): string {
  return `pkg:npm/${name.replace(/^@/, '%40')}@${version}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Statement {
  subject?: Array<{ name?: string; digest?: { sha512?: string } }>;
}

/**
 * Check the attestations the registry returned for `name@version` against the
 * tarball's sha512 (hex) and the expected repository.
 */
export function verifyProvenance(input: {
  attestations: unknown;
  name: string;
  version: string;
  sha512Hex: string;
  repository: string;
  trustedRoot: unknown;
}): ProvenanceResult {
  const repository = normaliseRepository(input.repository);
  if (!repository) return { ok: false, reason: `'${input.repository}' is not a repository (host/owner/repo)` };
  const host = repository.split('/')[0];
  const issuer = ISSUERS[host];
  if (!issuer) return { ok: false, reason: `provenance from ${host} is not supported (only ${Object.keys(ISSUERS).join(', ')})` };

  const list = (input.attestations as { attestations?: Array<{ predicateType?: string; bundle?: unknown }> } | null)?.attestations;
  const slsa = Array.isArray(list) ? list.find((a) => typeof a.predicateType === 'string' && SLSA_PREDICATE.test(a.predicateType)) : undefined;
  if (!slsa?.bundle) return { ok: false, reason: `${input.name}@${input.version} has no SLSA provenance attestation` };

  try {
    const bundle = bundleFromJSON(slsa.bundle);
    if (bundle.content.$case !== 'dsseEnvelope') return { ok: false, reason: 'the provenance attestation is not a signed statement' };

    const verifier = new Verifier(toTrustMaterial(TrustedRoot.fromJSON(input.trustedRoot)));
    verifier.verify(toSignedEntity(bundle), {
      subjectAlternativeName: new RegExp(`^https://${escapeRegExp(repository)}/`, 'i'),
      extensions: { issuer }
    });

    const statement = JSON.parse(bundle.content.dsseEnvelope.payload.toString('utf8')) as Statement;
    const purl = npmPurl(input.name, input.version);
    const subject = statement.subject?.find((s) => s.name === purl);
    if (!subject) return { ok: false, reason: `the provenance attestation is not for ${purl}` };
    if (subject.digest?.sha512?.toLowerCase() !== input.sha512Hex.toLowerCase()) {
      return { ok: false, reason: 'the provenance attestation is for a different tarball (sha512 differs)' };
    }
    return { ok: true, repository };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `the provenance attestation does not verify for ${repository}: ${message}` };
  }
}
