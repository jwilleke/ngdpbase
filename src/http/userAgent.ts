/**
 * The default `User-Agent` of outbound requests (#1947).
 *
 * Node's `http.request` adds no User-Agent, so before this every request from
 * `guardedFetch` went out without one, and APIs that require one refused it
 * (api.weather.gov answers 403). A caller that names its own User-Agent keeps
 * it; every other request gets the one built here.
 *
 * The value is configuration, `ngdpbase.http.user-agent`, a template read on
 * every request so an operator's change applies without a restart:
 *
 * - `{version}` is `ngdpbase.version`;
 * - `{base-url}` is `ngdpbase.application.base-url`, only when it was set
 *   explicitly. When it was not, the localhost default would be a wrong
 *   contact, so a parenthesised part holding `{base-url}` is left out,
 *   brackets and all (`ngdpbase/5.23.0 (+{base-url})` → `ngdpbase/5.23.0`);
 * - an empty template sends no default User-Agent.
 *
 * `guardedFetch` has no engine to read configuration from, so the engine hands
 * it the source at boot (`setUserAgentSource`), the way the log-redaction table
 * is filled. Until then, and in tests that set none, no default is added.
 */

export const USER_AGENT_KEY = 'ngdpbase.http.user-agent';

/** What reading the template needs from `ConfigurationManager`. */
export interface UserAgentConfig {
  getProperty(key: string, fallback?: unknown): unknown;
  isBaseUrlExplicit?(): boolean;
}

/** Fill a template. `baseUrl` null leaves out the part that names it. */
export function renderUserAgent(template: string, version: string, baseUrl: string | null): string {
  let out = template.split('{version}').join(version);
  out = baseUrl
    ? out.split('{base-url}').join(baseUrl)
    : out.replace(/\s*\([^()]*\{base-url\}[^()]*\)/g, '').split('{base-url}').join('');
  return out.trim();
}

/** The User-Agent the configuration asks for, '' for none. */
export function userAgentFromConfig(config: UserAgentConfig): string {
  const template = config.getProperty(USER_AGENT_KEY, '');
  if (typeof template !== 'string' || template.trim() === '') return '';
  const text = (key: string): string => {
    const value = config.getProperty(key, '');
    return typeof value === 'string' ? value : '';
  };
  const version = text('ngdpbase.version');
  const baseUrl = config.isBaseUrlExplicit?.() ? text('ngdpbase.application.base-url').replace(/\/+$/, '') : '';
  return renderUserAgent(template, version, baseUrl || null);
}

let source: (() => string) | null = null;

/** Set at boot by the engine; `null` clears it (tests). */
export function setUserAgentSource(next: (() => string) | null): void {
  source = next;
}

/** The default User-Agent now, '' when none is configured. */
export function defaultUserAgent(): string {
  return source ? source() : '';
}
