/**
 * Test helper (#1892): write a plain SQLite file at `file` that opens and
 * reads, but fails `quick_check` — an index page overwritten in the middle,
 * the header left whole. Only for files in a test's own temp directory.
 */
import fs from 'node:fs';
import Database from 'better-sqlite3-multiple-ciphers';

export function damage(file: string): void {
  const db = new Database(file);
  db.exec('CREATE TABLE filler (id INTEGER PRIMARY KEY, v TEXT); CREATE INDEX filler_v ON filler(v);');
  const insert = db.prepare('INSERT INTO filler (v) VALUES (?)');
  for (let i = 0; i < 2000; i++) insert.run(`value-${i}-${'-'.repeat(50)}`);
  db.close();
  const bytes = fs.readFileSync(file);
  bytes.fill(0x5a, 4096 * 3 + 100, 4096 * 3 + 600);
  fs.writeFileSync(file, bytes);
}
