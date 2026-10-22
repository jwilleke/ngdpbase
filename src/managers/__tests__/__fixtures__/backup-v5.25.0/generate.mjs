// Generates the backup in this folder with the v5.25.0 code path, for #1985's compatibility test
// (BackupManager.v5250compat.test.ts). Kept as the record of how it was made; it needs a v5.25.0
// checkout that has been built (`npm ci && npm run build`), which the current code no longer is.
//
//   node generate.mjs <v5.25.0 checkout> <output folder> <scratch folder>
//
// It seeds a site in the scratch folder, starts the v5.25.0 managers over it (the forms, calendar
// and feeds add-on managers too) and writes one encrypted backup under the test-only key below.
import fs from 'node:fs';
import path from 'node:path';
const W = process.argv[2];
const OUT = process.argv[3];
const TMP = process.argv[4];
const imp = async (p) => (await import(path.join(W, p))).default;
process.env.NGDPBASE_BACKUP_KEY = 'backup-key-not-a-secret';
const dir = fs.mkdtempSync(path.join(TMP, 'site-'));
const fast = path.join(dir, 'fast'), slow = path.join(dir, 'slow');
const p = {
  roles: path.join(fast, 'roles'), persons: path.join(fast, 'persons'), organizations: path.join(fast, 'organizations'),
  footnotes: path.join(slow, 'footnotes'), comments: path.join(slow, 'comments'), jobs: path.join(fast, 'jobs'),
  credentials: path.join(fast, 'users', 'credentials.json'), forms: path.join(fast, 'forms'), calendar: path.join(fast, 'calendar'),
  feeds: path.join(fast, 'feeds'), backups: path.join(slow, 'backups'), siteRestore: path.join(fast, 'site-restore.json'),
  pool: path.join(slow, 'attachments'), metadata: path.join(slow, 'attachments', 'attachment-metadata.json'), pages: path.join(slow, 'pages')
};
for (const d of [p.roles, p.persons, p.organizations, p.footnotes, p.comments, path.dirname(p.credentials), p.forms, p.calendar, p.feeds, p.backups, p.pool, p.pages]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(p.organizations, 'acme.json'), JSON.stringify({ '@type': 'Organization', '@id': 'https://acme.example/#org', name: 'Acme v5.25.0' }));
fs.writeFileSync(path.join(p.persons, 'alice.json'), JSON.stringify({ '@type': 'Person', '@id': 'https://acme.example/people/alice#person', identifier: 'alice', name: 'Alice v5.25.0' }));
fs.writeFileSync(path.join(p.roles, 'editor.json'), JSON.stringify({ '@type': 'OrganizationRole', '@id': 'https://acme.example/roles/editor#role', namedPosition: 'editor', member: [{ '@id': 'https://acme.example/people/alice#person' }] }));
fs.writeFileSync(path.join(p.footnotes, 'page-1.json'), JSON.stringify({ f1: { id: 'f1', display: '1', url: '', note: 'footnote v5.25.0', createdBy: 'alice', createdAt: '2026-10-01T00:00:00Z' } }));
fs.mkdirSync(path.join(p.comments, 'page-1'));
fs.writeFileSync(path.join(p.comments, 'page-1', 'c1.json'), JSON.stringify({ id: 'c1', pageUuid: 'page-1', author: 'alice', content: 'comment v5.25.0', createdAt: '2026-10-01T00:00:00Z' }));
fs.writeFileSync(p.credentials, JSON.stringify({ version: 1, rows: [{ marker: 'credentials v5.25.0' }] }));
fs.mkdirSync(path.join(p.forms, 'definitions'), { recursive: true });
fs.mkdirSync(path.join(p.forms, 'submissions'), { recursive: true });
fs.writeFileSync(path.join(p.forms, 'definitions', 'contact.json'), JSON.stringify({ id: 'contact', title: 'Contact v5.25.0', fields: [] }));
fs.writeFileSync(path.join(p.calendar, 'club.json'), JSON.stringify({ marker: 'calendar v5.25.0' }));
fs.mkdirSync(path.join(p.feeds, 'quakes'), { recursive: true });
fs.writeFileSync(path.join(p.feeds, 'quakes', 'records.json'), JSON.stringify({ marker: 'feeds v5.25.0' }));
const ID = 'b'.repeat(64);
fs.writeFileSync(path.join(p.pool, `${ID}.txt`), 'pool file v5.25.0');
fs.writeFileSync(p.metadata, JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'ngdpbase Attachments', description: '', attachments: [{ '@context': 'https://schema.org', '@type': 'CreativeWork', identifier: ID, name: 'note.txt', dateCreated: '2026-10-01T00:00:00Z', dateModified: '2026-10-01T00:00:00Z', encodingFormat: 'text/plain', contentSize: 17, storageLocation: path.join(p.pool, `${ID}.txt`), mentions: [] }] }));
fs.writeFileSync(path.join(fast, '.env'), 'SOME_SETTING=v5.25.0\nNGDPBASE_BACKUP_KEY=backup-key-not-a-secret\n');

