/**
 * The rules about a subject's `viaProxy` that more than one door reads
 * (#1762 slice 2), declared once.
 *
 * The decision itself — the grant still in force, the action in it, the actor
 * holding it — is `PolicyDecisionPoint.ceiling`'s. What lives here is what a
 * door with no decision point to hand needs: the private-container rule
 * (`mayActInPrivateContainer`) and the "does this subject carry a ceiling at
 * all" question the page door and the list filter ask before calling it.
 */
import type { AgentTokenGrant, ProxyClaim } from '../managers/UserManager.js';
import type { ShareGrant } from '../types/Share.js';

/** The delegations a subject may carry, as the rules below read them. */
interface Delegations {
  viaToken?: AgentTokenGrant;
  viaShare?: ShareGrant;
  viaProxy?: ProxyClaim;
}

/**
 * Does this proxy claim carry `permission`? Only a `kind: 'proxy'` claim
 * carries anything: `impersonation` is reserved for #1763 and admits nothing.
 *
 * Read for a permission the grant carries as a marker rather than one policy
 * is asked: `vault-proxy`, which lets the proxy into the represented person's
 * private container (`mayActInPrivateContainer`). Without it a proxy acts on
 * everything else the grant allows and never reaches a vault; encrypted vaults
 * stay shut either way until the proxy holds a wrapped key copy (slice 5).
 */
export function proxyCarries(claim: ProxyClaim | undefined, permission: string): boolean {
  return claim?.kind === 'proxy' && Array.isArray(claim.scopes) && claim.scopes.includes(permission);
}

/**
 * A subject acting for someone AND carrying an agent token or a share link.
 * Never built legitimately (an agent-token request can never act for anyone),
 * so every door refuses it rather than deciding which ceiling wins.
 */
export function mixesProxyWithDelegation(subject: Delegations | null | undefined): boolean {
  return Boolean(subject?.viaProxy && (subject.viaToken || subject.viaShare));
}

/** Does the subject carry any delegation the PDP's ceiling bounds — a token, a share, or a proxy claim? */
export function carriesCeiling(subject: Delegations | null | undefined): boolean {
  return Boolean(subject?.viaToken || subject?.viaShare || subject?.viaProxy);
}

/**
 * What a proxy claim adds to an audit record (#1762 slice 3), declared once.
 *
 * Operator decision: a row for something done under a proxy grant names the
 * represented person in `user` — the account acted on, as with agent tokens —
 * and the person who actually did it in a separate top-level `actor`, which
 * the audit search filters on. The grant's id goes in the metadata so the row
 * joins to the `proxy-grant` record that allowed it. A row with no proxy claim
 * gets neither: `actor` is absent, never a copy of `user`.
 *
 * Every builder of an audit row's "who" reads this — `actorOf` for a request
 * subject, `attributedTo` for a job, `PolicyInformationPoint.auditDenial` for a
 * subject that may be anonymous, and the content builders in `auditEvents.ts`.
 */
export interface ProxyAttribution {
  /** The person who acted; present only under a proxy claim. */
  actor?: string;
  /** `delegated` (the claim's kind) and `proxyGrantId`; empty without a claim. */
  metadata: Record<string, unknown>;
}

export function proxyAttribution(claim: ProxyClaim | null | undefined): ProxyAttribution {
  if (!claim) return { metadata: {} };
  return { actor: claim.actor, metadata: { delegated: claim.kind, proxyGrantId: claim.grantId } };
}
