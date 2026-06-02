/**
 * Trivial dot-path lookup (#685) — the only "mapping engine" the framework has.
 * NO JSONPath dependency (design §7): `getByPath(obj, 'properties.mag')`,
 * `getByPath(obj, 'geometry.coordinates.2')` (numeric segment = array index).
 * Returns undefined for any missing segment.
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}
