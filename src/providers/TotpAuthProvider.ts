/**
 * TOTP — an authenticator app's six-digit code (#421), on `otpauth` (decided
 * on #1523, 2026-10-31).
 *
 * - A second factor only (`primary: false`): something you have, `amr`
 *   `otp`, AAL1 on its own. After a password the sign-in covers two factor
 *   types and AuthManager's `assess()` lifts it to AAL2. Not phishing-resistant.
 * - The seed lives in the credentials store (#1524), kind `totp`, AES-GCM
 *   encrypted under a subkey of `NGDPBASE_CREDENTIALS_KEY`
 *   (`utils/totpSeedCipher`). The row's sealed secret also holds the last time
 *   step used, so a code cannot be used twice in its window.
 * - A code is accepted for the current 30-second step and one step either
 *   side (RFC 6238 §5.2 drift), never for a step at or before the last one used.
 * - Verification for one account runs one at a time, so two requests carrying
 *   the same code cannot both pass before the step is recorded.
 */
import { Secret, TOTP, URI } from 'otpauth';
import type { AuthProvider, AuthResult, AuthVerifyCredentials, FactorDescription } from './BaseAuthProvider.js';
import type { CredentialRecord } from './BaseCredentialsProvider.js';
import { openTotpSecret, sealTotpSecret } from '../utils/totpSeedCipher.js';
import { KeyedSerial } from '../utils/keyedSerial.js';

/** RFC 6238 defaults, which every authenticator app supports. */
const PERIOD = 30;
const DIGITS = 6;
/** Steps either side of now that are accepted. */
export const TOTP_DRIFT_STEPS = 1;

/** What a `totp` row's sealed secret holds. */
interface TotpSecret {
  /** Base32. */
  seed: string;
  /** The last time step a code was accepted for; -1 before the first. */
  lastStep: number;
}

/** The store access AuthManager grants: an account's TOTP rows, and recording a use. */
export interface TotpStoreAccess {
  rows(username: string): CredentialRecord[];
  used(id: string, at: string, secret: string): Promise<void>;
}

/** A new seed, offered while enrolling and kept by the caller until it is confirmed. */
export interface TotpEnrolment {
  /** Base32, for typing into the app by hand. */
  seed: string;
  /** The `otpauth://` URI the QR code carries. */
  uri: string;
}

function totpFor(seed: string, issuer = '', label = ''): TOTP {
  return new TOTP({ issuer, label, algorithm: 'SHA1', digits: DIGITS, period: PERIOD, secret: Secret.fromBase32(seed) });
}

function isCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{6}$/.test(code);
}

function currentStep(now: number): number {
  return Math.floor(now / 1000 / PERIOD);
}

/**
 * The time step `code` belongs to within the drift window, or null. Pure; the
 * caller decides about replay.
 */
export function matchingStep(seed: string, code: string, now: number): number | null {
  if (!isCode(code)) return null;
  const delta = totpFor(seed).validate({ token: code, timestamp: now, window: TOTP_DRIFT_STEPS });
  return delta === null ? null : currentStep(now) + delta;
}

export class TotpAuthProvider implements AuthProvider {
  readonly id = 'totp';
  readonly displayName = 'Authenticator app';
  readonly factor: FactorDescription = { amr: ['otp'], aal: 1, primary: false };
  private readonly serial = new KeyedSerial();

  /**
   * @param credentialsKey `NGDPBASE_CREDENTIALS_KEY`, from which the seed key is derived
   * @param issuer         shown in the authenticator app beside the account
   */
  constructor(
    private readonly credentialsKey: string,
    private readonly issuer: string,
    private readonly store: TotpStoreAccess,
    private readonly now: () => number = Date.now
  ) {
    if (!credentialsKey) throw new Error('TOTP needs NGDPBASE_CREDENTIALS_KEY (#421)');
  }

  /** A fresh 160-bit seed and its URI for `username`. Nothing is stored. */
  newEnrolment(username: string): TotpEnrolment {
    const seed = new Secret({ size: 20 }).base32;
    return { seed, uri: URI.stringify(totpFor(seed, this.issuer, username)) };
  }

  /**
   * Seal a seed that is offered but not yet confirmed, so it can wait in the
   * session without being readable there or in a session log (#421). Its own
   * shape, so it never opens as a stored secret.
   */
  sealPending(username: string, seed: string): string {
    return sealTotpSecret(this.credentialsKey, username, JSON.stringify({ pendingSeed: seed }));
  }

  /** Open what `sealPending` made for `username`; null when it is not that. */
  openPending(username: string, sealed: unknown): string | null {
    if (typeof sealed !== 'string') return null;
    const plain = openTotpSecret(this.credentialsKey, username, sealed);
    if (!plain) return null;
    try {
      const p = JSON.parse(plain) as { pendingSeed?: unknown };
      return typeof p.pendingSeed === 'string' ? p.pendingSeed : null;
    } catch {
      return null;
    }
  }

  /**
   * Check the code that confirms an enrolment and seal the seed for the store.
   * The confirming code's step is recorded, so it cannot then sign anyone in.
   * Null when the seed is malformed or the code does not match.
   */
  confirmEnrolment(username: string, seed: string, code: string): string | null {
    let step: number | null;
    try {
      step = matchingStep(seed, code, this.now());
    } catch {
      return null; // not base32
    }
    if (step === null) return null;
    return sealTotpSecret(this.credentialsKey, username, JSON.stringify({ seed, lastStep: step } satisfies TotpSecret));
  }

  /** Verify `credentials.code` for `credentials.username`. A failure gives no reason. */
  async verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null> {
    const { username, code } = credentials;
    if (typeof username !== 'string' || !username || !isCode(code)) return null;
    return this.serial.run(username, async () => {
      const now = this.now();
      for (const row of this.store.rows(username)) {
        const secret = this.open(row);
        if (!secret) continue;
        const step = matchingStep(secret.seed, code, now);
        if (step === null || step <= secret.lastStep) continue;
        const next = sealTotpSecret(this.credentialsKey, username, JSON.stringify({ seed: secret.seed, lastStep: step } satisfies TotpSecret));
        await this.store.used(row.id, new Date(now).toISOString(), next);
        return { username };
      }
      return null;
    });
  }

  private open(row: CredentialRecord): TotpSecret | null {
    if (row.kind !== 'totp') return null;
    const plain = openTotpSecret(this.credentialsKey, row.username, row.secret);
    if (!plain) return null;
    try {
      const s = JSON.parse(plain) as TotpSecret;
      return typeof s.seed === 'string' && typeof s.lastStep === 'number' ? s : null;
    } catch {
      return null;
    }
  }
}
