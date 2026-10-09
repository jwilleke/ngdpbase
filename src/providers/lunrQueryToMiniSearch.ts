/**
 * Lunr-style query strings, read as MiniSearch query trees (#1736).
 *
 * The search provider moved from Lunr to MiniSearch, but its callers still
 * speak Lunr's query language: the field-scoped search builds `+title:word`,
 * type-ahead appends `*` to the last term (`applyPrefixToLastTerm`), and a
 * person may type any of it into the search box. This keeps that language,
 * with the same meaning:
 *
 *   word          an optional term; with no required terms, any one matches
 *   +word         required: every result contains it
 *   -word         excluded: no result contains it
 *   field:word    only that field (an unknown field is read as plain text, so
 *                 a typed URL such as `https://x` is a search, not an error)
 *   word*         prefix match
 *   word~1        fuzzy match, up to that edit distance
 *
 * A term's `^boost` is accepted and ignored. When required terms are present,
 * optional terms no longer narrow the results (as in Lunr); they are not used
 * for ranking either.
 *
 * @module providers/lunrQueryToMiniSearch
 */

import MiniSearch, { type Query, type QueryCombination } from 'minisearch';

interface Term {
  presence: 'optional' | 'required' | 'excluded';
  field: string | null;
  text: string;
  prefix: boolean;
  fuzzy: number | false;
}

/** One whitespace-separated token as a term, or null when nothing searchable is left. */
function parseToken(token: string, fields: ReadonlySet<string>): Term | null {
  let rest = token;
  let presence: Term['presence'] = 'optional';
  if (rest.startsWith('+')) { presence = 'required'; rest = rest.slice(1); } else if (rest.startsWith('-')) { presence = 'excluded'; rest = rest.slice(1); }

  let field: string | null = null;
  const scoped = /^([A-Za-z][A-Za-z0-9]*):(.+)$/.exec(rest);
  if (scoped && fields.has(scoped[1])) {
    field = scoped[1];
    rest = scoped[2];
  }

  rest = rest.replace(/\^\d+(\.\d+)?$/, '');
  let fuzzy: Term['fuzzy'] = false;
  const fuzzyMatch = /~(\d+)?$/.exec(rest);
  if (fuzzyMatch) {
    fuzzy = fuzzyMatch[1] ? Number(fuzzyMatch[1]) : 1;
    rest = rest.slice(0, fuzzyMatch.index);
  }
  const prefix = rest.includes('*');
  // Lunr allowed a wildcard anywhere; a prefix up to the first `*` is the part
  // MiniSearch can honour.
  if (prefix) rest = rest.slice(0, rest.indexOf('*'));

  if (!/[\p{L}\p{N}]/u.test(rest)) return null;
  return { presence, field, text: rest, prefix, fuzzy };
}

function termQuery(term: Term): QueryCombination {
  return {
    queries: [term.text],
    ...(term.field ? { fields: [term.field] } : {}),
    prefix: term.prefix,
    fuzzy: term.fuzzy === false ? false : term.fuzzy,
    combineWith: 'AND'
  };
}

/**
 * The MiniSearch query for a Lunr-style string, or null when the string holds
 * nothing to search for.
 *
 * @param query  - the query as a caller or a person wrote it
 * @param fields - the indexed field names; a `field:` prefix naming another is plain text
 */
export function lunrQueryToMiniSearch(query: string, fields: readonly string[]): Query | null {
  const known = new Set(fields);
  const terms = query.trim().split(/\s+/).map((t) => parseToken(t, known)).filter((t): t is Term => t !== null);
  if (terms.length === 0) return null;

  const required = terms.filter((t) => t.presence === 'required').map(termQuery);
  const optional = terms.filter((t) => t.presence === 'optional').map(termQuery);
  const excluded = terms.filter((t) => t.presence === 'excluded').map(termQuery);

  let base: Query;
  if (required.length > 0) base = { combineWith: 'AND', queries: required };
  else if (optional.length > 0) base = { combineWith: 'OR', queries: optional };
  else base = MiniSearch.wildcard; // only exclusions: everything but them, as in Lunr

  return excluded.length > 0 ? { combineWith: 'AND_NOT', queries: [base, ...excluded] } : base;
}
