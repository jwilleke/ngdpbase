/**
 * The audit log's CSV export goes through the shared CSV writer: a value with a
 * quote or a comma stays one field, and a value that would run as a formula in
 * a spreadsheet is neutralised. Each test removes only its own temporary folder.
 */
vi.unmock('../FileAuditProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import FileAuditProvider from '../FileAuditProvider';

let dir: string;

function makeProvider() {
  const config: Record<string, unknown> = {
    'ngdpbase.audit.provider.file.logdirectory': dir,
    'ngdpbase.audit.provider.file.auditfilename': 'audit.log',
    'ngdpbase.audit.provider.file.archivefilename': 'audit-archive.log',
    'ngdpbase.audit.flushinterval': 100000
  };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager'
      ? { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d), getResolvedDataPath: () => dir }
      : null)
  } as never;
  return new FileAuditProvider(engine);
}

beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-audit-csv-')); });
afterEach(async () => { await fs.remove(dir); });

test('quotes, commas and formulas in a record stay safe in the CSV', async () => {
  const p = makeProvider();
  await p.initialize();
  await p.logAuditEvent({ eventType: 'page-edit', user: '=cmd|calc', reason: 'said "no", twice', result: 'success' });
  await p.flush();
  const csv = await p.exportAuditLogs({}, 'csv');
  const [header, row] = csv.split('\r\n');
  expect(header).toBe('timestamp,eventType,user,resource,action,result,severity,reason');
  expect(row).toContain(',page-edit,\'=cmd|calc,');
  expect(row).toContain(',"said ""no"", twice"');
});