const resolved = {
  'ngdpbase.application.roles.storagedir': p.roles, 'ngdpbase.application.persons.storagedir': p.persons,
  'ngdpbase.application.organization.storagedir': p.organizations, 'ngdpbase.footnotes.storagedir': p.footnotes,
  'ngdpbase.comments.storagedir': p.comments, 'ngdpbase.jobs.state.dir': p.jobs, 'ngdpbase.auth.credentials.file': p.credentials,
  'ngdpbase.backup.directory': p.backups, 'ngdpbase.backup.restore-manifest': p.siteRestore,
  'ngdpbase.attachment.provider.basic.storagedir': p.pool, 'ngdpbase.attachment.metadatafile': p.metadata,
  'ngdpbase.page.provider.filesystem.storagedir': p.pages
};
const props = { 'ngdpbase.backup.max-backups': 10, 'ngdpbase.application-name': 'Test Site', 'ngdpbase.attachment.maxsize': 10485760, 'ngdpbase.attachment.allowedtypes': '' };
const configManager = {
  getProperty: (k, d) => (k in props ? props[k] : d),
  getResolvedDataPath: (k, d) => resolved[k] ?? path.join(fast, path.basename(d)),
  getInstanceDataFolder: () => fast, getAddonDatabaseDeclarations: () => [], setProperty: async () => undefined
};
const managers = {
  ConfigurationManager: configManager,
  NotificationManager: { addNotification: async () => 'id' },
  AuditManager: { logAuditEvent: async () => 'id', flushAuditQueue: async () => undefined }
};
const order = [];
const engine = { getManager: (n) => managers[n] ?? null, blockConfiguration: () => undefined, getRegisteredManagers: () => order };
const add = (n, m) => { managers[n] = m; order.push(n); };
for (const name of ['BackgroundJobManager', 'OrganizationManager', 'PersonManager', 'RoleManager', 'AttachmentManager', 'CommentManager', 'FootnoteManager']) {
  const C = await imp(`dist/src/managers/${name}.js`);
  const m = new C(engine); add(name, m); await m.initialize();
}
const Auth = await imp('dist/src/managers/AuthManager.js');
const auth = new Auth(engine); auth.credentialsFile = p.credentials; add('AuthManager', auth);
const Forms = await imp('addons/forms/managers/FormsDataManager.js');
const forms = new Forms(engine, p.forms); await forms.initialize(); add('FormsDataManager', forms);
const Cal = await imp('addons/calendar/managers/CalendarDataManager.js');
const cal = new Cal(engine, p.calendar); add('CalendarDataManager', cal);
const { FeedManager } = await import(path.join(W, 'addons/feeds/src/FeedManager.js'));
add('FeedManager', new FeedManager([], p.feeds, () => undefined));
fs.mkdirSync(path.join(p.jobs, 'runs'), { recursive: true });
fs.writeFileSync(path.join(p.jobs, 'runs', 'demo.json'), JSON.stringify([{ marker: 'jobs v5.25.0' }]));
fs.mkdirSync(path.join(p.jobs, 'locks'), { recursive: true });
fs.writeFileSync(path.join(p.jobs, 'locks', 'demo.lock'), 'held');
const BM = await imp('dist/src/managers/BackupManager.js');
const bm = new BM(engine); managers.BackupManager = bm; order.push('BackupManager'); await bm.initialize();
const file = await bm.createBackup({ username: 'admin', roles: ['admin'], isAuthenticated: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(p.backups)) fs.copyFileSync(path.join(p.backups, f), path.join(OUT, f));
console.log('wrote', file, fs.readdirSync(OUT));
for (const m of Object.values(managers)) await m.shutdown?.();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
