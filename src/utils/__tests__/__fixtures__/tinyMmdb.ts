/**
 * #1532 — the smallest MaxMind DB (`.mmdb`) the format allows, made at run
 * time for tests, so no GeoLite2 file (MaxMind's licence) is checked in.
 *
 * An IPv4 database with one node: addresses whose first bit is 0
 * (0.0.0.0/1, e.g. 81.2.69.160) map to `record`; the rest (128.0.0.0/1,
 * e.g. 203.0.113.9) have no data. The layout is the MaxMind DB spec's: the
 * search tree, 16 zero bytes, the data section, then the metadata marker and
 * the metadata map.
 */
type Value = string | number | Value[] | { [key: string]: Value };

function control(type: number, size: number): Buffer {
  if (size >= 29) throw new Error('tinyMmdb: values this small only');
  return type <= 7 ? Buffer.from([(type << 5) | size]) : Buffer.from([size, type - 7]);
}

function encode(value: Value): Buffer {
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([control(2, bytes.length), bytes]);
  }
  if (typeof value === 'number') {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(value);
    return Buffer.concat([control(6, 4), bytes]); // uint32
  }
  if (Array.isArray(value)) return Buffer.concat([control(11, value.length), ...value.map(encode)]);
  const entries = Object.entries(value);
  return Buffer.concat([control(7, entries.length), ...entries.flatMap(([k, v]) => [encode(k), encode(v)])]);
}

export function tinyMmdb(record: Record<string, Value>): Buffer {
  const nodeCount = 1;
  // 24-bit records: left → the data section's first byte (nodeCount + 16 + 0); right → nodeCount (no data).
  const tree = Buffer.from([0, 0, nodeCount + 16, 0, 0, nodeCount]);
  const metadata = encode({
    node_count: nodeCount,
    record_size: 24,
    ip_version: 4,
    database_type: 'GeoLite2-City',
    languages: ['en'],
    binary_format_major_version: 2,
    binary_format_minor_version: 0,
    build_epoch: 1_760_000_000,
    description: { en: 'ngdpbase test database' }
  });
  return Buffer.concat([tree, Buffer.alloc(16), encode(record), Buffer.from('ABCDEF4D61784D696E642E636F6D', 'hex'), metadata]);
}
