/**
 * The parse cache key carries the viewer (#1433).
 *
 * `parse-results` is one region shared by every reader of the process, so the
 * only thing separating two viewers is what the key says about them. The key
 * read a top-level `userName`, which `WikiContext.toParseOptions()` does not
 * set — it supplies `userContext` — so the field was `undefined` for every
 * viewer on the view path and the five preference values below carried the
 * whole separation by accident.
 *
 * That accident holds for a subject whose preferences are set and fails for one
 * whose are not: `admin` on a fresh install has none, identical to anonymous,
 * so the two hashed the same and shared one cached render. A page rendering
 * `${username}` served the admin's name to anonymous visitors; a page pulling
 * another page in through a plugin served whatever the first viewer was allowed
 * to see.
 */
import MarkupParser from '../MarkupParser';

const CONTENT = '# Cache Probe\n\nVIEWER=${username}\n';

/** Exactly the shape `WikiContext.toParseOptions()` returns for a view. */
function viewOptions(userContext: unknown) {
  const engine = { getManager: () => null };
  return {
    pageContext: {
      pageName: 'CacheProbe',
      userContext,
      requestInfo: { query: {} },
      themeContext: {},
      pageMetadata: {}
    },
    engine,
    wikiContext: {}
  } as never;
}

const ANONYMOUS = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };
/** A fresh install's admin: an account nobody has opened the profile of. */
const ADMIN_NO_PREFS = { username: 'admin', roles: ['admin'], isAuthenticated: true, preferences: {} };
/** An account whose preferences happen to differ — masked the bug before the fix. */
const USER_WITH_PREFS = {
  username: 'jim',
  roles: ['admin'],
  isAuthenticated: true,
  preferences: { locale: 'en-US', timezone: 'America/New_York', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' }
};

describe('#1433 parse cache key', () => {
  let parser: MarkupParser;
  let key: (userContext: unknown) => string;

  beforeEach(() => {
    parser = new MarkupParser({ getManager: () => null });
    key = (userContext: unknown) => parser.generateCacheKey(CONTENT, viewOptions(userContext));
  });

  test('an account with untouched preferences does not share anonymous\'s entry', () => {
    // The regression. Before the fix both sides hashed
    // {"pageName":"CacheProbe","query":{},"timestamp":N} — byte-identical.
    expect(key(ADMIN_NO_PREFS)).not.toBe(key(ANONYMOUS));
  });

  test('two different accounts do not share an entry', () => {
    expect(key(ADMIN_NO_PREFS)).not.toBe(key(USER_WITH_PREFS));
  });

  test('preferences are not what separates viewers', () => {
    // This passed before the fix too, by accident — it is here so that removing
    // the preference fields (they belong to #341/#537, not to identity) cannot
    // silently re-open the hole.
    expect(key(USER_WITH_PREFS)).not.toBe(key(ANONYMOUS));
  });

  test('the same viewer reuses their own entry — it is still a cache', () => {
    expect(key(ADMIN_NO_PREFS)).toBe(key(ADMIN_NO_PREFS));
    expect(key(ANONYMOUS)).toBe(key(ANONYMOUS));
  });

  test('the viewer is read from userContext, which is all the view path supplies', () => {
    // `toParseOptions()` sets no top-level `userName`. Reading only that field
    // is what produced `undefined` for everyone.
    const viaUserContext = key({ username: 'molly', roles: ['reader'], isAuthenticated: true });
    const viaAnonymous = key(ANONYMOUS);
    expect(viaUserContext).not.toBe(viaAnonymous);
  });
});
