/**
 * A page that belongs to a feature is not there while the feature is off (#1677).
 *
 * A shipped help page for capture still told readers to open `/capture/install`
 * on a site where capture is off, and that route answered 404. A page names
 * the switch it belongs to in frontmatter — `requires-setting:
 * ngdpbase.capture.enabled` — and while that setting is not `true`, reading the
 * page answers "not found" and listings leave it out, as profile already
 * leaves out its Captures row (#1004).
 *
 * One predicate, asked by both doors that decide a page: PageManager's
 * deciding read (so the reader gets the ordinary not-found) and the
 * PolicyInformationPoint's page tiers (so listings and every other caller of
 * the decider agree). Only `view` is affected; editing the page is unchanged.
 */

/** The frontmatter key naming the boolean setting a page belongs to. */
export const REQUIRES_SETTING = 'requires-setting';

interface SettingReader {
  getProperty(key: string, fallback: unknown): unknown;
}

/**
 * True when the page names a setting and that setting is not `true`.
 * A page naming no setting is never hidden. Without a configuration reader
 * nothing is hidden: absence of configuration is not a switch turned off.
 */
export function hiddenByFeature(
  metadata: Record<string, unknown> | null | undefined,
  config: SettingReader | null | undefined
): boolean {
  const key = metadata?.[REQUIRES_SETTING];
  if (typeof key !== 'string' || key.trim() === '' || !config) return false;
  return config.getProperty(key.trim(), false) !== true;
}
