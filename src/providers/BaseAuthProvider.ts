/**
 * BaseAuthProvider — pluggable authentication provider interface.
 *
 * All authentication methods (password, magic link, OAuth, etc.) implement
 * this interface and are registered with AuthManager, which dispatches
 * initiate/verify calls to the appropriate provider.
 *
 * Pattern mirrors BasePageProvider / BaseAttachmentProvider / BaseMediaProvider.
 *
 * @see AuthManager
 * @see PasswordAuthProvider
 * @see MagicLinkAuthProvider
 */

/**
 * Context passed to initiate() for challenge-based auth flows.
 *
 * Note: providers that emit absolute URLs (magic-link verify links,
 * OAuth callbacks) read the canonical base URL from ConfigurationManager
 * at runtime — callers don't pass it in (#642 Iteration 3).
 */
export interface AuthInitiateContext {
  /** Email address (magic link) */
  email?: string;
  /** URL to redirect to after successful authentication */
  redirect?: string;
}

/**
 * Credentials passed to verify(). Fields used depend on the provider.
 */
export interface AuthVerifyCredentials {
  /** Username — used by PasswordAuthProvider */
  username?: string;
  /** Password — used by PasswordAuthProvider */
  password?: string;
  /** One-time token — used by MagicLinkAuthProvider */
  token?: string;
}

/**
 * Identity and authority of a delegated agent token (#946).
 *
 * Roles are deliberately absent: they are resolved live from the user record,
 * so a token never carries a snapshot of authority that could outlive a change
 * to the account.
 */
export interface ViaToken {
  /** Token record id */
  id: string;
  /** Human-readable token name, used in logs and page provenance */
  name: string;
  /** Scope ceiling this token may act within */
  scopes: string[];
}

/**
 * Returned by verify() on success.
 */
export interface AuthResult {
  /** Username of the authenticated user */
  username: string;

  /**
   * Set by token-based providers (#946, #1048). Lets the caller enforce the
   * token's scope ceiling and stamp page provenance.
   *
   * Declared here rather than read through a cast in AuthManager: the manager
   * always passed this field along, but `AuthResult` did not admit it existed,
   * so a provider that misspelled it or typed `scopes` wrongly still compiled
   * and silently delivered nothing.
   */
  viaToken?: ViaToken;
}

/**
 * Interface all authentication providers must implement.
 */
export interface AuthProvider {
  /** Unique identifier, e.g. 'password', 'magic-link', 'oauth-google' */
  readonly id: string;

  /** Human-readable name shown in admin UIs */
  readonly displayName: string;

  /**
   * Initiate a challenge-based auth flow.
   * Called for flows that require a side-effect before verification
   * (e.g. send a magic-link email, start an OAuth redirect).
   * Credential-based providers (password) do not need to implement this.
   */
  initiate?(context: AuthInitiateContext): Promise<void>;

  /**
   * Verify credentials or a token.
   * @returns AuthResult on success, null on failure.
   */
  verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null>;

  /**
   * Consume a single-use token after a session has been created.
   * Only needed for token-based providers (magic link, OAuth).
   */
  /**
   * Consume a single-use token, returning whether this caller consumed it.
   *
   * #1021: callers gate session creation on the return value — a `false` means
   * another request got there first and this one must not establish a session.
   * An implementation that cannot distinguish the two must return `false`
   * rather than `true`, since a wrong `true` re-opens the double-session hole.
   */
  consumeToken?(token: string): boolean;

  /**
   * Begin a redirect-based flow; returns the URL to send the browser to (#1049).
   *
   * Distinct from `initiate()`, which performs a side effect and returns
   * nothing (magic-link sends an email). Here the URL *is* the result.
   *
   * Throws rather than returning a fallback when the flow cannot be started:
   * there is no sensible substitute for "where should the browser go", and an
   * empty string would send it nowhere with no error to explain why.
   */
  startFlow?(context: AuthInitiateContext): string;

  /**
   * Where the user was headed before this flow began, keyed by the flow's own
   * handle — a magic-link token, an OAuth state nonce (#1049).
   *
   * Must be read BEFORE `consumeToken()`, which deletes the entry.
   *
   * Returns `'/'` rather than throwing when the handle is unknown: losing the
   * destination degrades the landing page, it does not invalidate the sign-in,
   * and failing the login over it would be a worse outcome than the front page.
   */
  getFlowRedirect?(handle: string): string;

  /**
   * Create the account behind a first-time credential (#1049).
   *
   * Called before `verify()` on flows that provision on first sign-in, because
   * the account must exist before a session can name it.
   *
   * @returns true if an account was created or already existed; false if the
   *   handle is unusable — which the caller should treat as a failed sign-in.
   */
  provisionIfNew?(handle: string): Promise<boolean>;
}
